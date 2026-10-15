-- Tiger Fitness — core schema.
-- Money is integer paise. Dates are date-only. Timestamps are timestamptz (UTC).

-- ── Settings & identity ───────────────────────────────────────────────────

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null default 'admin' check (role in ('admin')),
  full_name   text,
  created_at  timestamptz not null default now()
);

create table public.gym_settings (
  id                 smallint primary key default 1 check (id = 1),
  gym_name           text not null default 'Tiger Fitness' check (length(gym_name) between 1 and 80),
  timezone           text not null default 'Asia/Kolkata',
  -- Automation stays OFF until templates, consent and number onboarding are verified.
  reminders_enabled  boolean not null default false,
  updated_at         timestamptz not null default now()
);
insert into public.gym_settings (id) values (1);

create table public.membership_plans (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code in ('monthly', 'quarterly', 'annual')),
  name             text not null,
  duration_months  smallint not null check (duration_months > 0),
  list_price_paise integer not null check (list_price_paise > 0),
  updated_at       timestamptz not null default now()
);
-- Placeholder list prices; the owner edits them in Plans & Settings.
insert into public.membership_plans (code, name, duration_months, list_price_paise) values
  ('monthly',   'Monthly',   1,   100000),
  ('quarterly', 'Quarterly', 3,   270000),
  ('annual',    'Annual',    12, 1000000);

-- ── Members ───────────────────────────────────────────────────────────────

create table public.members (
  id                      uuid primary key default gen_random_uuid(),
  full_name               text not null check (length(btrim(full_name)) between 1 and 120),
  whatsapp_e164           text not null check (whatsapp_e164 ~ '^\+91[6-9][0-9]{9}$'),
  alternate_contact       text check (alternate_contact is null or length(alternate_contact) <= 40),
  joined_on               date not null,
  status                  text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  deactivated_on          date,
  plan_id                 uuid not null references public.membership_plans (id),
  agreed_price_paise      integer not null check (agreed_price_paise > 0),
  -- First billing cycle ever (separate from joined_on) …
  first_due_on            date not null,
  -- … and the anchor of the *current* billing schedule (moves only via an explicit terms change).
  billing_anchor_on       date not null,
  billing_anchor_day      smallint generated always as (extract(day from billing_anchor_on)::smallint) stored,
  whatsapp_opt_in_at      timestamptz,
  whatsapp_opt_in_source  text check (whatsapp_opt_in_source is null or length(whatsapp_opt_in_source) <= 120),
  whatsapp_opt_out_at     timestamptz,
  notes                   text check (notes is null or length(notes) <= 1000),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint members_opt_in_has_source check (whatsapp_opt_in_at is null or whatsapp_opt_in_source is not null)
);
create index members_status_idx on public.members (status);
create index members_phone_idx on public.members (whatsapp_e164);
create index members_name_idx on public.members (lower(full_name));

-- ── Billing ───────────────────────────────────────────────────────────────

create table public.billing_periods (
  id                       uuid primary key default gen_random_uuid(),
  member_id                uuid not null references public.members (id) on delete restrict,
  period_start             date not null,
  period_end_exclusive     date not null,
  due_on                   date not null,
  -- Snapshots: later plan/price edits never rewrite a generated period.
  plan_code_snapshot       text not null check (plan_code_snapshot in ('monthly', 'quarterly', 'annual')),
  duration_months_snapshot smallint not null check (duration_months_snapshot > 0),
  amount_due_paise         integer not null check (amount_due_paise > 0),
  cancelled_at             timestamptz,
  cancel_reason            text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint billing_periods_valid_range check (period_end_exclusive > period_start),
  constraint billing_periods_cancel_reason check (cancelled_at is null or cancel_reason is not null)
);
-- Stable cycle identity: at most one *live* period per member per start date.
create unique index billing_periods_member_start_uq
  on public.billing_periods (member_id, period_start) where cancelled_at is null;
create index billing_periods_due_idx on public.billing_periods (due_on) where cancelled_at is null;
create index billing_periods_member_idx on public.billing_periods (member_id, period_start desc);

create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  billing_period_id  uuid not null references public.billing_periods (id) on delete restrict,
  amount_paise       integer not null check (amount_paise > 0),
  paid_on            date not null,
  method             text not null check (method in ('cash', 'upi', 'bank', 'other')),
  reference          text check (reference is null or length(reference) <= 120),
  notes              text check (notes is null or length(notes) <= 500),
  idempotency_key    text unique,
  created_by         uuid references auth.users (id),
  created_at         timestamptz not null default now(),
  voided_at          timestamptz,
  voided_by          uuid references auth.users (id),
  void_reason        text,
  constraint payments_void_has_reason check (voided_at is null or void_reason is not null)
);
create index payments_period_idx on public.payments (billing_period_id);
create index payments_paid_on_idx on public.payments (paid_on) where voided_at is null;

-- ── WhatsApp reminders ────────────────────────────────────────────────────

create table public.message_jobs (
  id                 uuid primary key default gen_random_uuid(),
  billing_period_id  uuid not null references public.billing_periods (id) on delete restrict,
  member_id          uuid not null references public.members (id) on delete restrict,
  kind               text not null check (kind in ('before_due', 'overdue')),
  scheduled_for      date not null,
  -- Number captured at queue time; a later phone edit must not redirect an old job.
  to_e164            text not null check (to_e164 ~ '^\+91[6-9][0-9]{9}$'),
  state              text not null default 'pending'
                       check (state in ('pending', 'claimed', 'submitted', 'delivered', 'read', 'failed', 'skipped')),
  attempt_count      smallint not null default 0 check (attempt_count >= 0),
  next_attempt_at    timestamptz not null default now(),
  claimed_at         timestamptz,
  meta_message_id    text,
  error_kind         text check (error_kind is null or error_kind in ('transient', 'permanent', 'ambiguous')),
  last_error         text,
  skip_reason        text,
  sent_at            timestamptz,
  delivered_at       timestamptz,
  read_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- The duplicate-reminder guard: one job per billing period per template type, ever.
  constraint message_jobs_period_kind_uq unique (billing_period_id, kind)
);
create index message_jobs_state_idx on public.message_jobs (state, next_attempt_at);
create index message_jobs_member_idx on public.message_jobs (member_id, created_at desc);
create index message_jobs_meta_id_idx on public.message_jobs (meta_message_id) where meta_message_id is not null;

create table public.message_events (
  id               uuid primary key default gen_random_uuid(),
  message_job_id   uuid not null references public.message_jobs (id) on delete cascade,
  meta_message_id  text,
  event_type       text not null,
  event_at         timestamptz not null default now(),
  -- Sanitised summary only (status codes, error codes). Never raw webhook bodies.
  safe_payload     jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  -- Meta re-delivers webhooks; the same event must only be recorded once.
  constraint message_events_dedupe unique (message_job_id, event_type, event_at)
);
create index message_events_job_idx on public.message_events (message_job_id, event_at);

create table public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid,
  entity_type  text not null,
  entity_id    uuid,
  action       text not null,
  before_json  jsonb,
  after_json   jsonb,
  created_at   timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);

-- ── Triggers ──────────────────────────────────────────────────────────────

create function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger gym_settings_updated before update on public.gym_settings
  for each row execute function public.set_updated_at();
create trigger membership_plans_updated before update on public.membership_plans
  for each row execute function public.set_updated_at();
create trigger members_updated before update on public.members
  for each row execute function public.set_updated_at();
create trigger billing_periods_updated before update on public.billing_periods
  for each row execute function public.set_updated_at();
create trigger message_jobs_updated before update on public.message_jobs
  for each row execute function public.set_updated_at();

-- Payments are append-only: they can be voided (with a reason) but never edited or deleted,
-- and they can never push a period past its amount due.
create function public.payments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_due        integer;
  v_cancelled  timestamptz;
  v_paid       bigint;
begin
  if tg_op = 'INSERT' then
    select amount_due_paise, cancelled_at into v_due, v_cancelled
      from public.billing_periods where id = new.billing_period_id for update;
    if not found then
      raise exception 'Billing period not found' using errcode = '23503';
    end if;
    if v_cancelled is not null then
      raise exception 'Billing period is cancelled' using errcode = '23514';
    end if;
    if new.voided_at is not null then
      raise exception 'Payments cannot be created already voided' using errcode = '23514';
    end if;
    select coalesce(sum(amount_paise), 0) into v_paid
      from public.payments where billing_period_id = new.billing_period_id and voided_at is null;
    if v_paid + new.amount_paise > v_due then
      raise exception 'Payment exceeds the outstanding balance' using errcode = '23514';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'voided_at' - 'voided_by' - 'void_reason')
         is distinct from (to_jsonb(old) - 'voided_at' - 'voided_by' - 'void_reason') then
      raise exception 'Payments are immutable; void the payment and record a new one' using errcode = '23514';
    end if;
    if old.voided_at is not null then
      raise exception 'Payment is already voided' using errcode = '23514';
    end if;
    return new;
  end if;
  raise exception 'Payments cannot be deleted; void them instead' using errcode = '23514';
end $$;

create trigger payments_guard_trg
  before insert or update or delete on public.payments
  for each row execute function public.payments_guard();
