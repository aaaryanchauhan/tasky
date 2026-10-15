import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { formatAadhaar, maskAadhaar, normalizeAadhaar, verhoeffCheckDigit, verhoeffValid } from "@/lib/aadhaar";
import { decryptSecret, encryptSecret, parseKey } from "@/lib/secret-box";

/** Build a structurally valid number from an 11-digit body (synthetic, not a real person's). */
const make = (body: string) => body + verhoeffCheckDigit(body);

describe("Verhoeff / Aadhaar validation", () => {
  it("matches the published Verhoeff test vector (236 → check digit 3)", () => {
    expect(verhoeffCheckDigit("236")).toBe(3);
    expect(verhoeffValid("2363")).toBe(true);
    expect(verhoeffValid("2364")).toBe(false);
  });

  it("accepts valid numbers with or without spaces/hyphens", () => {
    const n = make("23456789012");
    expect(n).toHaveLength(12);
    expect(normalizeAadhaar(n)).toBe(n);
    expect(normalizeAadhaar(formatAadhaar(n))).toBe(n);
    expect(normalizeAadhaar(`${n.slice(0, 4)}-${n.slice(4, 8)}-${n.slice(8)}`)).toBe(n);
  });

  it("rejects typos: any single wrong digit, and swapped neighbours", () => {
    const n = make("98765432109");
    for (let i = 0; i < 12; i++) {
      const wrong = (Number(n[i]) + 1) % 10;
      const bad = n.slice(0, i) + wrong + n.slice(i + 1);
      if (i === 0 && wrong < 2) continue; // would fail the leading-digit rule instead
      expect(normalizeAadhaar(bad), `digit ${i}`).toBeNull();
    }
    const swapped = n.slice(0, 3) + n[4] + n[3] + n.slice(5);
    if (swapped !== n) expect(normalizeAadhaar(swapped)).toBeNull();
  });

  it("rejects wrong length, letters, and numbers starting 0 or 1", () => {
    expect(normalizeAadhaar("")).toBeNull();
    expect(normalizeAadhaar("12345")).toBeNull();
    expect(normalizeAadhaar("2345678901234")).toBeNull();
    expect(normalizeAadhaar("23456789012a")).toBeNull();
    expect(normalizeAadhaar(make("01234567890"))).toBeNull();
    expect(normalizeAadhaar(make("12345678901"))).toBeNull();
  });

  it("formats and masks", () => {
    expect(formatAadhaar("234567890123")).toBe("2345 6789 0123");
    expect(maskAadhaar("0123")).toBe("XXXX XXXX 0123");
  });
});

describe("secret box (AES-256-GCM)", () => {
  const key = randomBytes(32);
  const member = "11111111-2222-3333-4444-555555555555";

  it("round-trips and never contains the plaintext", () => {
    const stored = encryptSecret("234567890123", key, member);
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain("234567890123");
    expect(decryptSecret(stored, key, member)).toBe("234567890123");
  });

  it("uses a fresh IV every time (same input, different ciphertext)", () => {
    expect(encryptSecret("234567890123", key, member)).not.toBe(encryptSecret("234567890123", key, member));
  });

  it("fails closed on tampering, a different member, or the wrong key", () => {
    const stored = encryptSecret("234567890123", key, member);
    const parts = stored.split(":");
    const ct = Buffer.from(parts[3]!, "base64url");
    ct[0] = ct[0]! ^ 1; // flip one bit
    const flipped = [...parts.slice(0, 3), ct.toString("base64url")].join(":");
    expect(() => decryptSecret(flipped, key, member)).toThrow();
    expect(() => decryptSecret(stored, key, "99999999-2222-3333-4444-555555555555")).toThrow(); // copied to another member
    expect(() => decryptSecret(stored, randomBytes(32), member)).toThrow();
    expect(() => decryptSecret("garbage", key, member)).toThrow();
  });

  it("requires a 32-byte base64 key", () => {
    expect(() => parseKey(undefined)).toThrow(/not configured/);
    expect(() => parseKey("")).toThrow();
    expect(() => parseKey(Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
    expect(parseKey(key.toString("base64")).equals(key)).toBe(true);
  });
});
