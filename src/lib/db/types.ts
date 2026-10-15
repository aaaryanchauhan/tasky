/**
 * Hand-maintained types mirroring supabase/migrations. Regenerate with
 * `supabase gen types typescript` if you prefer; the shape is compatible.
 */
import type { PlanCode } from "@/lib/billing";
import type { ReminderKind } from "@/lib/reminders";

export type MemberStatus = "active" | "inactive" | "archived";
export type PaymentMethod = "cash" | "upi" | "bank" | "other";
export type JobState = "pending" | "claimed" | "submitted" | "delivered" | "read" | "failed" | "skipped";
export type ErrorKind = "transient" | "permanent" | "ambiguous";
export type PeriodStatus = "unpaid" | "partial" | "paid" | "cancelled";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ProfileRow = {
  id: string;
  role: "admin";
  full_name: string | null;
  created_at: string;
};

export type GymSettingsRow = {
  id: number;
  gym_name: string;
  timezone: string;
  reminders_enabled: boolean;
  updated_at: string;
};

export type PlanRow = {
  id: string;
  code: PlanCode;
  name: string;
  duration_months: number;
  list_price_paise: number;
  updated_at: string;
};

export type MemberRow = {
  id: string;
  full_name: string;
  whatsapp_e164: string;
  alternate_contact: string | null;
  joined_on: string;
  status: MemberStatus;
  deactivated_on: string | null;
  plan_id: string;
  agreed_price_paise: number;
  first_due_on: string;
  billing_anchor_on: string;
  billing_anchor_day: number;
  whatsapp_opt_in_at: string | null;
  whatsapp_opt_in_source: string | null;
  whatsapp_opt_out_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingPeriodRow = {
  id: string;
  member_id: string;
  period_start: string;
  period_end_exclusive: string;
  due_on: string;
  plan_code_snapshot: PlanCode;
  duration_months_snapshot: number;
  amount_due_paise: number;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentRow = {
  id: string;
  billing_period_id: string;
  amount_paise: number;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
};

export type MessageJobRow = {
  id: string;
  billing_period_id: string;
  member_id: string;
  kind: ReminderKind;
  scheduled_for: string;
  to_e164: string;
  state: JobState;
  attempt_count: number;
  next_attempt_at: string;
  claimed_at: string | null;
  meta_message_id: string | null;
  error_kind: ErrorKind | null;
  last_error: string | null;
  skip_reason: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageEventRow = {
  id: string;
  message_job_id: string;
  meta_message_id: string | null;
  event_type: string;
  event_at: string;
  safe_payload: Json;
  created_at: string;
};

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  before_json: Json | null;
  after_json: Json | null;
  created_at: string;
};

export type BillingPeriodSummaryRow = {
  id: string;
  member_id: string;
  member_name: string;
  member_status: MemberStatus;
  member_phone: string;
  period_start: string;
  period_end_exclusive: string;
  due_on: string;
  plan_code_snapshot: PlanCode;
  duration_months_snapshot: number;
  amount_due_paise: number;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  paid_paise: number;
  outstanding_paise: number;
  status: PeriodStatus;
  is_overdue: boolean;
  days_overdue: number;
};

export type MemberOverviewRow = MemberRow & {
  plan_code: PlanCode;
  plan_name: string;
  focus_period_id: string | null;
  focus_due_on: string | null;
  focus_outstanding_paise: number | null;
  focus_status: PeriodStatus | null;
  focus_is_overdue: boolean | null;
  focus_days_overdue: number | null;
};

export type DashboardSummary = {
  today: string;
  active_members: number;
  due_soon_count: number;
  due_soon_paise: number;
  overdue_periods: number;
  overdue_members: number;
  overdue_paise: number;
  collected_month_paise: number;
};

export type PeriodJson = {
  period_start: string;
  period_end_exclusive: string;
  due_on: string;
  plan_code_snapshot: PlanCode;
  duration_months_snapshot: number;
  amount_due_paise: number;
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      gym_settings: Table<GymSettingsRow>;
      membership_plans: Table<PlanRow>;
      members: Table<
        MemberRow,
        Omit<Partial<MemberRow>, "billing_anchor_day"> &
          Pick<
            MemberRow,
            "full_name" | "whatsapp_e164" | "joined_on" | "plan_id" | "agreed_price_paise" | "first_due_on" | "billing_anchor_on"
          >,
        Omit<Partial<MemberRow>, "billing_anchor_day">
      >;
      billing_periods: Table<BillingPeriodRow>;
      payments: Table<PaymentRow>;
      message_jobs: Table<
        MessageJobRow,
        Partial<MessageJobRow> & Pick<MessageJobRow, "billing_period_id" | "member_id" | "kind" | "scheduled_for" | "to_e164">
      >;
      message_events: Table<
        MessageEventRow,
        Partial<MessageEventRow> & Pick<MessageEventRow, "message_job_id" | "event_type">
      >;
      audit_log: Table<
        AuditLogRow,
        Partial<AuditLogRow> & Pick<AuditLogRow, "entity_type" | "action">
      >;
    };
    Views: {
      billing_period_summary: { Row: BillingPeriodSummaryRow; Relationships: [] };
      member_overview: { Row: MemberOverviewRow; Relationships: [] };
    };
    Functions: {
      dashboard_summary: { Args: Record<string, never>; Returns: DashboardSummary };
      ensure_billing_periods: { Args: { p_member_id: string; p_periods: PeriodJson[] }; Returns: number };
      apply_billing_change: {
        Args: {
          p_member_id: string;
          p_plan_id: string;
          p_agreed_price_paise: number;
          p_new_anchor: string;
          p_cancel_ids: string[];
          p_new_periods: PeriodJson[];
          p_reactivate?: boolean;
        };
        Returns: { cancelled: number; created: number };
      };
      set_member_status: {
        Args: { p_member_id: string; p_status: "inactive" | "archived"; p_effective_on: string; p_cancel_ids: string[] };
        Returns: { cancelled: number };
      };
      cancel_billing_period: { Args: { p_period_id: string; p_reason: string }; Returns: undefined };
      record_payment: {
        Args: {
          p_period_id: string;
          p_amount_paise: number;
          p_paid_on: string;
          p_method: PaymentMethod;
          p_reference: string | null;
          p_notes: string | null;
          p_idempotency_key: string | null;
        };
        Returns: { payment_id: string; outstanding_paise: number; duplicate: boolean };
      };
      void_payment: {
        Args: { p_payment_id: string; p_reason: string };
        Returns: { billing_period_id: string; outstanding_paise: number };
      };
      claim_message_jobs: { Args: { p_limit: number }; Returns: MessageJobRow[] };
      claim_message_job: { Args: { p_job_id: string }; Returns: MessageJobRow[] };
      recover_stale_claims: { Args: { p_older_than?: string }; Returns: number };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
