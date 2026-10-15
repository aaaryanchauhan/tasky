# Tiger Fitness — Gym Management

A small, phone-first admin app for **Tiger Fitness**: members, flexible plans (monthly / quarterly / annual), fee collection, and automatic **WhatsApp payment reminders** through the official Meta WhatsApp Cloud API.

> Principle: small, reliable, easy to operate on a phone. Not a generic gym ERP.

- **Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres, Auth, RLS) · Zod · Vercel Cron
- **Money** is stored as integer paise. **Dates** are date-only; all "today" logic uses `Asia/Kolkata`.

## What it does

| Area | Behaviour |
| --- | --- |
| Members | Add / edit / search / filter; optional **photo** (camera or gallery); deactivate or archive (never hard-delete, payment history is kept) |
| Plans | Edit the three list prices; a member's *agreed fee* overrides list price; list-price edits never touch existing members or generated bills |
| Billing | Calendar-month arithmetic (Jan 31 → Feb 28/29 → Mar 31, leap-day safe). Fees are paid **in advance**: a term is due the day it starts. Periods are generated 7 days ahead; creation is idempotent |
| Changes | Plan / fee / due-date changes need an effective date and show a preview. Started or paid terms are never rewritten or prorated |
| Payments | Per-period, partial payments supported, over-payment blocked, double-submit safe, **reversal (void) with reason + audit entry** instead of editing/deleting |
| Reminders | `gym_fee_reminder` 1 day before due, `gym_fee_overdue` 3 days after if still unpaid. One job per period + type (DB unique constraint). Everything re-checked right before sending |
| Delivery | Meta webhook (HMAC-verified) updates accepted → delivered → read / failed. API acceptance is **not** treated as delivery |
| Consent | Opt-in timestamp + source; opt-out via staff or a WhatsApp "STOP" reply; missing consent blocks sending and is visible in the UI |

Out of scope (by design): member portal, attendance, payment gateway, bulk marketing, multi-branch, accounting.

## Local setup

Requirements: Node ≥ 20.9, a Supabase project (or the Supabase CLI for a local stack).

```bash
npm install
cp .env.example .env.local        # fill in the values (see below)
```

1. **Database** — apply `supabase/migrations/*.sql` in order (SQL editor, or `supabase db push` / `supabase start`).
2. **Auth** — in Supabase → Authentication, **disable "Allow new users to sign up"**. Even if it were left on, a user without a row in `profiles` has no access to anything (RLS + `requireAdmin`).
3. **First admin** (service-role key stays on your machine):
   ```bash
   ADMIN_PASSWORD='a-long-password' npm run create-admin -- owner@example.com
   ```
4. **Run**
   ```bash
   npm run dev          # http://localhost:3000
   ```
5. *(optional, dev only)* labelled demo data: `DEMO_WHATSAPP_NUMBER='+91…' npm run seed-demo -- --yes`

Seed plan prices (₹1,000 / ₹2,700 / ₹10,000) are placeholders — set the real ones in **Settings**.

### Environment variables

See `.env.example`. Only `NEXT_PUBLIC_*` values reach the browser. Everything else (service-role key, WhatsApp token, app secret, verify token, cron secret) is server-only and is never rendered by the UI — Settings only reports *whether* each is set.

## Tests

```bash
npm run test:all     # lint + typecheck + unit/integration
npm test             # vitest: date math, billing, reminders, WhatsApp, SQL (PGlite), routes
npm run build && npm run test:e2e   # Chromium at 360px against the production build
```

- **SQL integration tests** run the real migrations in PGlite (in-process Postgres) with a stubbed Supabase `auth` schema: constraints, RLS, privileges, payments, reversals, job claiming, duplicate prevention.
- **Pipeline tests** run the real queue/send/webhook services against that schema with Meta mocked.
- **E2E** uses a *test-only* PostgREST/Auth stand-in (`tests/e2e/fake-supabase-server.ts`). It is not a substitute for `supabase start`; run your own smoke test against a real project before go-live.

## Member photos

Optional per member, added on the Add/Edit screen (the phone's camera or gallery).

- **Resized on the phone** to a 512 px square JPEG before upload (typically 50–150 KB; EXIF location data is dropped). The server still enforces a 1 MB cap and checks the file's real type (JPEG/PNG/WebP — an SVG renamed `.jpg` is rejected).
- Stored in a **private** Supabase Storage bucket (`member-photos`, created by the third migration). Only admins can read or write it (RLS); photos are shown through 1-hour signed links created on the server, never public URLs.
- Replacing or removing a photo deletes the old file. **Archiving a member deletes their photo** (payment history is kept). Photos are never sent in WhatsApp messages.
- Photos are personal data: mention them in the gym's privacy notice.

## Deploy (Vercel)

1. Create the Vercel project from this repo; set all env vars from `.env.example` (Production).
2. `vercel.json` registers `GET /api/cron/daily` at `30 3 * * *` UTC = **09:00 IST**. Vercel sends `Authorization: Bearer $CRON_SECRET`. The route is closed (503) if `CRON_SECRET` is unset and 401 for any other caller.
   - Hobby plans allow once-a-day crons. That is enough for the reminders; transient-failure retries are then picked up on the next daily run. On Pro (or any external scheduler) you can also call the same endpoint every 30 min — it is idempotent.
3. Set the Meta webhook callback to `https://<your-domain>/api/whatsapp/webhook` with your `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, and subscribe to **messages**.
4. Keep **Automatic reminders OFF** (Settings) until the [Meta onboarding checklist](docs/meta-onboarding.md) is complete and a test message has been delivered.

## How the safety properties are enforced

- **No duplicate periods/reminders:** `unique (member_id, period_start) where not cancelled`, and `unique (billing_period_id, kind)` on jobs; jobs are claimed with `FOR UPDATE SKIP LOCKED`.
- **No wrong/late sends:** `evaluateSend` re-checks status, consent, phone (snapshotted on the job), balance, cancellation and the send window immediately before every message.
- **Payments are append-only:** a trigger blocks edits/deletes and over-payment; voiding needs a reason and writes `audit_log`.
- **Ambiguous outcomes:** a timeout / 5xx / crashed worker is parked as `failed (ambiguous)` — never auto-resent. Manual retry requires confirming you checked WhatsApp. Only definite rate-limit rejections retry automatically (3 attempts, backoff).
- **Authorization:** RLS on every table for `profiles.role = 'admin'`; sensitive functions are not executable by `anon`/`authenticated` (queue functions: service role only); the service-role client is `server-only`; cron and webhook authenticate with a secret / HMAC.

## Decisions to confirm with the owner before go-live

1. Are fees paid in advance for each term? (Implemented: yes.)
2. First payment on joining date, or a separate date? (Both supported — chosen per member.)
3. Existing WhatsApp Business app number (coexistence) or a dedicated API number? (See checklist.)
4. The exact consent process for fee reminders (the app records source + timestamp).
5. How common are partial payments? (Supported.)
