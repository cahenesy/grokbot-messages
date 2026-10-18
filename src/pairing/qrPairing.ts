// QR pairing via the single-use page (SPEC §4.1; owner direction on #14).
// Keys and token stay in memory until the phone confirms (route-14 "paired" event);
// only then is the session persisted, so an abandoned attempt leaves nothing on disk (A-007 note).

import { DeviceKey } from "../crypto/deviceKey.js";
import { generatePayloadKeys } from "../crypto/payload.js";
import { BROWSER_TYPE_OTHER, decodeRegisterPhoneRelayResponse, encodeRegisterPhoneRelay, qrUrl, type PairedData } from "../protocol/pairing.js";
import type { SessionData } from "../session/store.js";
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
  userAgent: string;
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

  constructor(private readonly d: QrPairingDeps) {}

  async start(): Promise<PairingStart> {
    this.abort?.abort();
    const key = DeviceKey.generate();
    const payload = generatePayloadKeys();
    const res = decodeRegisterPhoneRelayResponse(
      await this.d.registerPhoneRelay(
        encodeRegisterPhoneRelay({ browser: { userAgent: this.d.userAgent, browserType: BROWSER_TYPE_OTHER, os: "Linux" }, spkiDer: key.spki() }),
      ),
    );
    const { link, expiresAt } = await this.d.page.open(qrUrl(res.pairingKey, payload.aesKey, payload.hmacKey), PAIRING_LINK_TTL_MS);

    const ac = new AbortController();
    this.abort = ac;
    const timer = setTimeout(() => ac.abort(), Math.max(0, expiresAt - (this.d.now ?? Date.now)()));
    timer.unref?.();
    void this.d
      .waitForPaired(res.token.token, ac.signal)
      .then(async (p) => {
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
        this.d.page.setStatus("paired");
      })
      .catch((e) => {
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
    return this.d.page.status();
  }

  cancel(): void {
    this.abort?.abort();
  }
}
