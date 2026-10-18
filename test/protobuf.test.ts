import { describe, expect, it } from "vitest";
import { PbWriter, decode, getBytes, getMessage, getString, getVarint } from "../src/protocol/protobuf.js";

describe("protobuf codec", () => {
  it("encodes the canonical varint example (field 1 = 150)", () => {
    expect(Buffer.from(new PbWriter().varint(1, 150).finish()).toString("hex")).toBe("089601");
  });

  it("round-trips strings, bytes, nested messages and 64-bit varints", () => {
    const inner = new PbWriter().string(2, "src").varint(1, 16);
    const buf = new PbWriter().message(4, inner).bytes(3, new Uint8Array([0, 255])).varint(5, 86400000000n).finish();
    const f = decode(buf);
    expect(getVarint(f, 5)).toBe(86400000000n);
    expect([...getBytes(f, 3)!]).toEqual([0, 255]);
    const n = getMessage(f, 4)!;
    expect(getString(n, 2)).toBe("src");
    expect(getVarint(n, 1)).toBe(16n);
  });

  it("rejects truncated input", () => {
    expect(() => decode(new Uint8Array([0x0a, 0x05, 0x01]))).toThrow(/truncated/);
  });
});
