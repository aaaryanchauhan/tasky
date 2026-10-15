import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Minimal stand-in for the parts of Supabase the migrations depend on. */
const SUPABASE_PRELUDE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
  $$;
  -- stand-in for Supabase Storage's tables (only the columns the migrations/policies touch)
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export async function createDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_PRELUDE);
  const dir = path.resolve(import.meta.dirname, "../../supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(dir, file), "utf8"));
  }
  return db;
}

export type Db = PGlite;

export async function actAs(db: Db, who: { sub?: string; role: "authenticated" | "service_role" | "anon" } | "superuser") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims', '', false)");
  if (who === "superuser") return;
  const claims = JSON.stringify({ sub: who.sub, role: who.role });
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);
  await db.exec(`set role ${who.role}`);
}

export async function seedAdmin(db: Db): Promise<string> {
  await actAs(db, "superuser");
  const u = await db.query<{ id: string }>("insert into auth.users (email) values ('owner@example.test') returning id");
  const id = u.rows[0]!.id;
  await db.query("insert into public.profiles (id, role) values ($1, 'admin')", [id]);
  return id;
}

export async function today(db: Db): Promise<string> {
  const r = await db.query<{ d: string }>("select to_char(public.app_today(), 'YYYY-MM-DD') as d");
  return r.rows[0]!.d;
}

export async function planId(db: Db, code: string): Promise<string> {
  const r = await db.query<{ id: string }>("select id from public.membership_plans where code = $1", [code]);
  return r.rows[0]!.id;
}

let phoneSeq = 0;
export async function addMember(
  db: Db,
  opts: { name?: string; plan?: string; price?: number; anchor: string; status?: string; optIn?: boolean } ,
): Promise<string> {
  const plan = await planId(db, opts.plan ?? "monthly");
  phoneSeq += 1;
  const phone = `+9190000${String(phoneSeq).padStart(5, "0")}`;
  const r = await db.query<{ id: string }>(
    `insert into public.members (full_name, whatsapp_e164, joined_on, status, plan_id, agreed_price_paise,
        first_due_on, billing_anchor_on, whatsapp_opt_in_at, whatsapp_opt_in_source)
     values ($1, $2, $3, $4, $5, $6, $3, $3, $7, $8) returning id`,
    [
      opts.name ?? `Test Member ${phoneSeq}`,
      phone,
      opts.anchor,
      opts.status ?? "active",
      plan,
      opts.price ?? 100_000,
      opts.optIn === false ? null : new Date().toISOString(),
      opts.optIn === false ? null : "test form",
    ],
  );
  return r.rows[0]!.id;
}

export function periodJson(start: string, end: string, amount = 100_000, plan = "monthly", months = 1) {
  return {
    period_start: start,
    period_end_exclusive: end,
    due_on: start,
    plan_code_snapshot: plan,
    duration_months_snapshot: months,
    amount_due_paise: amount,
  };
}

export async function addPeriod(db: Db, memberId: string, start: string, end: string, amount = 100_000): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into public.billing_periods (member_id, period_start, period_end_exclusive, due_on, plan_code_snapshot,
        duration_months_snapshot, amount_due_paise)
     values ($1, $2, $3, $2, 'monthly', 1, $4) returning id`,
    [memberId, start, end, amount],
  );
  return r.rows[0]!.id;
}
