import { describe, expect, it } from "vitest";
import { RELAY_GAIA_BASE, callJspb } from "../src/transport/relay.js";

describe("relay transport", () => {
  it("sends base headers plus per-call auth headers and surfaces Set-Cookie", async () => {
    let seen: { url: string; headers: Record<string, string> } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, headers: init.headers as Record<string, string> };
      const h = new Headers({ "Content-Type": "application/json+protobuf" });
      h.append("Set-Cookie", "SIDCC=new; Path=/");
      return new Response("[[null,\"1\"]]", { status: 200, headers: h });
    }) as unknown as typeof fetch;
    let cookies: string[] = [];
    const r = await callJspb(
      { base: RELAY_GAIA_BASE, apiKey: "test-key", fetchImpl, headers: () => ({ "X-Goog-AuthUser": "0" }), onSetCookie: (l) => (cookies = l) },
      "Messaging",
      "AckMessages",
      [],
    );
    expect(seen!.url).toBe("https://instantmessaging-pa.clients6.google.com/$rpc/google.internal.communications.instantmessaging.v1.Messaging/AckMessages");
    expect(seen!.headers["X-User-Agent"]).toBe("grpc-web-javascript/0.1");
    expect(seen!.headers["X-Goog-AuthUser"]).toBe("0");
    // referrer-restricted key (T-001): web-client origin on every relay call
    expect(seen!.headers.Origin).toBe("https://messages.google.com");
    expect(seen!.headers.Referer).toBe("https://messages.google.com/");
    expect(cookies).toEqual(["SIDCC=new; Path=/"]);
    expect(r).toEqual([[null, "1"]]);
  });
});

import { RelayError } from "../src/transport/relay.js";

describe("relay errors (T-001)", () => {
  it("include the gRPC status and a sanitized reason", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED", details: [{ reason: "API_KEY_HTTP_REFERRER_BLOCKED" }] } }), { status: 403 })) as unknown as typeof fetch;
    const err = await callJspb({ apiKey: "k", fetchImpl }, "Messaging", "SendMessage", []).catch((e) => e);
    expect(err).toBeInstanceOf(RelayError);
    expect(err.message).toBe("Messaging/SendMessage failed: HTTP 403 (PERMISSION_DENIED API_KEY_HTTP_REFERRER_BLOCKED)");
  });
});
