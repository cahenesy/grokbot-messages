import { describe, expect, it } from "vitest";
import { field, jspb } from "../src/protocol/jspb.js";
import { CONFIG_VERSION_2026_10_15, authMessageJspb } from "../src/protocol/auth.js";

describe("jspb", () => {
  it("places field n at index n-1 with null gaps", () => {
    expect(jspb({ 1: "a", 3: 7 })).toEqual(["a", null, 7]);
    expect(field(["a", null, 7], 2)).toBeUndefined();
  });

  it("builds AuthMessage f1/f3/f6 positions (§0.1 item 3)", () => {
    const m = authMessageJspb({ requestId: "rid", network: "Bugle", token: new Uint8Array([1, 2]) });
    expect(m).toEqual(["rid", null, "Bugle", null, null, "AQI="]);
  });

  it("places ConfigVersion at f3/f4/f5/f7/f9 [B@973382]", () => {
    const m = authMessageJspb({ network: "GDitto", requestId: "r", configVersion: CONFIG_VERSION_2026_10_15 });
    expect(m[6]).toEqual([null, null, 2026, 10, 15, null, 4, null, 6]);
  });
});
