import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { GymSettingsRow } from "@/lib/db/types";

/**
 * Gate for every page and server action. Verifies the session with Supabase Auth
 * (not just the cookie) and then that the user has an admin profile row.
 * Never trust identity coming from the client.
 */
export const requireAdmin = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", user.id).maybeSingle();
  if (!profile || profile.role !== "admin") redirect("/login?error=forbidden");

  return { supabase, user };
});

/** Returns the admin if signed in as one, otherwise null (used by /login). */
export async function getAdminOrNull() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: "anonymous" as const };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return profile?.role === "admin" ? { state: "admin" as const } : { state: "not_admin" as const };
}

export const getGymSettings = cache(async (): Promise<GymSettingsRow> => {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from("gym_settings").select("*").eq("id", 1).single();
  if (error || !data) throw new Error("Gym settings are missing; run the database migrations.");
  return data;
});
