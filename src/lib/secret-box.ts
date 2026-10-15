import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Authenticated encryption for small secrets (AES-256-GCM). The member id is bound in as
 * "associated data", so a ciphertext copied onto another member's row fails to decrypt.
 * Stored form: v1:<iv>:<tag>:<ciphertext>, each base64url. The version prefix leaves room for
 * key rotation later.
 */

const VERSION = "v1";

/** Parse a base64 string that must decode to exactly 32 bytes (e.g. `openssl rand -base64 32`). */
export function parseKey(base64: string | undefined): Buffer {
  if (!base64) throw new Error("Encryption key is not configured");
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes, base64-encoded");
  return key;
}

export function encryptSecret(plaintext: string, key: Buffer, associatedData: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(":");
}

export function decryptSecret(stored: string, key: Buffer, associatedData: string): string {
  const [version, iv, tag, ct] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !ct) throw new Error("Unrecognised ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(associatedData, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
