// Schedules token refresh at 90% of lifetime with exponential backoff on retryable
// failures (SPEC.md §4.3, §11).

import { RelayError } from "../transport/relay.js";
import { RETRYABLE_GRPC_CODES, backoffMs, refreshAtMs, type TokenTiming } from "./schedule.js";

export interface RefresherDeps {
  /** Performs RegisterRefresh and persists the new token; returns the new timing. */
  refresh: () => Promise<TokenTiming>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => { cancel(): void };
  onError?: (e: unknown) => void;
  maxAttempts?: number;
}

export function isRetryable(e: unknown): boolean {
  if (e instanceof RelayError) return e.grpcStatus !== undefined ? RETRYABLE_GRPC_CODES.has(e.grpcStatus) : e.status >= 500;
  return e instanceof TypeError; // fetch network failure
}

const defaultTimer = (fn: () => void, ms: number) => {
  const t = setTimeout(fn, ms);
  t.unref?.();
  return { cancel: () => clearTimeout(t) };
};

export class TokenRefresher {
  private timer?: { cancel(): void };
  private stopped = false;

  constructor(private readonly d: RefresherDeps) {}

  start(t: TokenTiming): void {
    this.stopped = false;
    this.schedule(t);
  }

  stop(): void {
    this.stopped = true;
    this.timer?.cancel();
  }

  private schedule(t: TokenTiming): void {
    const now = (this.d.now ?? Date.now)();
    const delay = Math.max(0, refreshAtMs(t) - now);
    this.timer = (this.d.setTimer ?? defaultTimer)(() => void this.run(0), delay);
  }

  private async run(attempt: number): Promise<void> {
    if (this.stopped) return;
    try {
      this.schedule(await this.d.refresh());
    } catch (e) {
      this.d.onError?.(e);
      if (isRetryable(e) && attempt + 1 < (this.d.maxAttempts ?? 8)) {
        this.timer = (this.d.setTimer ?? defaultTimer)(() => void this.run(attempt + 1), backoffMs(attempt));
      }
    }
  }
}
