// ECDSA P-256 request-signing key, SPEC.md §4.1 step 1 and §4.3.
// Public key is exported as X.509 SubjectPublicKeyInfo DER (EC public key OID
// 1.2.840.10045.2.1, P-256 OID 1.2.840.10045.3.1.7, uncompressed point), which is the
// standard SPKI form Node produces.

import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";

export type SignatureEncoding = "raw" | "der"; // raw = r‖s (WebCrypto); which one the server wants is UNVERIFIED (§4.3)

export class DeviceKey {
  private constructor(private readonly priv: KeyObject, readonly pub: KeyObject) {}

  static generate(): DeviceKey {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    return new DeviceKey(privateKey, publicKey);
  }

  static fromPkcs8(der: Uint8Array): DeviceKey {
    const priv = createPrivateKey({ key: Buffer.from(der), format: "der", type: "pkcs8" });
    return new DeviceKey(priv, createPublicKey(priv));
  }

  pkcs8(): Uint8Array {
    return new Uint8Array(this.priv.export({ format: "der", type: "pkcs8" }));
  }

  spki(): Uint8Array {
    return new Uint8Array(this.pub.export({ format: "der", type: "spki" }));
  }

  /** ECDSA P-256/SHA-256 signature over UTF-8 bytes of `message`. */
  sign(message: string, encoding: SignatureEncoding = "raw"): Uint8Array {
    return new Uint8Array(
      sign("sha256", Buffer.from(message, "utf8"), { key: this.priv, dsaEncoding: encoding === "raw" ? "ieee-p1363" : "der" }),
    );
  }

  verify(message: string, sig: Uint8Array, encoding: SignatureEncoding = "raw"): boolean {
    return verify("sha256", Buffer.from(message, "utf8"), { key: this.pub, dsaEncoding: encoding === "raw" ? "ieee-p1363" : "der" }, sig);
  }
}
