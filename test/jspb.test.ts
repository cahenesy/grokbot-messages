import { describe, expect, it } from "vitest";
import { field, jspb } from "../src/protocol/jspb.js";
import { authMessageJspb } from "../src/protocol/auth.js";
import { SpecGapError } from "../src/protocol/specGaps.js";

describe("jspb", () => {
  it("places field n at index n-1 with null gaps", () => {
    expect(jspb({ 1: "a", 3: 7 })).toEqual(["a", null, 7]);
    expect(field(["a", null, 7], 2)).toBeUndefined();
  });

  it("builds AuthMessage f1/f3/f6 positions (§0.1 item 3)", () => {
    const m = authMessageJspb({ requestId: "rid", network: "Bugle", token: new Uint8Array([1, 2]) });
    expect(m).toEqual(["rid", null, "Bugle", null, null, "AQI="]);
  });

  it("refuses to guess ConfigVersion field numbers", () => {
    expect(() =>
      authMessageJspb({ network: "Bugle", configVersion: { year: 2026, month: 10, day: 15, v1: 4, v2: 6 } }),
    ).toThrow(SpecGapError);
  });
});
