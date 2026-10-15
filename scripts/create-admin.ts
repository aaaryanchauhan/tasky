/**
 * Provision an admin account (there is no public signup).
 *
 *   ADMIN_PASSWORD='…' npm run create-admin -- owner@example.com
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local / the environment.
 * The service-role key is only ever used here, on your machine, never in the browser.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { createInterface } from "node:readline/promises";

config({ path: ".env.local" });
config();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("Usage: ADMIN_PASSWORD='…' npm run create-admin -- <email>");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
    process.exit(1);
  }

  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question("Password (min 12 chars): ");
    rl.close();
  }
  if (!password || password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Reuse an existing auth user if the email already exists.
  const { data: created, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  let userId = created?.user?.id;
  if (error) {
    if (!/already|registered|exists/i.test(error.message)) throw error;
    const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list?.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (!userId) throw error;
    await supabase.auth.admin.updateUserById(userId, { password });
  }

  const { error: profileError } = await supabase.from("profiles").upsert({ id: userId!, role: "admin" });
  if (profileError) throw profileError;
  console.log(`Admin ready: ${email}`);
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
