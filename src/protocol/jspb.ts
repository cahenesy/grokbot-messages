// Positional JSON ("json+protobuf") helpers, per SPEC.md §3: index i holds field i+1,
// absent fields are null, bytes are base64, int64 values are decimal strings.

export type Jspb = (JspbValue)[];
export type JspbValue = null | boolean | number | string | Jspb;

/** Build a positional array from a {fieldNumber: value} map. Trailing nulls are omitted. */
export function jspb(fields: Record<number, JspbValue | undefined>): Jspb {
  const nums = Object.keys(fields).map(Number).filter((n) => fields[n] !== undefined);
  const max = nums.length ? Math.max(...nums) : 0;
  const arr: Jspb = new Array(max).fill(null);
  for (const n of nums) {
    if (!Number.isInteger(n) || n < 1) throw new RangeError(`bad field number ${n}`);
    arr[n - 1] = fields[n]!;
  }
  return arr;
}

export function field(msg: unknown, n: number): JspbValue | undefined {
  if (!Array.isArray(msg)) return undefined;
  const v = msg[n - 1];
  return v === null ? undefined : (v as JspbValue | undefined);
}

export const b64 = (b: Uint8Array): string => Buffer.from(b).toString("base64");
export const unb64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "base64"));
export const int64 = (v: number | bigint): string => BigInt(v).toString();
