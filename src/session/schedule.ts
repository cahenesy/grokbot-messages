// Token refresh timing, SPEC.md §4.3: scheduled refresh at 90% of lifetime,
// pre-call refresh once 95% has elapsed; retries back off exponentially from 1000 ms.

export interface TokenTiming {
  receivedAtMs: number;
  ttlMicros: bigint;
}

const ttlMs = (t: TokenTiming): number => Number(t.ttlMicros / 1000n);

export const refreshAtMs = (t: TokenTiming): number => t.receivedAtMs + ttlMs(t) * 0.9;
export const expiresAtMs = (t: TokenTiming): number => t.receivedAtMs + ttlMs(t);
export const needsPreCallRefresh = (t: TokenTiming, nowMs: number): boolean => nowMs >= t.receivedAtMs + ttlMs(t) * 0.95;
export const backoffMs = (attempt: number, baseMs = 1000): number => baseMs * 2 ** attempt;

/** gRPC codes treated as retryable (§11): CANCELLED, UNKNOWN, DEADLINE_EXCEEDED, ABORTED, INTERNAL, UNAVAILABLE. */
export const RETRYABLE_GRPC_CODES: ReadonlySet<number> = new Set([1, 2, 4, 10, 13, 14]);
