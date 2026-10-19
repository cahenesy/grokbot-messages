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
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    expect(setCookie).not.toMatch(/Secure/); // loopback base
    const cookie = setCookie.split(";")[0]!;
    expect(await (await fetch(`${link}/status`, { headers: { cookie } })).json()).toEqual({ status: "waiting" });

    const wrong = link.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    expect((await fetch(wrong)).status).toBe(404);
    expect((await fetch(new URL("/", link))).status).toBe(404);
    expect((await fetch(link, { method: "POST" })).status).toBe(405);
  });

  it("drops the QR once paired (single use)", async () => {
    srv = new PairingPageServer();
    await srv.start();
    const { link } = await srv.open(FAKE_QR, 60_000);
    const cookie = (await fetch(link)).headers.get("set-cookie")!.split(";")[0]!;
    srv.setStatus("paired");
    const html = await (await fetch(link, { headers: { cookie } })).text();
    expect(html).not.toContain("<svg");
    expect(html).toContain("Paired");
    expect(srv.status()).toBe("paired");
  });

  it("expires and stops showing the QR", async () => {
    let now = 1000;
    srv = new PairingPageServer({ now: () => now });
    await srv.start();
    const { link } = await srv.open(FAKE_QR, 5000);
    const cookie = (await fetch(link)).headers.get("set-cookie")!.split(";")[0]!;
    now = 6000;
    expect(await (await fetch(`${link}/status`, { headers: { cookie } })).json()).toEqual({ status: "expired" });
    expect(await (await fetch(link, { headers: { cookie } })).text()).not.toContain("<svg");
    expect(srv.status()).toBe("expired");
  });

  it("binds to the first opener; other browsers get no QR (A-014)", async () => {
    srv = new PairingPageServer();
    await srv.start();
    const { link } = await srv.open(FAKE_QR, 60_000);
    // HEAD and link previews do not claim the link.
    expect((await fetch(link, { method: "HEAD" })).status).toBe(200);
    const preview = await (await fetch(link, { headers: { "user-agent": "Slackbot-LinkExpanding 1.0" } })).text();
    expect(preview).not.toContain("<svg");
    // First real browser claims it.
    const first = await fetch(link, { headers: { "user-agent": "Mozilla/5.0" } });
    expect(await first.text()).toContain("<svg");
    const cookie = first.headers.get("set-cookie")!.split(";")[0]!;
    // A second browser without the cookie is refused.
    const other = await (await fetch(link, { headers: { "user-agent": "Mozilla/5.0" } })).text();
    expect(other).not.toContain("<svg");
    expect(other).toContain("already opened");
    expect((await fetch(`${link}/status`)).status).toBe(403);
    expect((await fetch(link, { headers: { cookie: "gm_pair=forged" } })).headers.get("set-cookie")).toBeNull();
    // The opener still sees it.
    expect(await (await fetch(link, { headers: { cookie } })).text()).toContain("<svg");
  });

  it("marks the opener cookie Secure behind an https base URL", async () => {
    srv = new PairingPageServer({ publicBaseUrl: "https://pair.example.invalid" });
    await srv.start();
    const { link } = await srv.open(FAKE_QR, 60_000);
    expect(link.startsWith("https://pair.example.invalid/pair/")).toBe(true);
    const local = `http://127.0.0.1:${(srv as unknown as { server: { address(): { port: number } } }).server.address().port}${new URL(link).pathname}`;
    expect((await fetch(local)).headers.get("set-cookie")).toMatch(/; Secure/);
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

describe("expired opener (T-001 bug 3)", () => {
  it("shows 'expired' after the opener's cookie lapses, not 'already opened'", async () => {
    let now = 1000;
    srv = new PairingPageServer({ now: () => now });
    await srv.start();
    const { link } = await srv.open(FAKE_QR, 5000);
    await fetch(link); // claim
    now = 7000;
    const html = await (await fetch(link)).text(); // cookie dropped by the browser
    expect(html).toContain("expired");
    expect(html).not.toContain("already opened");
  });
});
