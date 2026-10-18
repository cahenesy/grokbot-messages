import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../src/session/store.js";

describe("SessionStore", () => {
  it("round-trips and never writes plaintext", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "gbm-")), "s.json");
    const store = new SessionStore(path, "correct horse battery staple");
    const data = { version: 1 as const, deviceKeyPkcs8: "a", aesKey: "b", hmacKey: "c", token: "SECRET-TOKEN" };
    expect(await store.load()).toBeUndefined();
    await store.save(data);
    expect(await readFile(path, "utf8")).not.toContain("SECRET-TOKEN");
    expect(await store.load()).toEqual(data);
    await expect(new SessionStore(path, "wrong passphrase 123456").load()).rejects.toThrow(/decrypted/);
  });
});

import { requireEnv } from "../src/session/store.js";

describe("requireEnv", () => {
  it("fails closed on unset or unexpanded placeholders", () => {
    expect(() => requireEnv({}, "X")).toThrow(/not set/);
    expect(() => requireEnv({ X: "${GOOGLE_MESSAGES_SESSION_KEY}" }, "X")).toThrow(/placeholder/);
    expect(() => requireEnv({ X: "$GOOGLE_MESSAGES_SESSION_KEY" }, "X")).toThrow(/placeholder/);
    expect(requireEnv({ X: " real-value " }, "X")).toBe("real-value");
  });

  it("rejects a repetitive passphrase", () => {
    expect(() => new SessionStore("/tmp/x", "aaaaaaaaaaaaaaaaaaaa")).toThrow(/repetitive/);
  });
});
