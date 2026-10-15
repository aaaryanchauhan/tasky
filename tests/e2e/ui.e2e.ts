/**
 * Browser end-to-end test: the real, production-built Next.js app + real migrations on PGlite,
 * driven by Chromium at phone width (360px). Requires `npm run build` first.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { expect } from "@playwright/test";
import { afterAll, beforeAll, describe, it } from "vitest";
import { addDays, todayInTimeZone } from "@/lib/dates";
import { ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET, startFakeSupabase } from "./fake-supabase-server";

const APP_PORT = 3199;
const APP = `http://127.0.0.1:${APP_PORT}`;
const SUPA_PORT = 54399;
const SHOTS = process.env.E2E_SHOTS ?? path.resolve(import.meta.dirname, "../../.e2e-shots");
const CHROME = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const TODAY = todayInTimeZone("Asia/Kolkata");

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const serviceJwt = () => {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ role: "service_role", iss: "e2e", exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url")}`;
};

let supa: Awaited<ReturnType<typeof startFakeSupabase>>;
let server: ChildProcess;
let browser: Browser;
let ctx: BrowserContext;
let page: Page;
let serverLog = "";

async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  await supa.db.exec("reset role");
  return (await supa.db.query(query, params)).rows as T[];
}

async function waitForApp() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${APP}/login`, { redirect: "manual" });
      if (r.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`app did not start:\n${serverLog}`);
}

async function noHorizontalOverflow(label: string) {
  const { scrollW, innerW } = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth }));
  expect(scrollW, `${label}: horizontal overflow at 360px (${scrollW} > ${innerW})`).toBeLessThanOrEqual(innerW);
}

async function shot(name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

async function toast(text: string | RegExp) {
  try {
    await page.getByRole("status").filter({ hasText: text }).first().waitFor({ timeout: 10_000 });
  } catch (e) {
    await shot("FAIL-toast");
    const seen = await page.locator("[role=status], [role=alert]").allInnerTexts();
    throw new Error(`toast ${String(text)} not shown; page says: ${JSON.stringify(seen)}\n${serverLog.slice(-1500)}`, { cause: e });
  }
}

beforeAll(async () => {
  supa = await startFakeSupabase(SUPA_PORT);
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(APP_PORT), "-H", "127.0.0.1"], {
    cwd: path.resolve(import.meta.dirname, "../.."),
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PORT}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-for-e2e",
      SUPABASE_SERVICE_ROLE_KEY: serviceJwt(),
      CRON_SECRET: "e2e-cron-secret",
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: "e2e-verify",
      WHATSAPP_APP_SECRET: "e2e-app-secret",
    },
  });
  server.stdout?.on("data", (d) => (serverLog += d));
  server.stderr?.on("data", (d) => (serverLog += d));
  await waitForApp();
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page = await ctx.newPage();
  page.on("pageerror", (e) => (serverLog += `\n[pageerror] ${e.message}`));
});

afterAll(async () => {
  await browser?.close();
  server?.kill("SIGTERM");
  await supa?.close();
});

describe("access control", () => {
  it("redirects anonymous visitors to the login screen, which fits a 360px phone", async () => {
    await page.goto(`${APP}/members`);
    await page.waitForURL("**/login");
    await expect(page.getByRole("heading", { name: "Tiger Fitness" })).toBeVisible();
    await noHorizontalOverflow("login");
    await shot("01-login");
  });

  it("rejects a wrong password with a generic message", async () => {
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form [role=alert]")).toContainText("Incorrect email or password");
  });

  it("refuses a signed-up user who has no admin profile", async () => {
    await page.getByLabel("Email").fill("stranger@tigerfitness.test");
    await page.getByLabel("Password").fill("stranger-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form [role=alert]")).toContainText("doesn't have access");
    await page.goto(`${APP}/`);
    await page.waitForURL("**/login");
  });

  it("protects the scheduler and webhook endpoints", async () => {
    expect((await fetch(`${APP}/api/cron/daily`)).status).toBe(401);
    expect((await fetch(`${APP}/api/cron/daily`, { headers: { authorization: "Bearer nope" } })).status).toBe(401);
    expect((await fetch(`${APP}/api/whatsapp/webhook`, { method: "POST", body: "{}" })).status).toBe(401);
    expect((await fetch(`${APP}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=1`)).status).toBe(403);
    const ok = await fetch(`${APP}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=e2e-verify&hub.challenge=777`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("777");
  });
});

describe("admin journey on a phone", () => {
  it("signs in and sees an honest empty dashboard", async () => {
    await page.goto(`${APP}/login`);
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(`${APP}/`);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Nothing overdue")).toBeVisible();
    await expect(page.getByText("Active members").locator("..")).toContainText("0");
    await noHorizontalOverflow("dashboard-empty");
    await shot("02-dashboard-empty");
  });

  it("adds a member with a billing preview, plan pre-fill and consent", async () => {
    await page.getByRole("link", { name: "Add member" }).first().click();
    await page.waitForURL("**/members/new");
    await page.getByLabel("Full name").fill("Rohit Sharma");
    await page.getByLabel("WhatsApp number").fill("98765 43210");
    await page.getByLabel("Plan").selectOption("quarterly");
    // price pre-fills from the plan's list price, and can be overridden
    await expect(page.getByLabel("Agreed fee per term (₹)")).toHaveValue("2700");
    await page.getByLabel("Joining date").fill(TODAY);
    await page.getByLabel("First fee due on").fill(addDays(TODAY, 3));
    await expect(page.getByText("Billing preview")).toBeVisible();
    await expect(page.locator("[aria-live=polite]").filter({ hasText: "Billing preview" })).toContainText("₹2,700");
    await page.getByLabel(/has agreed to receive WhatsApp/).check();
    await page.getByLabel("Where was consent given?").fill("Signed enrolment form");
    await noHorizontalOverflow("member-form");
    await shot("03-add-member");
    await page.getByRole("button", { name: "Add member" }).click();
    await page.waitForURL(/\/members\/[0-9a-f-]{36}/);
    await toast("Member added");
    await expect(page.getByRole("heading", { name: "Rohit Sharma" })).toBeVisible();
    await expect(page.getByText("WhatsApp OK")).toBeVisible();
    await expect(page.getByText("₹2,700 outstanding")).toBeVisible();
    await noHorizontalOverflow("member-detail");
    await shot("04-member-detail");
  });

  it("validates input and shows field errors without losing what was typed", async () => {
    await page.goto(`${APP}/members/new`);
    await page.getByLabel("Full name").fill("Bad Phone");
    await page.getByLabel("WhatsApp number").fill("12345");
    await page.getByRole("button", { name: "Add member" }).click();
    await expect(page.getByText("Enter a valid Indian mobile number").first()).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveValue("Bad Phone");
  });

  it("dashboard totals come from the stored records", async () => {
    await page.goto(`${APP}/`);
    await expect(page.getByText("Due in 7 days").first().locator("..")).toContainText("₹2,700");
    await expect(page.getByText("Due in 7 days").first().locator("..")).toContainText("1 fee");
    await expect(page.getByText("Active members").locator("..")).toContainText("1");
    await noHorizontalOverflow("dashboard");
    await shot("05-dashboard");
  });

  it("records a partial payment, shows the remaining balance, then reverses it with an audit trail", async () => {
    await page.getByRole("link", { name: /Rohit Sharma/ }).first().click();
    await page.getByRole("button", { name: "Record payment" }).click();
    await page.getByLabel("Amount received (₹)").fill("1000");
    await page.getByLabel("Method").selectOption("upi");
    await page.getByLabel("Reference (optional)").fill("UPI-123");
    await shot("06-payment-dialog");
    await page.getByRole("button", { name: "Save payment" }).click();
    await toast("₹1,700 still due");
    await expect(page.getByText("₹1,700 outstanding")).toBeVisible();
    await expect(page.getByText("Partially paid").first()).toBeVisible();
    await expect(page.getByText("₹1,000 · UPI")).toBeVisible();

    await page.getByRole("button", { name: "Reverse" }).click();
    await page.getByLabel("Reason").fill("Entered by mistake");
    await page.getByRole("button", { name: "Reverse payment" }).click();
    await toast("₹2,700 now outstanding");
    await expect(page.getByText("₹2,700 outstanding")).toBeVisible();
    await expect(page.getByText("Reversed").first()).toBeVisible();
    const audit = await sql<{ action: string }>("select action from public.audit_log where entity_type = 'payment' order by created_at");
    expect(audit.map((a) => a.action)).toEqual(["recorded", "voided"]);
    await shot("07-after-reversal");
  });

  it("refuses an over-payment and accepts the full amount", async () => {
    await page.getByRole("button", { name: "Record payment" }).click();
    await page.getByLabel("Amount received (₹)").fill("3000");
    await page.getByRole("button", { name: "Save payment" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "exceeds the outstanding" })).toBeVisible();
    await page.getByLabel("Amount received (₹)").fill("2700");
    await page.getByRole("button", { name: "Save payment" }).click();
    await toast("fully paid");
    await expect(page.getByText("Nothing outstanding")).toBeVisible();
  });

  it("previews a plan change before applying it and never rewrites history", async () => {
    await page.getByRole("link", { name: "Plan / fee / due date" }).click();
    await page.getByLabel("Plan").selectOption("monthly");
    await page.getByLabel("Agreed fee per term (₹)").fill("900");
    await page.getByRole("button", { name: "Preview changes" }).click();
    await expect(page.getByText("What will change")).toBeVisible();
    await expect(page.getByText(/stay exactly as they are/)).toBeVisible();
    await noHorizontalOverflow("billing-preview");
    await shot("08-billing-preview");
    await page.getByRole("button", { name: "Apply changes" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Apply" }).click();
    await page.waitForURL(/\/members\/[0-9a-f-]{36}$/);
    await toast("Billing terms updated");
    const rows = await sql<{ plan_code_snapshot: string; amount_due_paise: number; cancelled_at: string | null }>(
      "select plan_code_snapshot, amount_due_paise, cancelled_at from public.billing_periods order by period_start",
    );
    // the paid quarterly term is untouched; the member is now on the monthly plan at ₹900
    expect(rows[0]).toMatchObject({ plan_code_snapshot: "quarterly", amount_due_paise: 270_000, cancelled_at: null });
    const m = (await sql<{ agreed_price_paise: number; code: string }>("select m.agreed_price_paise, p.code from public.members m join public.membership_plans p on p.id = m.plan_id"))[0]!;
    expect(m).toEqual({ agreed_price_paise: 90_000, code: "monthly" });
  });

  it("adds a member photo: big phone-sized image is resized in the browser, stored privately, shown via signed link", async () => {
    await page.goto(`${APP}/members`);
    await page.getByRole("link", { name: /Rohit Sharma/ }).first().click();
    await page.getByRole("link", { name: "Edit" }).click();
    // an intentionally large 4000x3000 image, like a phone camera produces
    const b64 = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 4000; c.height = 3000;
      const g = c.getContext("2d")!;
      const grad = g.createLinearGradient(0, 0, 4000, 3000);
      grad.addColorStop(0, "#f97316"); grad.addColorStop(1, "#1a1613");
      g.fillStyle = grad; g.fillRect(0, 0, 4000, 3000);
      g.fillStyle = "#fff"; g.beginPath(); g.arc(2000, 1500, 800, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 4000; i += 7) { g.fillStyle = `rgb(${i % 255},${(i * 3) % 255},${(i * 7) % 255})`; g.fillRect(i, (i * 13) % 3000, 5, 5); }
      return c.toDataURL("image/png").split(",")[1]!;
    });
    const original = Buffer.from(b64, "base64");
    expect(original.length).toBeGreaterThan(100_000);
    await page.locator("#photo").setInputFiles({ name: "IMG_0001.png", mimeType: "image/png", buffer: original });
    await expect(page.getByRole("button", { name: "Remove photo" })).toBeVisible();
    await shot("13-photo-picked");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(/\/members\/[0-9a-f-]{36}$/);
    await toast("Member updated");

    const [row] = await sql<{ photo_path: string }>("select photo_path from public.members where full_name = 'Rohit Sharma'");
    expect(row!.photo_path).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/); // re-encoded as JPEG by the browser
    // shown on the detail page through a short-lived signed link, not a public URL
    const img = page.locator("main img").first();
    await expect(img).toBeVisible();
    const src = await img.getAttribute("src");
    expect(src).toContain("/storage/v1/object/sign/member-photos/");
    expect(src).toContain("token=");
    const size = await img.evaluate((el) => ({ w: (el as HTMLImageElement).naturalWidth, h: (el as HTMLImageElement).naturalHeight }));
    expect(size).toEqual({ w: 512, h: 512 });
    const bytes = Number((await fetch(src!).then((r) => r.headers.get("content-length"))) ?? 0);
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(1_048_576);
    expect(bytes).toBeLessThan(original.length / 3);
    // the bucket is private: the unsigned object URL does not work
    const unsigned = await fetch(`http://127.0.0.1:${SUPA_PORT}/storage/v1/object/public/member-photos/${row!.photo_path}`);
    expect(unsigned.status).toBeGreaterThanOrEqual(400);
    await noHorizontalOverflow("member-with-photo");
    await shot("14-member-with-photo");

    // list shows it too
    await page.goto(`${APP}/members`);
    await expect(page.locator("main img").first()).toBeVisible();
    await shot("15-members-with-photo");
  });

  it("replaces a photo (old file deleted) and removes it on request", async () => {
    const [before] = await sql<{ photo_path: string }>("select photo_path from public.members where full_name = 'Rohit Sharma'");
    await page.goto(`${APP}/members`);
    await page.getByRole("link", { name: /Rohit Sharma/ }).first().click();
    await page.getByRole("link", { name: "Edit" }).click();
    const png = Buffer.from(await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 800; c.height = 600; const g = c.getContext("2d")!; g.fillStyle = "#0ea5e9"; g.fillRect(0, 0, 800, 600); return c.toDataURL("image/png").split(",")[1]!; }), "base64");
    await page.locator("#photo").setInputFiles({ name: "new.png", mimeType: "image/png", buffer: png });
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(/\/members\/[0-9a-f-]{36}$/);
    const [after] = await sql<{ photo_path: string }>("select photo_path from public.members where full_name = 'Rohit Sharma'");
    expect(after!.photo_path).not.toBe(before!.photo_path);
    const objects = await sql<{ name: string }>("select name from storage.objects where bucket_id = 'member-photos'");
    expect(objects.map((o) => o.name)).toEqual([after!.photo_path]); // old object removed, no orphans

    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByRole("button", { name: "Remove photo" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(/\/members\/[0-9a-f-]{36}$/);
    const [gone] = await sql<{ photo_path: string | null }>("select photo_path from public.members where full_name = 'Rohit Sharma'");
    expect(gone!.photo_path).toBeNull();
    expect(await sql("select 1 from storage.objects where bucket_id = 'member-photos'")).toHaveLength(0);
    await expect(page.locator("main img")).toHaveCount(0); // back to initials
  });

  it("rejects a non-image disguised as a photo through the real form, and still saves the rest", async () => {
    await page.goto(`${APP}/members`);
    await page.getByRole("link", { name: /Rohit Sharma/ }).first().click();
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page.locator("#photo")).toBeAttached();
    // Skip the browser-side resize (no change event) to simulate a hostile client posting an SVG as .jpg.
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(["<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"], "evil.jpg", { type: "image/jpeg" }));
      (document.querySelector("#photo") as HTMLInputElement).files = dt.files;
    });
    await page.getByLabel("Notes (optional)").fill("saved despite bad photo");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(/\/members\/[0-9a-f-]{36}$/);
    await toast(/photo not saved: Use a JPEG, PNG or WebP photo/);
    const [m] = await sql<{ photo_path: string | null; notes: string }>("select photo_path, notes from public.members where full_name = 'Rohit Sharma'");
    expect(m).toEqual({ photo_path: null, notes: "saved despite bad photo" });
    expect(await sql("select 1 from storage.objects where bucket_id = 'member-photos'")).toHaveLength(0);
  });

  it("editing plan list prices leaves existing members and bills untouched", async () => {
    await page.goto(`${APP}/settings`);
    await expect(page.getByRole("heading", { name: "Membership plans" })).toBeVisible();
    const monthly = page.locator("form").filter({ has: page.getByRole("heading", { name: "Monthly" }) });
    await monthly.getByLabel("List price (₹)").fill("1200");
    await monthly.getByRole("button", { name: "Save price" }).click();
    await toast("Monthly price saved");
    await noHorizontalOverflow("settings");
    await shot("09-settings");
    const [m] = await sql<{ agreed_price_paise: number }>("select agreed_price_paise from public.members");
    expect(m!.agreed_price_paise).toBe(90_000);
    const periods = await sql<{ amount_due_paise: number }>("select amount_due_paise from public.billing_periods");
    expect(periods.every((p) => p.amount_due_paise === 270_000 || p.amount_due_paise === 90_000)).toBe(true);
  });

  it("won't enable automatic reminders until the server is configured", async () => {
    await page.goto(`${APP}/settings`);
    await page.getByRole("button", { name: "Turn automatic reminders on" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Turn on" }).click();
    await toast(/server is missing/);
    const [s] = await sql<{ reminders_enabled: boolean }>("select reminders_enabled from public.gym_settings");
    expect(s!.reminders_enabled).toBe(false);
    // and the page only ever reports presence, never values
    const html = await page.content();
    expect(html).not.toContain("e2e-app-secret");
    expect(html).not.toContain("e2e-cron-secret");
  });

  it("shows overdue members with a one-tap Mark paid shortcut", async () => {
    const [plan] = await sql<{ id: string }>("select id from public.membership_plans where code = 'monthly'");
    const [member] = await sql<{ id: string }>(
      `insert into public.members (full_name, whatsapp_e164, joined_on, plan_id, agreed_price_paise, first_due_on, billing_anchor_on)
       values ('Late Lata', '+919876500001', $1, $2, 100000, $1, $1) returning id`,
      [addDays(TODAY, -40), plan!.id],
    );
    await sql(
      `insert into public.billing_periods (member_id, period_start, period_end_exclusive, due_on, plan_code_snapshot, duration_months_snapshot, amount_due_paise)
       values ($1, $2, $3, $2, 'monthly', 1, 100000)`,
      [member!.id, addDays(TODAY, -10), addDays(TODAY, 20)],
    );
    await page.goto(`${APP}/`);
    await expect(page.getByText("Overdue", { exact: true }).first().locator("..")).toContainText("₹1,000");
    await expect(page.getByText("Overdue 10d").first()).toBeVisible();
    await noHorizontalOverflow("dashboard-overdue");
    await shot("10-dashboard-overdue");

    await page.getByRole("button", { name: "Mark paid" }).first().click();
    await page.getByRole("button", { name: "Save payment" }).click();
    await toast("fully paid");
    await expect(page.getByText("Nothing overdue")).toBeVisible();
    const [c] = await sql<{ collected: string }>("select dashboard_summary()->>'collected_month_paise' collected");
    expect(Number(c!.collected)).toBeGreaterThanOrEqual(100_000);
  });

  it("filters and searches members by name and phone", async () => {
    await page.goto(`${APP}/members`);
    await expect(page.getByRole("link", { name: /Rohit Sharma/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Late Lata/ })).toBeVisible();
    await page.getByRole("searchbox").fill("lata");
    await page.keyboard.press("Enter");
    await page.waitForURL(/q=lata/);
    await expect(page.getByRole("link", { name: /Rohit Sharma/ })).toHaveCount(0);
    await page.getByRole("searchbox").fill("43210");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("link", { name: /Rohit Sharma/ })).toBeVisible();
    await page.goto(`${APP}/members?filter=overdue`);
    await expect(page.getByText("No members match")).toBeVisible();
    await page.goto(`${APP}/members`);
    await noHorizontalOverflow("members");
    await shot("11-members");
  });

  it("deactivating a member cancels future unpaid dues and stops billing", async () => {
    await page.goto(`${APP}/members`);
    await page.getByRole("link", { name: /Late Lata/ }).click();
    await page.getByText("Deactivate or archive").click();
    await page.getByRole("button", { name: "Continue…" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Yes, stop billing" }).click();
    await toast(/deactivated/);
    await expect(page.getByText("Inactive").first()).toBeVisible();
    await page.goto(`${APP}/members?filter=inactive`);
    await expect(page.getByRole("link", { name: /Late Lata/ })).toBeVisible();
    const [row] = await sql<{ status: string }>("select status from public.members where full_name = 'Late Lata'");
    expect(row!.status).toBe("inactive");
  });

  it("shows the reminders screen with its off-state explained", async () => {
    await page.goto(`${APP}/reminders`);
    await expect(page.getByText(/Automatic reminders are off/)).toBeVisible();
    await noHorizontalOverflow("reminders");
    await shot("12-reminders");
  });
});

describe("scheduler against the real server", () => {
  it("authorised cron run reconciles billing, queues nothing while automation is off, and is idempotent", async () => {
    const run = async () => {
      const r = await fetch(`${APP}/api/cron/daily`, { headers: { authorization: "Bearer e2e-cron-secret" } });
      expect(r.status).toBe(200);
      return r.json() as Promise<{ remindersEnabled: boolean; billing: { created: number; failures: number }; queue: { queued: number } }>;
    };
    const first = await run();
    expect(first.remindersEnabled).toBe(false);
    expect(first.queue.queued).toBe(0);
    expect(first.billing.failures).toBe(0);
    const second = await run();
    expect(second.billing.created).toBe(0);
    const [jobs] = await sql<{ n: number }>("select count(*)::int n from public.message_jobs");
    expect(jobs!.n).toBe(0);
  });

  it("server logs contain no secrets or page errors", async () => {
    expect(serverLog).not.toContain("e2e-app-secret");
    expect(serverLog).not.toContain("e2e-cron-secret");
    expect(serverLog).not.toContain("[pageerror]");
  });
});
