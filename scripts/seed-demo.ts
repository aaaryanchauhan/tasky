/**
 * DEVELOPMENT ONLY — loads clearly labelled demo members so the UI isn't empty.
 *
 *   DEMO_WHATSAPP_NUMBER='+91…' npm run seed-demo -- --yes
 *
 * Refuses to run when NODE_ENV=production. Every demo member is named "[DEMO] …" and noted as demo
 * data. No phone numbers are hardcoded: all demo members share DEMO_WHATSAPP_NUMBER (e.g. your Meta
 * test recipient). They have NO WhatsApp consent recorded, so no reminder can reach them until you
 * explicitly record consent in the UI.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { generatePeriods, generationHorizon, type PlanCode } from "../src/lib/billing";
import { addDays, todayInTimeZone } from "../src/lib/dates";
import { normalizeIndianNumber } from "../src/lib/phone";

config({ path: ".env.local" });
config();

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production.");
  if (!process.argv.includes("--yes")) throw new Error("Pass --yes to confirm you want demo data in this database.");
  const phone = normalizeIndianNumber(process.env.DEMO_WHATSAPP_NUMBER ?? "");
  if (!phone) throw new Error("Set DEMO_WHATSAPP_NUMBER to a valid Indian number (e.g. your Meta test recipient).");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const today = todayInTimeZone(process.env.APP_TIMEZONE || "Asia/Kolkata");
  const { data: plans } = await db.from("membership_plans").select("*");
  const plan = (code: PlanCode) => plans!.find((p) => p.code === code)!;

  const demo: { name: string; plan: PlanCode; anchorOffset: number; price?: number; pay?: "full" | "partial" }[] = [
    { name: "[DEMO] Aarav Mehta", plan: "monthly", anchorOffset: -60, pay: "full" },
    { name: "[DEMO] Diya Nair", plan: "quarterly", anchorOffset: 3 },
    { name: "[DEMO] Kabir Singh", plan: "monthly", anchorOffset: -12, price: 80_000 },
    { name: "[DEMO] Meera Iyer", plan: "annual", anchorOffset: -200, pay: "full" },
    { name: "[DEMO] Rahul Verma", plan: "monthly", anchorOffset: -5, pay: "partial" },
  ];

  for (const d of demo) {
    const p = plan(d.plan);
    const anchor = addDays(today, d.anchorOffset);
    const price = d.price ?? p.list_price_paise;
    const { data: m, error } = await db
      .from("members")
      .insert({
        full_name: d.name,
        whatsapp_e164: phone,
        joined_on: anchor,
        plan_id: p.id,
        agreed_price_paise: price,
        first_due_on: anchor,
        billing_anchor_on: anchor,
        notes: "DEMO DATA — safe to delete",
      })
      .select("id")
      .single();
    if (error || !m) throw error ?? new Error("insert failed");

    const periods = generatePeriods({ anchor, planCode: d.plan, amountPaise: price, horizon: generationHorizon(today) });
    await db.rpc("ensure_billing_periods", {
      p_member_id: m.id,
      p_periods: periods.map((x) => ({
        period_start: x.periodStart,
        period_end_exclusive: x.periodEndExclusive,
        due_on: x.dueOn,
        plan_code_snapshot: x.planCodeSnapshot,
        duration_months_snapshot: x.durationMonthsSnapshot,
        amount_due_paise: x.amountDuePaise,
      })),
    });

    if (d.pay) {
      const { data: rows } = await db.from("billing_period_summary").select("id, amount_due_paise").eq("member_id", m.id).order("due_on");
      for (const [i, r] of (rows ?? []).entries()) {
        const isLast = i === (rows?.length ?? 0) - 1;
        const amount = d.pay === "partial" && isLast ? Math.floor(r.amount_due_paise / 2) : r.amount_due_paise;
        if (d.pay === "full" && isLast && d.anchorOffset > -100) continue; // leave the latest open
        await db.rpc("record_payment", {
          p_period_id: r.id, p_amount_paise: amount, p_paid_on: today, p_method: "cash",
          p_reference: null, p_notes: "demo", p_idempotency_key: `demo-${m.id}-${r.id}`,
        });
      }
    }
  }
  console.log(`Seeded ${demo.length} demo members.`);
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
