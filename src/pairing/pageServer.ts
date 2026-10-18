// Single-use, short-lived pairing page (owner direction, revised A-012 on #14).
// The connector serves the QR here; the MCP tool only ever returns the link and a status.
// The QR (image, URL, c= payload) carries the long-lived payload keys (SPEC §4.1 step 3), so it
// lives only in memory, is never logged, and is dropped on success or expiry.

import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import QRCode from "qrcode";

export type PairingStatus = "waiting" | "paired" | "expired" | "failed";

export interface PageServerOptions {
  /** Interface to bind; loopback by default. */
  bindHost?: string;
  port?: number;
  /** Public base URL the user's browser reaches this server at (e.g. a host-provided HTTPS URL). */
  publicBaseUrl?: string;
  now?: () => number;
}

interface Attempt {
  token: string; // base64url of 32 random bytes; compared as text so the encoding is canonical
  qrSvg?: string; // cleared on success/expiry/failure
  expiresAt: number;
  status: PairingStatus;
  /** Cookie value of the first browser to open the link (A-014: bind to first opener). */
  opener?: string;
}

const OPENER_COOKIE = "gm_pair";

/** Link-preview and crawler fetchers must not claim the link (A-014). */
const PREVIEW_UA = /bot|crawler|spider|preview|facebookexternalhit|embedly|slack|discord|telegram|whatsapp|skype|linkedin|vkshare|pinterest|quora|outbrain|bitly|google-?read-?aloud/i;

function cookieValue(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const isLoopback = (h: string) => h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";

/** Refuses a non-loopback http base: the page carries payload keys. */
export function validatePublicBaseUrl(u: string): URL {
  const url = new URL(u);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname)))
    throw new Error("GOOGLE_MESSAGES_PAIRING_BASE_URL must be https (plain http is allowed only for loopback)");
  return url;
}

const SECURITY_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
} as const;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CLAIMED = "This pairing link was already opened in another browser. Ask for a new link.";
const PREVIEW = "Open this link in your browser to pair Google Messages.";

const MESSAGES: Record<PairingStatus, string> = {
  waiting: "Open Google Messages on your phone → Device pairing → QR code scanner, and scan this code.",
  paired: "Paired. You can close this page.",
  expired: "This pairing link has expired. Ask for a new one.",
  failed: "Pairing failed. Ask for a new link.",
};

function page(status: PairingStatus, qrSvg: string | undefined, nonce: string, override?: string): string {
  const qr = !override && status === "waiting" && qrSvg ? `<div class="qr">${qrSvg}</div>` : "";
  const poll = !override && status === "waiting";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Pair Google Messages</title>
<style nonce="${nonce}">body{font:16px system-ui,sans-serif;margin:0;padding:24px 16px;background:#fff;color:#111;display:flex;flex-direction:column;align-items:center;gap:16px}
.qr svg{width:min(320px,80vw);height:auto;background:#fff;padding:8px}p{max-width:32em;text-align:center}
@media (prefers-color-scheme:dark){body{background:#111;color:#eee}}</style></head>
<body><h1>Pair Google Messages</h1>${qr}<p id="msg">${escapeHtml(override ?? MESSAGES[status])}</p>
<script nonce="${nonce}">${poll ? `(function(){var s=location.pathname+"/status";function t(){fetch(s,{cache:"no-store"}).then(function(r){return r.ok?r.json():{status:"expired"}}).then(function(j){if(j.status==="waiting"){setTimeout(t,2000);return}location.reload()}).catch(function(){setTimeout(t,4000)})}setTimeout(t,2000)})();` : ""}</script>
</body></html>`;
}

export class PairingPageServer {
  private server?: Server;
  private attempt?: Attempt;
  private readonly now: () => number;
  private readonly secureCookie: boolean;

  constructor(private readonly o: PageServerOptions = {}) {
    this.now = o.now ?? Date.now;
    this.secureCookie = o.publicBaseUrl ? validatePublicBaseUrl(o.publicBaseUrl).protocol === "https:" : false;
  }

  async start(): Promise<void> {
    if (this.server) return;
    this.server = createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.o.port ?? 0, this.o.bindHost ?? "127.0.0.1", () => resolve());
    });
  }

  async close(): Promise<void> {
    this.clear();
    const s = this.server;
    this.server = undefined;
    if (s) await new Promise<void>((r) => s.close(() => r()));
  }

  private baseUrl(): string {
    if (this.o.publicBaseUrl) return this.o.publicBaseUrl.replace(/\/+$/, "");
    const a = this.server!.address() as AddressInfo;
    const host = a.family === "IPv6" ? `[${a.address}]` : a.address;
    return `http://${host}:${a.port}`;
  }

  /** Starts a new attempt (replacing any previous one). Returns the link; never the QR. */
  async open(qrUrl: string, ttlMs: number): Promise<{ link: string; expiresAt: number }> {
    if (!this.server) throw new Error("pairing page server not started");
    const token = randomBytes(32).toString("base64url");
    const qrSvg = await QRCode.toString(qrUrl, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
    const expiresAt = this.now() + ttlMs;
    this.attempt = { token, qrSvg, expiresAt, status: "waiting" };
    return { link: `${this.baseUrl()}/pair/${token}`, expiresAt };
  }

  status(): PairingStatus | undefined {
    this.expireIfDue();
    return this.attempt?.status;
  }

  /** Final states drop the QR immediately (single use). */
  setStatus(s: Exclude<PairingStatus, "waiting">): void {
    if (!this.attempt) return;
    this.attempt.status = s;
    this.attempt.qrSvg = undefined;
  }

  private clear(): void {
    if (this.attempt) this.attempt.qrSvg = undefined;
    this.attempt = undefined;
  }

  private expireIfDue(): void {
    const a = this.attempt;
    if (a && a.status === "waiting" && this.now() >= a.expiresAt) this.setStatus("expired");
  }

  private matches(tokenPart: string): boolean {
    const a = this.attempt;
    if (!a) return false;
    const given = Buffer.from(tokenPart);
    const want = Buffer.from(a.token);
    return given.length === want.length && timingSafeEqual(given, want);
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const send = (code: number, type: string, body: string, extra: Record<string, string> = {}) => {
      res.writeHead(code, { ...SECURITY_HEADERS, "Content-Type": type, ...extra });
      res.end(body);
    };
    const html = (body: string, extra: Record<string, string> = {}, nonce?: string) => {
      const n = nonce ?? randomBytes(16).toString("base64");
      const csp = `default-src 'none'; script-src 'nonce-${n}'; style-src 'nonce-${n}'; img-src data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`;
      send(200, "text/html; charset=utf-8", body, { "Content-Security-Policy": csp, ...extra });
    };
    // HEAD (and anything but GET) never claims the link (A-014).
    if (req.method === "HEAD") return send(200, "text/plain; charset=utf-8", "");
    if (req.method !== "GET") return send(405, "text/plain; charset=utf-8", "Method not allowed");
    const m = /^\/pair\/([A-Za-z0-9_-]{43})(\/status)?$/.exec((req.url ?? "").split("?")[0]!);
    if (!m || !this.matches(m[1]!)) return send(404, "text/plain; charset=utf-8", "Not found");
    this.expireIfDue();
    const a = this.attempt!;
    const isStatus = Boolean(m[2]);
    const presented = cookieValue(req, OPENER_COOKIE);
    const isOpener = a.opener !== undefined && presented !== undefined && sameSecret(presented, a.opener);

    if (a.opener === undefined) {
      if (isStatus) return send(403, "application/json", JSON.stringify({ status: "unavailable" }));
      if (PREVIEW_UA.test(req.headers["user-agent"] ?? "")) {
        const n = randomBytes(16).toString("base64");
        return html(page(a.status, undefined, n, PREVIEW), {}, n);
      }
      if (a.status === "waiting") {
        a.opener = randomBytes(32).toString("base64url");
        const maxAge = Math.max(1, Math.ceil((a.expiresAt - this.now()) / 1000));
        const cookie = `${OPENER_COOKIE}=${a.opener}; HttpOnly; SameSite=Strict; Path=/pair/${a.token}; Max-Age=${maxAge}${this.secureCookie ? "; Secure" : ""}`;
        const n = randomBytes(16).toString("base64");
        return html(page(a.status, a.qrSvg, n), { "Set-Cookie": cookie }, n);
      }
    } else if (!isOpener) {
      if (isStatus) return send(403, "application/json", JSON.stringify({ status: "unavailable" }));
      const n = randomBytes(16).toString("base64");
      return html(page(a.status, undefined, n, CLAIMED), {}, n);
    }

    if (isStatus) return send(200, "application/json", JSON.stringify({ status: a.status }));
    const n = randomBytes(16).toString("base64");
    html(page(a.status, a.qrSvg, n), {}, n);
  }
}
