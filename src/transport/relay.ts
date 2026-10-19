// HTTPS calls to the Tachyon relay, SPEC.md §2–§3.

import { SpecGapError } from "../protocol/specGaps.js";

export const RELAY_QR_BASE = "https://instantmessaging-pa.googleapis.com"; // flag solGAe (§2)
export const RELAY_GAIA_BASE = "https://instantmessaging-pa.clients6.google.com"; // flag tkZp9e (§2, §0.1 item 1)
const RPC_PREFIX = "/$rpc/google.internal.communications.instantmessaging.v1.";

/**
 * The relay API key is referrer-restricted: without these Google returns 403 API_KEY_HTTP_REFERRER_BLOCKED
 * (T-001 on #16, VERIFIED-LIVE). Same origin as the Gaia hash (A-012).
 */
export const WEB_CLIENT_ORIGIN_HEADERS = { Origin: "https://messages.google.com", Referer: "https://messages.google.com/" } as const;

export type Service = "Pairing" | "Messaging" | "Registration";

export class RelayError extends Error {
  constructor(readonly status: number, readonly grpcStatus: number | undefined, message: string) {
    super(message);
    this.name = "RelayError";
  }
}

export interface RelayOptions {
  base?: string;
  /** X-Goog-Api-Key; which embedded key applies is Q-003. */
  apiKey?: string;
  fetchImpl?: typeof fetch;
  /** Per-call extra headers, e.g. cookie-mode auth from session/googleAuth.ts (never logged). */
  headers?: () => Record<string, string>;
  /** Receives Set-Cookie lines so refreshed cookies can be persisted (A-012). */
  onSetCookie?: (lines: string[]) => void;
}

/**
 * Builds a RelayError with the gRPC status and a short, sanitized reason (T-001 asked for the error kind/code).
 * Only the `grpc-message` header or a JSON error's `status`/`reason` are used; never request data.
 */
export async function relayError(res: Response, what: string): Promise<RelayError> {
  const grpc = res.headers.get("grpc-status");
  let reason = res.headers.get("grpc-message") ?? "";
  if (!reason) {
    try {
      const j = JSON.parse(await res.text()) as { error?: { status?: string; details?: Array<{ reason?: string }> } };
      reason = [j.error?.status, j.error?.details?.find((d) => d.reason)?.reason].filter(Boolean).join(" ");
    } catch {
      // non-JSON body: status code only
    }
  }
  let decoded = reason;
  try {
    decoded = decodeURIComponent(reason);
  } catch {
    // keep the raw header text
  }
  const safe = decoded.replace(/[^\w .:/-]/g, "").slice(0, 120);
  return new RelayError(res.status, grpc === null ? undefined : Number(grpc), `${what} failed: HTTP ${res.status}${safe ? ` (${safe})` : ""}`);
}

export function rpcUrl(base: string, service: Service, method: string): string {
  return `${base}${RPC_PREFIX}${service}/${method}`;
}

async function call(o: RelayOptions, service: Service, method: string, body: BodyInit, contentType: string): Promise<Response> {
  if (!o.apiKey) throw new SpecGapError("Q-003");
  const res = await (o.fetchImpl ?? fetch)(rpcUrl(o.base ?? RELAY_QR_BASE, service, method), {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "X-User-Agent": "grpc-web-javascript/0.1",
      "X-Goog-Api-Key": o.apiKey,
      ...WEB_CLIENT_ORIGIN_HEADERS,
      ...o.headers?.(),
    },
    body,
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) o.onSetCookie?.(setCookie);
  if (!res.ok) throw await relayError(res, `${service}/${method}`);
  return res;
}

/** Binary protobuf call (Pairing service). */
export async function callBinary(o: RelayOptions, service: Service, method: string, body: Uint8Array): Promise<Uint8Array> {
  const res = await call(o, service, method, new Uint8Array(body), "application/x-protobuf");
  return new Uint8Array(await res.arrayBuffer());
}

/** JSPB call (Messaging and Registration services). */
export async function callJspb(o: RelayOptions, service: Service, method: string, body: unknown): Promise<unknown> {
  const res = await call(o, service, method, JSON.stringify(body), "application/json+protobuf");
  return JSON.parse(await res.text()) as unknown;
}
