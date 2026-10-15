-- Tiger Fitness — authorization helpers, derived views, transactional functions, RLS.

-- ── Helpers ───────────────────────────────────────────────────────────────

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create function public.is_service_role() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
$$;

create function public.assert_admin() returns void
language plpgsql stable as $$
begin
  if not (public.is_admin() or public.is_service_role()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end $$;

-- "Today" in the gym's time zone (Asia/Kolkata by default). All overdue maths uses this.
create function public.app_today() returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.gym_settings where id = 1), 'Asia/Kolkata'))::date
$$;

create function public.write_audit(
  p_entity_type text, p_entity_id uuid, p_action text, p_before jsonb, p_after jsonb
) returns void
language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, entity_type, entity_id, action, before_json, after_json)
  values (auth.uid(), p_entity_type, p_entity_id, p_action, p_before, p_after)
$$;

-- ── Derived views (balance and overdue are never stored) ──────────────────

create view public.billing_period_summary with (security_invoker = true) as
select
  bp.id,
  bp.member_id,
  m.full_name            as member_name,
  m.status               as member_status,
  m.whatsapp_e164        as member_phone,
  bp.period_start,
  bp.period_end_exclusive,
  bp.due_on,
  bp.plan_code_snapshot,
  bp.duration_months_snapshot,
  bp.amount_due_paise,
  bp.cancelled_at,
  bp.cancel_reason,
  bp.created_at,
  coalesce(p.paid, 0)::integer as paid_paise,
  case when bp.cancelled_at is not null then 0
       else greatest(bp.amount_due_paise - coalesce(p.paid, 0), 0)::integer end as outstanding_paise,
  case
    when bp.cancelled_at is not null then 'cancelled'
    when bp.amount_due_paise - coalesce(p.paid, 0) <= 0 then 'paid'
    when coalesce(p.paid, 0) > 0 then 'partial'
    else 'unpaid'
  end as status,
  (bp.cancelled_at is null
     and bp.amount_due_paise - coalesce(p.paid, 0) > 0
     and bp.due_on < public.app_today()) as is_overdue,
  case when bp.cancelled_at is null
        and bp.amount_due_paise - coalesce(p.paid, 0) > 0
        and bp.due_on < public.app_today()
       then public.app_today() - bp.due_on else 0 end as days_overdue
from public.billing_periods bp
join public.members m on m.id = bp.member_id
left join lateral (
  select sum(py.amount_paise) as paid
  from public.payments py
  where py.billing_period_id = bp.id and py.voided_at is null
) p on true;

-- One row per member with their "focus" period: the oldest period with a balance.
create view public.member_overview with (security_invoker = true) as
select
  m.*,
  pl.code as plan_code,
  pl.name as plan_name,
  f.id                as focus_period_id,
  f.due_on            as focus_due_on,
  f.outstanding_paise as focus_outstanding_paise,
  f.status            as focus_status,
  f.is_overdue        as focus_is_overdue,
  f.days_overdue      as focus_days_overdue
from public.members m
join public.membership_plans pl on pl.id = m.plan_id
left join lateral (
  select s.* from public.billing_period_summary s
  where s.member_id = m.id and s.outstanding_paise > 0
  order by s.due_on asc
  limit 1
) f on true;

create function public.dashboard_summary() returns jsonb
language sql stable security invoker set search_path = public as $$
  with t as (select public.app_today() as today)
  select jsonb_build_object(
    'today', t.today,
    'active_members', (select count(*) from public.members where status = 'active'),
    'due_soon_count', (select count(*) from public.billing_period_summary s
                        where s.outstanding_paise > 0 and s.due_on >= t.today and s.due_on <= t.today + 7),
    'due_soon_paise', (select coalesce(sum(s.outstanding_paise), 0) from public.billing_period_summary s
                        where s.outstanding_paise > 0 and s.due_on >= t.today and s.due_on <= t.today + 7),
    'overdue_periods', (select count(*) from public.billing_period_summary s where s.is_overdue),
    'overdue_members', (select count(distinct s.member_id) from public.billing_period_summary s where s.is_overdue),
    'overdue_paise', (select coalesce(sum(s.outstanding_paise), 0) from public.billing_period_summary s where s.is_overdue),
    'collected_month_paise', (select coalesce(sum(py.amount_paise), 0) from public.payments py
                               where py.voided_at is null
                                 and py.paid_on >= date_trunc('month', t.today)::date
                                 and py.paid_on <  (date_trunc('month', t.today) + interval '1 month')::date)
  ) from t
$$;

-- ── Billing functions ─────────────────────────────────────────────────────

-- Idempotent, concurrency-safe period creation. Each member-period exists at most once.
create function public.ensure_billing_periods(p_member_id uuid, p_periods jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare v_inserted integer;
begin
  perform public.assert_admin();
  if not exists (select 1 from public.members where id = p_member_id and status = 'active') then
    return 0;  -- inactive/archived members never gain new periods
  end if;
  insert into public.billing_periods
    (member_id, period_start, period_end_exclusive, due_on, plan_code_snapshot, duration_months_snapshot, amount_due_paise)
  select p_member_id, (e->>'period_start')::date, (e->>'period_end_exclusive')::date, (e->>'due_on')::date,
         e->>'plan_code_snapshot', (e->>'duration_months_snapshot')::smallint, (e->>'amount_due_paise')::integer
  from jsonb_array_elements(coalesce(p_periods, '[]'::jsonb)) e
  -- A period an admin cancelled on purpose must not be resurrected by the daily reconciler.
  where not exists (
    select 1 from public.billing_periods x
     where x.member_id = p_member_id and x.period_start = (e->>'period_start')::date and x.cancelled_at is not null)
  on conflict (member_id, period_start) where cancelled_at is null do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end $$;

-- Apply an explicitly previewed change of plan / agreed price / billing anchor.
-- History is preserved: unpaid future periods are cancelled (never deleted) and new ones created.
create function public.apply_billing_change(
  p_member_id uuid,
  p_plan_id uuid,
  p_agreed_price_paise integer,
  p_new_anchor date,
  p_cancel_ids uuid[],
  p_new_periods jsonb,
  p_reactivate boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_before    jsonb;
  v_after     jsonb;
  v_bad       integer;
  v_cancelled integer := 0;
  v_created   integer := 0;
begin
  perform public.assert_admin();
  select to_jsonb(m) into v_before from public.members m where m.id = p_member_id for update;
  if v_before is null then raise exception 'Member not found' using errcode = 'P0002'; end if;
  if v_before->>'status' = 'archived' then
    raise exception 'Archived members cannot be changed' using errcode = '23514';
  end if;
  if not p_reactivate and v_before->>'status' <> 'active' then
    raise exception 'Member is not active' using errcode = '23514';
  end if;

  if coalesce(cardinality(p_cancel_ids), 0) > 0 then
    select count(*) into v_bad from public.billing_periods bp
     where bp.id = any (p_cancel_ids)
       and (bp.member_id <> p_member_id
            or bp.cancelled_at is not null
            or exists (select 1 from public.payments py where py.billing_period_id = bp.id and py.voided_at is null));
    if v_bad > 0 then
      raise exception 'A period changed since the preview (payment recorded or already cancelled). Review and try again.'
        using errcode = '40001';
    end if;
    update public.billing_periods
       set cancelled_at = now(), cancel_reason = 'Billing terms changed'
     where id = any (p_cancel_ids);
    get diagnostics v_cancelled = row_count;
    update public.message_jobs set state = 'skipped', skip_reason = 'period_cancelled'
     where billing_period_id = any (p_cancel_ids) and state = 'pending';
  end if;

  update public.members
     set plan_id = p_plan_id,
         agreed_price_paise = p_agreed_price_paise,
         billing_anchor_on = p_new_anchor,
         status = case when p_reactivate then 'active' else status end,
         deactivated_on = case when p_reactivate then null else deactivated_on end
   where id = p_member_id;

  insert into public.billing_periods
    (member_id, period_start, period_end_exclusive, due_on, plan_code_snapshot, duration_months_snapshot, amount_due_paise)
  select p_member_id, (e->>'period_start')::date, (e->>'period_end_exclusive')::date, (e->>'due_on')::date,
         e->>'plan_code_snapshot', (e->>'duration_months_snapshot')::smallint, (e->>'amount_due_paise')::integer
  from jsonb_array_elements(coalesce(p_new_periods, '[]'::jsonb)) e
  on conflict (member_id, period_start) where cancelled_at is null do nothing;
  get diagnostics v_created = row_count;

  select to_jsonb(m) into v_after from public.members m where m.id = p_member_id;
  perform public.write_audit('member', p_member_id, 'billing_terms_changed', v_before,
    v_after || jsonb_build_object('cancelled_periods', v_cancelled, 'created_periods', v_created));
  return jsonb_build_object('cancelled', v_cancelled, 'created', v_created);
end $$;

-- Deactivate or archive a member from an effective date. Future unpaid periods are cancelled;
-- anything already started (or paid) stays, with its balance.
create function public.set_member_status(
  p_member_id uuid, p_status text, p_effective_on date, p_cancel_ids uuid[]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_before    jsonb;
  v_bad       integer;
  v_cancelled integer := 0;
begin
  perform public.assert_admin();
  if p_status not in ('inactive', 'archived') then
    raise exception 'Use apply_billing_change to reactivate a member' using errcode = '22023';
  end if;
  select to_jsonb(m) into v_before from public.members m where m.id = p_member_id for update;
  if v_before is null then raise exception 'Member not found' using errcode = 'P0002'; end if;

  if coalesce(cardinality(p_cancel_ids), 0) > 0 then
    select count(*) into v_bad from public.billing_periods bp
     where bp.id = any (p_cancel_ids)
       and (bp.member_id <> p_member_id
            or bp.cancelled_at is not null
            or exists (select 1 from public.payments py where py.billing_period_id = bp.id and py.voided_at is null));
    if v_bad > 0 then
      raise exception 'A period changed since the preview. Review and try again.' using errcode = '40001';
    end if;
    update public.billing_periods
       set cancelled_at = now(), cancel_reason = 'Member ' || p_status
     where id = any (p_cancel_ids);
    get diagnostics v_cancelled = row_count;
  end if;

  update public.members set status = p_status, deactivated_on = p_effective_on where id = p_member_id;
  -- No reminders after deactivation.
  update public.message_jobs set state = 'skipped', skip_reason = 'member_not_active'
   where member_id = p_member_id and state = 'pending';

  perform public.write_audit('member', p_member_id, 'status_' || p_status, v_before,
    jsonb_build_object('status', p_status, 'effective_on', p_effective_on, 'cancelled_periods', v_cancelled));
  return jsonb_build_object('cancelled', v_cancelled);
end $$;

create function public.cancel_billing_period(p_period_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  perform public.assert_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select to_jsonb(bp) into v_before from public.billing_periods bp where bp.id = p_period_id for update;
  if v_before is null then raise exception 'Billing period not found' using errcode = 'P0002'; end if;
  if v_before->>'cancelled_at' is not null then raise exception 'Already cancelled' using errcode = '23514'; end if;
  if exists (select 1 from public.payments where billing_period_id = p_period_id and voided_at is null) then
    raise exception 'Void the payments on this period before cancelling it' using errcode = '23514';
  end if;
  update public.billing_periods set cancelled_at = now(), cancel_reason = btrim(p_reason) where id = p_period_id;
  update public.message_jobs set state = 'skipped', skip_reason = 'period_cancelled'
   where billing_period_id = p_period_id and state = 'pending';
  perform public.write_audit('billing_period', p_period_id, 'cancelled', v_before, jsonb_build_object('reason', p_reason));
end $$;

-- ── Payments ──────────────────────────────────────────────────────────────

create function public.record_payment(
  p_period_id uuid,
  p_amount_paise integer,
  p_paid_on date,
  p_method text,
  p_reference text,
  p_notes text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id          uuid;
  v_outstanding integer;
  v_duplicate   boolean := false;
begin
  perform public.assert_admin();

  -- A double-clicked / re-submitted form carries the same key and yields the same payment.
  if p_idempotency_key is not null then
    select id into v_id from public.payments where idempotency_key = p_idempotency_key;
    if v_id is not null then v_duplicate := true; end if;
  end if;

  if v_id is null then
    begin
      insert into public.payments (billing_period_id, amount_paise, paid_on, method, reference, notes, idempotency_key, created_by)
      values (p_period_id, p_amount_paise, p_paid_on, p_method, nullif(btrim(p_reference), ''), nullif(btrim(p_notes), ''),
              p_idempotency_key, auth.uid())
      returning id into v_id;
    exception when unique_violation then
      select id into v_id from public.payments where idempotency_key = p_idempotency_key;
      v_duplicate := true;
    end;
    if not v_duplicate then
      perform public.write_audit('payment', v_id, 'recorded', null,
        jsonb_build_object('billing_period_id', p_period_id, 'amount_paise', p_amount_paise,
                           'paid_on', p_paid_on, 'method', p_method));
    end if;
  end if;

  select outstanding_paise into v_outstanding from public.billing_period_summary where id = p_period_id;
  if v_outstanding = 0 then
    -- Fully settled: pending follow-ups for this period are no longer needed.
    update public.message_jobs set state = 'skipped', skip_reason = 'already_paid'
     where billing_period_id = p_period_id and state = 'pending';
  end if;
  return jsonb_build_object('payment_id', v_id, 'outstanding_paise', v_outstanding, 'duplicate', v_duplicate);
end $$;

-- Reversal: keep the row, mark it void with a reason, recalculate. No retroactive reminders are sent.
create function public.void_payment(p_payment_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_before      jsonb;
  v_period      uuid;
  v_outstanding integer;
begin
  perform public.assert_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select to_jsonb(py), py.billing_period_id into v_before, v_period
    from public.payments py where py.id = p_payment_id for update;
  if v_before is null then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if v_before->>'voided_at' is not null then raise exception 'Payment is already voided' using errcode = '23514'; end if;

  update public.payments set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason) where id = p_payment_id;
  perform public.write_audit('payment', p_payment_id, 'voided', v_before, jsonb_build_object('reason', p_reason));
  select outstanding_paise into v_outstanding from public.billing_period_summary where id = v_period;
  return jsonb_build_object('billing_period_id', v_period, 'outstanding_paise', v_outstanding);
end $$;

-- ── Message queue (service role only) ─────────────────────────────────────

-- Atomically claim due jobs. SKIP LOCKED makes concurrent cron runs safe: a job is claimed once.
create function public.claim_message_jobs(p_limit integer) returns setof public.message_jobs
language sql security definer set search_path = public as $$
  update public.message_jobs j
     set state = 'claimed', claimed_at = now(), attempt_count = j.attempt_count + 1
   where j.id in (
     select id from public.message_jobs
      where state = 'pending' and next_attempt_at <= now()
      order by next_attempt_at, created_at
      limit greatest(p_limit, 0)
      for update skip locked)
  returning j.*
$$;

create function public.claim_message_job(p_job_id uuid) returns setof public.message_jobs
language sql security definer set search_path = public as $$
  update public.message_jobs j
     set state = 'claimed', claimed_at = now(), attempt_count = j.attempt_count + 1
   where j.id = (select id from public.message_jobs where id = p_job_id and state = 'pending' for update skip locked)
  returning j.*
$$;

-- A worker that died mid-send leaves a job 'claimed'. We cannot know whether Meta accepted it,
-- so it becomes an *ambiguous* failure that needs a human to confirm before any resend.
create function public.recover_stale_claims(p_older_than interval default interval '15 minutes') returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update public.message_jobs
     set state = 'failed', error_kind = 'ambiguous',
         last_error = 'Send was interrupted; outcome unknown. Check WhatsApp before retrying.'
   where state = 'claimed' and claimed_at < now() - p_older_than;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ── Grants ────────────────────────────────────────────────────────────────

-- Supabase's default privileges hand EXECUTE on new functions to anon/authenticated, so strip
-- everything and grant back only what each role needs.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_admin(), public.app_today() to authenticated, service_role;
grant execute on function
  public.dashboard_summary(),
  public.ensure_billing_periods(uuid, jsonb),
  public.apply_billing_change(uuid, uuid, integer, date, uuid[], jsonb, boolean),
  public.set_member_status(uuid, text, date, uuid[]),
  public.cancel_billing_period(uuid, text),
  public.record_payment(uuid, integer, date, text, text, text, text),
  public.void_payment(uuid, text)
  to authenticated, service_role;
grant execute on function
  public.claim_message_jobs(integer),
  public.claim_message_job(uuid),
  public.recover_stale_claims(interval)
  to service_role;

-- ── Row level security ────────────────────────────────────────────────────

alter table public.profiles         enable row level security;
alter table public.gym_settings     enable row level security;
alter table public.membership_plans enable row level security;
alter table public.members          enable row level security;
alter table public.billing_periods  enable row level security;
alter table public.payments         enable row level security;
alter table public.message_jobs     enable row level security;
alter table public.message_events   enable row level security;
alter table public.audit_log        enable row level security;

create policy profiles_self_read on public.profiles for select to authenticated using (id = auth.uid());

create policy settings_admin_read   on public.gym_settings for select to authenticated using (public.is_admin());
create policy settings_admin_update on public.gym_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy plans_admin_read   on public.membership_plans for select to authenticated using (public.is_admin());
create policy plans_admin_update on public.membership_plans for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy members_admin_read   on public.members for select to authenticated using (public.is_admin());
create policy members_admin_insert on public.members for insert to authenticated with check (public.is_admin());
create policy members_admin_update on public.members for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy periods_admin_read   on public.billing_periods for select to authenticated using (public.is_admin());
create policy periods_admin_insert on public.billing_periods for insert to authenticated with check (public.is_admin());

create policy payments_admin_read on public.payments for select to authenticated using (public.is_admin());

create policy jobs_admin_read     on public.message_jobs   for select to authenticated using (public.is_admin());
create policy events_admin_read   on public.message_events for select to authenticated using (public.is_admin());
create policy audit_admin_read    on public.audit_log      for select to authenticated using (public.is_admin());
create policy audit_admin_insert  on public.audit_log      for insert to authenticated
  with check (public.is_admin() and actor_id = auth.uid());
-- Everything else (payments, jobs, events) is written through the functions above or the
-- service-role key on the server; there is deliberately no direct client write path.
