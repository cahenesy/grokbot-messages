// QR pairing via the single-use page (SPEC §4.1; owner direction on #14).
// Keys and token stay in memory until the phone confirms (route-14 "paired" event);
// only then is the session persisted, so an abandoned attempt leaves nothing on disk (A-007 note).

import { DeviceKey } from "../crypto/deviceKey.js";
import { generatePayloadKeys } from "../crypto/payload.js";
import { BROWSER_TYPE_OTHER, decodeRegisterPhoneRelayResponse, encodeRegisterPhoneRelay, qrUrl, type PairedData } from "../protocol/pairing.js";
import type { SessionData } from "../session/store.js";
import type { ConfigVersion } from "../protocol/auth.js";
import type { PairingPageServer, PairingStatus } from "./pageServer.js";

/** Link lifetime. Must not exceed the server's QR expiry, whose field is still UNVERIFIED (Q-002). */
export const PAIRING_LINK_TTL_MS = 120_000;

export interface QrPairingDeps {
  page: PairingPageServer;
  /** Pairing/RegisterPhoneRelay (binary). */
  registerPhoneRelay: (body: Uint8Array) => Promise<Uint8Array>;
  /** Resolves with paired data from the stream, opened with the relay token (Q-004). */
  waitForPaired: (token: Uint8Array, signal: AbortSignal) => Promise<PairedData>;
  save: (s: SessionData) => Promise<void>;
  /** Pairing/RevokeRelayPairing for a pairing that completed after its link died (A-017). */
  revoke?: (p: PairedData) => Promise<void>;
  /** Diagnostics by kind/length only (A-017: "route 14 seen / f4 present / f4.4 length"). */
  onDiagnostic?: (d: { route14: true; f4Present: true; f4_4Length: number | undefined }) => void;
  userAgent: string;
  /** AuthMessage ConfigVersion (page build date, falling back to the pinned value; A-021). */
  configVersion: () => Promise<ConfigVersion>;
  onError?: (e: unknown) => void;
  now?: () => number;
}

export interface PairingStart {
  status: PairingStatus;
  link: string;
  expiresAt: string;
}

export class QrPairing {
  private abort?: AbortController;
  /** Increments per start(); an attempt may only save/finish while it is still the current generation. */
  private generation = 0;
  /** Set when start() fails before a link exists, so status reports "failed" rather than "none" (T-001 bug 2). */
  private startFailed = false;

  constructor(private readonly d: QrPairingDeps) {}

  async start(): Promise<PairingStart> {
    this.abort?.abort();
    const gen = ++this.generation;
    const isCurrent = () => gen === this.generation;
    const key = DeviceKey.generate();
    const payload = generatePayloadKeys();
    let res: ReturnType<typeof decodeRegisterPhoneRelayResponse>;
    try {
      res = decodeRegisterPhoneRelayResponse(
        await this.d.registerPhoneRelay(
          encodeRegisterPhoneRelay({
            browser: { userAgent: this.d.userAgent, browserType: BROWSER_TYPE_OTHER, os: "Linux" },
            spkiDer: key.spki(),
            configVersion: await this.d.configVersion(),
          }),
        ),
      );
    } catch (e) {
      if (isCurrent()) this.startFailed = true;
      throw e;
    }
    this.startFailed = false;
    const { link, expiresAt } = await this.d.page.open(qrUrl(res.pairingKey, payload.aesKey, payload.hmacKey), PAIRING_LINK_TTL_MS);

    const ac = new AbortController();
    this.abort = ac;
    const timer = setTimeout(() => ac.abort(), Math.max(0, expiresAt - (this.d.now ?? Date.now)()));
    timer.unref?.();
    void this.d
      .waitForPaired(res.token.token, ac.signal)
      .then(async (p) => {
        this.d.onDiagnostic?.({ route14: true, f4Present: true, f4_4Length: p.f4Length });
        if (!isCurrent() || ac.signal.aborted || this.d.page.status() !== "waiting") {
          // Superseded by a newer attempt, or its link expired/died before the phone confirmed:
          // revoke rather than keep (A-017), and never touch the newer attempt's page state.
          await this.d.revoke?.(p);
          return;
        }
        await this.d.save({
          version: 1,
          deviceKeyPkcs8: Buffer.from(key.pkcs8()).toString("base64"),
          aesKey: Buffer.from(payload.aesKey).toString("base64"),
          hmacKey: Buffer.from(payload.hmacKey).toString("base64"),
          token: Buffer.from(p.token.token).toString("base64"),
          tokenTtlMicros: p.token.ttlMicros.toString(),
          tokenReceivedAtMs: (this.d.now ?? Date.now)(),
          phone: p.phone,
          browser: p.browser,
        });
        if (isCurrent()) this.d.page.setStatus("paired");
      })
      .catch((e) => {
        if (!isCurrent()) return; // a stale attempt must not change the current attempt's status
        if (ac.signal.aborted) this.d.page.setStatus("expired");
        else {
          this.d.onError?.(e);
          this.d.page.setStatus("failed");
        }
      })
      .finally(() => clearTimeout(timer));

    return { status: "waiting", link, expiresAt: new Date(expiresAt).toISOString() };
  }

  status(): PairingStatus | undefined {
    if (this.startFailed) return "failed";
    return this.d.page.status();
  }

  cancel(): void {
    this.abort?.abort();
  }
}
