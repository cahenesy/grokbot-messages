// HTTPS calls to the Tachyon relay, SPEC.md §2–§3.

import { SpecGapError } from "../protocol/specGaps.js";

export const RELAY_QR_BASE = "https://instantmessaging-pa.googleapis.com"; // flag solGAe
const RPC_PREFIX = "/$rpc/google.internal.communications.instantmessaging.v1.";

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
    },
    body,
  });
  if (!res.ok) {
    const grpc = res.headers.get("grpc-status");
    throw new RelayError(res.status, grpc === null ? undefined : Number(grpc), `${service}/${method} failed: HTTP ${res.status}`);
  }
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
