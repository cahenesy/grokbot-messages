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
    expect(cookies).toEqual(["SIDCC=new; Path=/"]);
    expect(r).toEqual([[null, "1"]]);
  });
});
