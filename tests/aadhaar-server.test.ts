import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { aadhaarConfigured, saveAadhaar } from "@/server/aadhaar";

afterEach(() => vi.unstubAllEnvs());

describe("Aadhaar storage configuration", () => {
  it("is disabled, and refuses to store anything, without a valid encryption key", async () => {
    const upsert = vi.fn();
    const supabase = { from: () => ({ upsert }) } as never;
    for (const bad of ["", "not-base64-of-32-bytes", Buffer.alloc(16).toString("base64")]) {
      vi.stubEnv("AADHAAR_ENCRYPTION_KEY", bad);
      expect(aadhaarConfigured()).toBe(false);
      const r = await saveAadhaar(supabase, "11111111-2222-3333-4444-555555555555", "234567890123");
      expect(r.ok).toBe(false);
    }
    expect(upsert).not.toHaveBeenCalled(); // never falls back to plain text
  });

  it("stores only ciphertext and the last four digits when configured", async () => {
    vi.stubEnv("AADHAAR_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    expect(aadhaarConfigured()).toBe(true);
    const upsert = vi.fn(async () => ({ error: null }));
    const r = await saveAadhaar({ from: () => ({ upsert }) } as never, "11111111-2222-3333-4444-555555555555", "234567890123");
    expect(r.ok).toBe(true);
    const row = (upsert.mock.calls[0] as unknown as [Record<string, string>])[0];
    expect(row.aadhaar_last4).toBe("0123");
    expect(JSON.stringify(row)).not.toContain("234567890123");
    expect(row.aadhaar_ciphertext?.startsWith("v1:")).toBe(true);
  });
});
