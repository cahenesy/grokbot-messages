// Long-lived Messaging/ReceiveMessages stream (SPEC.md §3 "Streaming", §8).
// Each stream element is an object where "1" carries a response and "2" a status/trailer.

import { SpecGapError } from "../protocol/specGaps.js";
import { RELAY_QR_BASE, RelayError, rpcUrl, type RelayOptions } from "./relay.js";
import { JsonArrayStreamSplitter } from "./streamSplitter.js";

export interface StreamElement {
  response?: unknown; // key "1"
  status?: unknown; // key "2"
}

export function toStreamElement(v: unknown): StreamElement {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return { response: o["1"], status: o["2"] };
  }
  // Positional form: [response, status]
  if (Array.isArray(v)) return { response: v[0] ?? undefined, status: v[1] ?? undefined };
  throw new Error("unrecognised stream element");
}

export interface ReceiveOptions extends RelayOptions {
  /** Request body; its layout is Q-004 (part 3). */
  body?: unknown;
  signal?: AbortSignal;
}

/** Opens one stream and yields elements until the server closes it. */
export async function* receiveMessages(o: ReceiveOptions): AsyncGenerator<StreamElement> {
  if (!o.apiKey) throw new SpecGapError("Q-003");
  if (o.body === undefined) throw new SpecGapError("Q-004");
  const res = await (o.fetchImpl ?? fetch)(rpcUrl(o.base ?? RELAY_QR_BASE, "Messaging", "ReceiveMessages"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json+protobuf",
      "X-User-Agent": "grpc-web-javascript/0.1",
      "X-Goog-Api-Key": o.apiKey,
      ...o.headers?.(),
    },
    body: JSON.stringify(o.body),
    signal: o.signal,
  });
  if (!res.ok || !res.body) {
    const grpc = res.headers.get("grpc-status");
    throw new RelayError(res.status, grpc === null ? undefined : Number(grpc), `ReceiveMessages failed: HTTP ${res.status}`);
  }
  const splitter = new JsonArrayStreamSplitter();
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    for (const el of splitter.push(decoder.decode(chunk, { stream: true }))) yield toStreamElement(el);
    if (splitter.done) return;
  }
}
