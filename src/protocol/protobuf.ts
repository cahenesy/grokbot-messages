// Minimal schema-less protobuf binary codec (wire types 0, 1, 2, 5).
// Written from the public protobuf encoding documentation, not from any client library.

export const WireType = { VARINT: 0, I64: 1, LEN: 2, I32: 5 } as const;

export type RawField =
  | { field: number; wire: 0; value: bigint }
  | { field: number; wire: 1; value: Uint8Array }
  | { field: number; wire: 2; value: Uint8Array }
  | { field: number; wire: 5; value: Uint8Array };

const utf8 = new TextEncoder();
const utf8d = new TextDecoder("utf-8", { fatal: true });

export class PbWriter {
  private chunks: number[] = [];

  private rawVarint(v: bigint): void {
    if (v < 0n) v = BigInt.asUintN(64, v);
    do {
      let byte = Number(v & 0x7fn);
      v >>= 7n;
      if (v !== 0n) byte |= 0x80;
      this.chunks.push(byte);
    } while (v !== 0n);
  }

  private tag(field: number, wire: number): void {
    if (!Number.isInteger(field) || field < 1) throw new RangeError(`bad field number ${field}`);
    this.rawVarint((BigInt(field) << 3n) | BigInt(wire));
  }

  varint(field: number, v: number | bigint | boolean): this {
    this.tag(field, WireType.VARINT);
    this.rawVarint(typeof v === "boolean" ? (v ? 1n : 0n) : BigInt(v));
    return this;
  }

  bytes(field: number, b: Uint8Array): this {
    this.tag(field, WireType.LEN);
    this.rawVarint(BigInt(b.length));
    for (const x of b) this.chunks.push(x);
    return this;
  }

  string(field: number, s: string): this {
    return this.bytes(field, utf8.encode(s));
  }

  message(field: number, m: PbWriter): this {
    return this.bytes(field, m.finish());
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.chunks);
  }
}

export function decode(buf: Uint8Array): RawField[] {
  const out: RawField[] = [];
  let pos = 0;

  const readVarint = (): bigint => {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      if (pos >= buf.length) throw new RangeError("truncated varint");
      const b = buf[pos++]!;
      result |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) return result;
      shift += 7n;
      if (shift > 63n) throw new RangeError("varint too long");
    }
  };
  const take = (n: number): Uint8Array => {
    if (pos + n > buf.length) throw new RangeError("truncated field");
    const v = buf.subarray(pos, pos + n);
    pos += n;
    return v;
  };

  while (pos < buf.length) {
    const key = readVarint();
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);
    if (field < 1) throw new RangeError("field number 0");
    switch (wire) {
      case 0: out.push({ field, wire, value: readVarint() }); break;
      case 1: out.push({ field, wire, value: take(8) }); break;
      case 2: out.push({ field, wire, value: take(Number(readVarint())) }); break;
      case 5: out.push({ field, wire, value: take(4) }); break;
      default: throw new RangeError(`unsupported wire type ${wire}`);
    }
  }
  return out;
}

/** First occurrence of a length-delimited field, or undefined. */
export function getBytes(fields: RawField[], n: number): Uint8Array | undefined {
  const f = fields.find((x) => x.field === n && x.wire === 2);
  return f?.value as Uint8Array | undefined;
}

export function getString(fields: RawField[], n: number): string | undefined {
  const b = getBytes(fields, n);
  return b === undefined ? undefined : utf8d.decode(b);
}

export function getVarint(fields: RawField[], n: number): bigint | undefined {
  const f = fields.find((x) => x.field === n && x.wire === 0);
  return f?.value as bigint | undefined;
}

export function getMessage(fields: RawField[], n: number): RawField[] | undefined {
  const b = getBytes(fields, n);
  return b === undefined ? undefined : decode(b);
}

/** All occurrences of a length-delimited field (repeated). */
export function getAllBytes(fields: RawField[], n: number): Uint8Array[] {
  return fields.filter((x) => x.field === n && x.wire === 2).map((x) => x.value as Uint8Array);
}

export const getAllMessages = (fields: RawField[], n: number): RawField[][] => getAllBytes(fields, n).map(decode);

/** Lowest field number present among `candidates` (for oneofs). */
export function oneofCase(fields: RawField[], candidates: readonly number[]): number | undefined {
  const present = new Set(fields.map((f) => f.field));
  return candidates.find((c) => present.has(c));
}
