// Explicit per-message confirmation for outbound side effects (handoff README rule 6,
// IMPLEMENTATION-PLAN Phase 3). A send is first *prepared*, which returns a one-time
// confirmation code bound to the exact content; only a matching confirm call executes it.
// Default is deny: unknown, expired, reused or mismatched codes are rejected.

import { createHash, randomBytes } from "node:crypto";

export interface PendingSend {
  conversationId: string;
  text: string;
}

interface Entry {
  send: PendingSend;
  digest: string;
  expiresAt: number;
}

const digestOf = (s: PendingSend) => createHash("sha256").update(JSON.stringify([s.conversationId, s.text])).digest("hex");

export class ConfirmationGate {
  private entries = new Map<string, Entry>();

  constructor(private readonly ttlMs = 5 * 60_000, private readonly now: () => number = Date.now) {}

  prepare(send: PendingSend): { code: string; expiresAt: number } {
    this.sweep();
    const code = randomBytes(4).toString("hex");
    const expiresAt = this.now() + this.ttlMs;
    this.entries.set(code, { send: { ...send }, digest: digestOf(send), expiresAt });
    return { code, expiresAt };
  }

  /** Consumes the code. Throws unless it exists, is unexpired, and matches the content. */
  consume(code: string, send: PendingSend): PendingSend {
    this.sweep();
    const e = this.entries.get(code);
    this.entries.delete(code);
    if (!e) throw new Error("unknown or expired confirmation code; prepare the message again");
    if (e.digest !== digestOf(send)) throw new Error("message changed after it was confirmed; prepare it again");
    return e.send;
  }

  private sweep(): void {
    const t = this.now();
    for (const [k, e] of this.entries) if (e.expiresAt <= t) this.entries.delete(k);
  }
}
