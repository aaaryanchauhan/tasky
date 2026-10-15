import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/db/types";

/** Shape returned by every form action, consumed with useActionState. */
export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Echoed back so a failed submit doesn't wipe what the user typed. */
  values?: Record<string, string>;
  /** Extra payload for preview-style actions. */
  data?: unknown;
} | null;

export const fail = (message: string, extra: Partial<NonNullable<ActionState>> = {}): ActionState => ({
  ok: false,
  message,
  ...extra,
});

export const succeed = (message: string, extra: Partial<NonNullable<ActionState>> = {}): ActionState => ({
  ok: true,
  message,
  ...extra,
});

/**
 * Surface the database's own, deliberately worded errors (raised by our functions/constraints)
 * and hide anything unexpected behind a generic message.
 */
export function dbErrorMessage(error: { code?: string; message: string }): string {
  const friendly = new Set(["P0001", "P0002", "22023", "23514", "40001", "42501"]);
  if (error.code && friendly.has(error.code)) return error.message;
  if (error.code === "23505") return "That record already exists.";
  console.error("database error", error.code, error.message);
  return "Something went wrong saving that. Please try again.";
}

export async function audit(
  supabase: SupabaseClient<Database>,
  actorId: string,
  entityType: string,
  entityId: string | null,
  action: string,
  before: Json | null,
  after: Json | null,
) {
  const { error } = await supabase.from("audit_log").insert({
    actor_id: actorId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    before_json: before,
    after_json: after,
  });
  if (error) console.error("audit write failed", error.message);
}

export function flashUrl(path: string, message: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}flash=${encodeURIComponent(message)}`;
}
