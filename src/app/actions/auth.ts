"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formToObject, loginSchema } from "@/lib/validation";
import { fail, type ActionState } from "./shared";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fail("Enter your email and password.");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  // Same message for unknown email and wrong password: don't reveal which accounts exist.
  if (error || !data.user) return fail("Incorrect email or password.", { values: { email: parsed.data.email } });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (profile?.role !== "admin") {
    await supabase.auth.signOut();
    return fail("This account doesn't have access to Tiger Fitness Admin.", { values: { email: parsed.data.email } });
  }
  redirect("/");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
