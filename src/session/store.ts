// Encrypted-at-rest session store (README rule 6). AES-256-GCM, key from scrypt(passphrase).
// Path and passphrase come from ${GOOGLE_MESSAGES_SESSION_PATH} / ${GOOGLE_MESSAGES_SESSION_KEY}.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { DeviceIdentity } from "../protocol/auth.js";

export interface SessionData {
  version: 1;
  deviceKeyPkcs8: string; // base64
  aesKey: string; // base64
  hmacKey: string; // base64
  token?: string; // base64
  tokenTtlMicros?: string;
  tokenReceivedAtMs?: number;
  phone?: DeviceIdentity;
  browser?: DeviceIdentity;
  sessionId?: string;
}

interface Envelope {
  format: "grokbot-messages-session";
  v: 1;
  kdf: { name: "scrypt"; N: number; r: number; p: number; salt: string };
  nonce: string;
  ciphertext: string; // base64, GCM tag appended
}

const SCRYPT = { N: 1 << 15, r: 8, p: 1 };

function deriveKey(passphrase: string, salt: Buffer, k = SCRYPT): Buffer {
  return scryptSync(passphrase, salt, 32, { N: k.N, r: k.r, p: k.p, maxmem: 128 * k.N * k.r * 2 });
}

export class SessionStore {
  constructor(private readonly path: string, private readonly passphrase: string) {
    if (passphrase.length < 16) throw new Error("session passphrase must be at least 16 characters");
    if (new Set(passphrase).size < 8) throw new Error("session passphrase is too repetitive");
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): SessionStore {
    return new SessionStore(requireEnv(env, "GOOGLE_MESSAGES_SESSION_PATH"), requireEnv(env, "GOOGLE_MESSAGES_SESSION_KEY"));
  }

  async load(): Promise<SessionData | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw e;
    }
    const env = JSON.parse(raw) as Envelope;
    if (env.format !== "grokbot-messages-session" || env.v !== 1) throw new Error("unrecognised session file format");
    const key = deriveKey(this.passphrase, Buffer.from(env.kdf.salt, "base64"), env.kdf);
    const data = Buffer.from(env.ciphertext, "base64");
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(env.nonce, "base64"));
    d.setAuthTag(data.subarray(data.length - 16));
    let plain: Buffer;
    try {
      plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
    } catch {
      throw new Error("session file could not be decrypted (wrong GOOGLE_MESSAGES_SESSION_KEY or corrupted file)");
    }
    return JSON.parse(plain.toString("utf8")) as SessionData;
  }

  async save(s: SessionData): Promise<void> {
    const salt = randomBytes(16);
    const nonce = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", deriveKey(this.passphrase, salt), nonce);
    const ct = Buffer.concat([c.update(JSON.stringify(s), "utf8"), c.final(), c.getAuthTag()]);
    const env: Envelope = {
      format: "grokbot-messages-session",
      v: 1,
      kdf: { name: "scrypt", ...SCRYPT, salt: salt.toString("base64") },
      nonce: nonce.toString("base64"),
      ciphertext: ct.toString("base64"),
    };
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    // Unpredictable name + exclusive create: refuses to follow a pre-planted file or symlink.
    const tmp = `${this.path}.${randomBytes(8).toString("hex")}.tmp`;
    await writeFile(tmp, JSON.stringify(env), { mode: 0o600, flag: "wx" });
    await rename(tmp, this.path);
  }
}

/**
 * Reads a required variable, failing closed when it is unset, empty, or still an
 * unexpanded `${VAR}` placeholder (a host that does not substitute plugin variables
 * would otherwise hand us the literal placeholder as a passphrase).
 */
export function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name]?.trim();
  if (!v) throw new Error(`${name} is not set`);
  if (/\$\{[^}]*\}|\$[A-Z_][A-Z0-9_]*$/.test(v)) throw new Error(`${name} looks like an unexpanded placeholder; set it in the plugin configuration`);
  return v;
}
