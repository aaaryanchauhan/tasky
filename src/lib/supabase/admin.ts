import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

export type AdminClient = SupabaseClient<Database>;

/**
 * Service-role client: bypasses RLS. Server-only (the `server-only` import fails the build if
 * this module is ever pulled into client code). Use it exclusively for the cron job, the
 * WhatsApp webhook, and server actions that have already verified an admin session.
 */
export function createAdminClient(): AdminClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service-role environment is not configured");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
