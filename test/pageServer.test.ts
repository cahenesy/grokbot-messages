import { afterEach, describe, expect, it } from "vitest";
import { PairingPageServer, validatePublicBaseUrl } from "../src/pairing/pageServer.js";

let srv: PairingPageServer | undefined;
afterEach(async () => {
  await srv?.close();
  srv = undefined;
});

// Fixture payload only — not a real pairing key.
const FAKE_QR = "https://example.invalid/#?c=ZmFrZS1maXh0dXJl";

describe("pairing page server", () => {
  it("serves the QR only at the secret link, with no-store and strict CSP", async () => {
    srv = new PairingPageServer();
    await srv.start();
    const { link } = await srv.open(FAKE_QR, 60_000);
    const res = await fetch(link);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    const html = await res.text();
    expect(html).toContain("<svg");
    expect(html).not.toContain("ZmFrZS1maXh0dXJl"); // payload only as QR modules, not text
    expect(await (await fetch(`${link}/status`)).json()).toEqual({ status: "waiting" });

    const wrong = link.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    expect((await fetch(wrong)).status).toBe(404);
    expect((await fetch(new URL("/", link))).status).toBe(404);
    expect((await fetch(link, { method: "POST" })).status).toBe(405);
  });

  it("drops the QR once paired (single use)", async () => {
    srv = new PairingPageServer();
    await srv.start();
    const { link } = await srv.open(FAKE_QR, 60_000);
    srv.setStatus("paired");
    const html = await (await fetch(link)).text();
    expect(html).not.toContain("<svg");
    expect(html).toContain("Paired");
    expect(srv.status()).toBe("paired");
  });

  it("expires and stops showing the QR", async () => {
    let now = 1000;
    srv = new PairingPageServer({ now: () => now });
    await srv.start();
    const { link } = await srv.open(FAKE_QR, 5000);
    now = 6000;
    expect(await (await fetch(`${link}/status`)).json()).toEqual({ status: "expired" });
    expect(await (await fetch(link)).text()).not.toContain("<svg");
  });

  it("a new attempt invalidates the previous link", async () => {
    srv = new PairingPageServer();
    await srv.start();
    const first = await srv.open(FAKE_QR, 60_000);
    await srv.open(FAKE_QR, 60_000);
    expect((await fetch(first.link)).status).toBe(404);
  });

  it("requires https for non-loopback public base URLs", () => {
    expect(() => validatePublicBaseUrl("http://example.com")).toThrow(/https/);
    expect(validatePublicBaseUrl("http://127.0.0.1:9").hostname).toBe("127.0.0.1");
    expect(validatePublicBaseUrl("https://pair.example.com").protocol).toBe("https:");
  });
});
