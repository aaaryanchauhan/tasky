"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  checkWhatsAppAction,
  setRemindersAction,
  testSendAction,
  updateGymAction,
  updatePlanPriceAction,
} from "@/app/actions/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm";
import { Field, FormMessage, SubmitButton, TextInput } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { formatDateIN } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import type { ActionState } from "@/app/actions/shared";
import type { ConnectionReport } from "@/server/whatsapp/graph";

function useToastOnResult(state: ActionState) {
  const { show } = useToast();
  useEffect(() => {
    if (state?.message) show(state.message, state.ok ? "ok" : "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

export function PlanPriceForm({
  plan,
}: {
  plan: { id: string; name: string; durationMonths: number; pricePaise: number; updatedAt: string };
}) {
  const [state, action] = useActionState(updatePlanPriceAction, null);
  useToastOnResult(state);
  const errors = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="planId" value={plan.id} />
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-bold">{plan.name}</h3>
        <span className="text-sm text-ink-soft">
          {plan.durationMonths} calendar month{plan.durationMonths > 1 ? "s" : ""}
        </span>
      </div>
      <Field
        label="List price (₹)"
        htmlFor={`price-${plan.id}`}
        error={errors.price}
        hint={`Now ${formatINR(plan.pricePaise)} · last updated ${formatDateIN(plan.updatedAt.slice(0, 10))}. Affects new assignments only.`}
      >
        <TextInput
          id={`price-${plan.id}`}
          name="price"
          inputMode="decimal"
          required
          defaultValue={state?.values?.price ?? String(plan.pricePaise / 100)}
          error={errors.price}
        />
      </Field>
      <SubmitButton variant="secondary">Save price</SubmitButton>
    </form>
  );
}

export function GymForm({ gymName, timezone }: { gymName: string; timezone: string }) {
  const [state, action] = useActionState(updateGymAction, null);
  useToastOnResult(state);
  const errors = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Gym name" htmlFor="gymName" error={errors.gymName}>
        <TextInput id="gymName" required maxLength={80} defaultValue={state?.values?.gymName ?? gymName} error={errors.gymName} />
      </Field>
      <Field label="Time zone" htmlFor="timezone" error={errors.timezone} hint="Used for due dates and reminder timing.">
        <TextInput id="timezone" required defaultValue={state?.values?.timezone ?? timezone} error={errors.timezone} />
      </Field>
      <SubmitButton variant="secondary">Save details</SubmitButton>
    </form>
  );
}

export function RemindersToggle({ enabled }: { enabled: boolean }) {
  const [state, action] = useActionState(setRemindersAction, null);
  useToastOnResult(state);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <div className="flex items-center gap-3">
        <Badge tone={enabled ? "good" : "warn"}>{enabled ? "ON" : "OFF"}</Badge>
        <span className="text-sm text-ink-soft">
          {enabled ? "Reminders are sent automatically each morning." : "Nothing is queued or sent while this is off."}
        </span>
      </div>
      {!state?.ok ? <FormMessage state={state} /> : null}
      <ConfirmSubmit
        label={enabled ? "Turn automatic reminders off" : "Turn automatic reminders on"}
        variant={enabled ? "secondary" : "primary"}
        title={enabled ? "Turn reminders off?" : "Turn reminders on?"}
        description={
          enabled
            ? "No further reminders will be queued or sent. Anything already queued is skipped at send time."
            : "From the next daily run, members with recorded consent get a WhatsApp message the day before their fee is due and three days after if it's unpaid. Only turn this on after your templates are approved and a test message worked."
        }
        confirmLabel={enabled ? "Turn off" : "Turn on"}
      />
    </form>
  );
}

export function TestSend({ allowed }: { allowed: boolean }) {
  const [state, action] = useActionState(testSendAction, null);
  useToastOnResult(state);
  if (!allowed) {
    return (
      <p className="text-sm text-ink-soft">
        Test sends are disabled in production. Set <code>WHATSAPP_ALLOW_TEST_SEND=true</code> on the server to enable them temporarily.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-3" noValidate>
      <Field
        label="Send a test reminder to"
        htmlFor="phone"
        error={state?.fieldErrors?.phone}
        hint="Sends the gym_fee_reminder template with sample values. With Meta's test number, the recipient must be on your allowed list."
      >
        <TextInput id="phone" type="tel" inputMode="tel" required defaultValue={state?.values?.phone ?? ""} error={state?.fieldErrors?.phone} />
      </Field>
      <SubmitButton variant="secondary" pendingLabel="Sending…">
        Send test message
      </SubmitButton>
    </form>
  );
}

export function ConnectionCheck() {
  const [report, setReport] = useState<ConnectionReport | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => start(async () => setReport(await checkWhatsAppAction()))}
      >
        {pending ? "Checking…" : "Check connection with Meta"}
      </Button>
      {report ? (
        report.ok ? (
          <div className="space-y-1 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
            <p className="font-semibold">Connected</p>
            {report.phone ? (
              <p>
                {report.phone.verifiedName} · {report.phone.displayNumber} · quality {report.phone.quality || "n/a"}
              </p>
            ) : null}
            {report.templates ? (
              report.templates.length ? (
                <ul className="list-disc pl-5">
                  {report.templates.map((t) => (
                    <li key={`${t.name}-${t.language}`}>
                      {t.name} ({t.language}) — {t.status}
                      {t.category ? ` · ${t.category}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-medium text-amber-900">Neither template was found on this WhatsApp Business Account.</p>
              )
            ) : (
              <p>Set WHATSAPP_BUSINESS_ACCOUNT_ID to also check template approval status.</p>
            )}
          </div>
        ) : (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800">
            {report.error}
          </p>
        )
      ) : null}
    </div>
  );
}
