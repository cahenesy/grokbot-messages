import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { EMOJI_ORIGINAL, EMOJI_REV1, verificationCode } from "../src/pairing/verificationCode.js";

const sha = (l: readonly string[]) => createHash("sha256").update(l.join("\n"), "utf8").digest("hex");

describe("verification code (A-015)", () => {
  it("tables match the spec team's check values", () => {
    expect(EMOJI_ORIGINAL.length).toBe(305);
    expect(EMOJI_REV1.length).toBe(308);
    expect(EMOJI_ORIGINAL[133]).toBe("\u{1F35E}");
    expect(EMOJI_ORIGINAL[288]).toBe("\u{1F35E}");
    const o = sha(EMOJI_ORIGINAL);
    const r = sha(EMOJI_REV1);
    expect([o.slice(0, 8), o.slice(-6)]).toEqual(["8bc36ba7", "3d1a93"]);
    expect([r.slice(0, 8), r.slice(-6)]).toEqual(["319ee7cb", "a8933e"]);
  });

  it("auth key 00..1f → n = 66051: original 🏰 (171), rev1 🍦 (139), digits 151", () => {
    const key = Uint8Array.from({ length: 32 }, (_, i) => i);
    expect(verificationCode(key, 0)).toEqual({ emoji: EMOJI_ORIGINAL[171], digits: "151" });
    expect(EMOJI_ORIGINAL[171]).toBe("🏰");
    expect(verificationCode(key, 1).emoji).toBe("🍦");
    expect(EMOJI_REV1[139]).toBe("🍦");
    expect(() => verificationCode(key, 2)).toThrow();
  });
});
