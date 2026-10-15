import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { decryptSecret, encryptSecret, parseKey } from "@/lib/secret-box";

type Client = SupabaseClient<Database>;

function key(): Buffer {
  return parseKey(process.env.AADHAAR_ENCRYPTION_KEY);
}

/** Whether Aadhaar storage is usable. When false the field is disabled — never stored in plain text. */
export function aadhaarConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export type AadhaarResult = { ok: true } | { ok: false; error: string };

export async function saveAadhaar(supabase: Client, memberId: string, digits: string): Promise<AadhaarResult> {
  let ciphertext: string;
  try {
    ciphertext = encryptSecret(digits, key(), memberId);
  } catch {
    return { ok: false, error: "Aadhaar storage isn't configured on the server." };
  }
  const { error } = await supabase
    .from("member_sensitive")
    .upsert({ member_id: memberId, aadhaar_ciphertext: ciphertext, aadhaar_last4: digits.slice(-4) }, { onConflict: "member_id" });
  if (error) {
    console.error("aadhaar save failed", error.code); // never log the value or ciphertext
    return { ok: false, error: "The Aadhaar number couldn't be saved. Please try again." };
  }
  return { ok: true };
}

/** Deleting sensitive data must never fail silently: callers surface a failure to the admin. */
export async function clearAadhaar(supabase: Client, memberId: string): Promise<AadhaarResult> {
  const { error } = await supabase.from("member_sensitive").delete().eq("member_id", memberId);
  if (error) {
    console.error("aadhaar clear failed", error.code);
    return { ok: false, error: "The Aadhaar number couldn't be removed. Please try again." };
  }
  return { ok: true };
}

/** Last four digits only (no decryption). */
export async function getAadhaarLast4(supabase: Client, memberId: string): Promise<string | null> {
  const { data } = await supabase.from("member_sensitive").select("aadhaar_last4").eq("member_id", memberId).maybeSingle();
  return data?.aadhaar_last4 ?? null;
}

/** Decrypt the full number. Callers must audit-log the access. */
export async function readAadhaar(supabase: Client, memberId: string): Promise<string | null> {
  const { data } = await supabase.from("member_sensitive").select("aadhaar_ciphertext").eq("member_id", memberId).maybeSingle();
  if (!data) return null;
  try {
    return decryptSecret(data.aadhaar_ciphertext, key(), memberId);
  } catch {
    console.error("aadhaar decrypt failed (wrong key or tampered data)");
    return null;
  }
}
