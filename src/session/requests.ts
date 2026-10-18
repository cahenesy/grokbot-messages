// Matches phone responses (arriving on ReceiveMessages) to outstanding requests by
// request ID (SPEC.md §6.2).

export class RequestTimeoutError extends Error {
  constructor(readonly requestId: string, readonly action: number) {
    super(`action ${action} request ${requestId} timed out`);
    this.name = "RequestTimeoutError";
  }
}

interface Pending<T> {
  action: number;
  resolve: (v: T) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

export class RequestTracker<T> {
  private pending = new Map<string, Pending<T>>();

  wait(requestId: string, action: number, timeoutMs: number): Promise<T> {
    if (this.pending.has(requestId)) throw new Error(`duplicate request id ${requestId}`);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new RequestTimeoutError(requestId, action));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(requestId, { action, resolve, reject, timer });
    });
  }

  /** Returns false when the ID is unknown (e.g. an unsolicited push from the phone). */
  resolve(requestId: string, value: T): boolean {
    const p = this.pending.get(requestId);
    if (!p) return false;
    clearTimeout(p.timer);
    this.pending.delete(requestId);
    p.resolve(value);
    return true;
  }

  rejectAll(e: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(e);
    }
    this.pending.clear();
  }

  get size(): number {
    return this.pending.size;
  }
}
