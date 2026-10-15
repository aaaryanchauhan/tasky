"use client";

import { useActionState, useMemo, useState } from "react";
import { PhotoPicker } from "@/components/photo-picker";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FormMessage, SelectInput, SubmitButton, TextArea, TextInput } from "@/components/ui/form";
import { generatePeriods, generationHorizon, PLAN_DURATION_MONTHS, type PlanCode } from "@/lib/billing";
import { addDays, cycleStart, formatDateIN, isValidDate } from "@/lib/dates";
import { formatINR, parseRupeesToPaise } from "@/lib/money";
import type { ActionState } from "@/app/actions/shared";

export interface PlanOption {
  code: PlanCode;
  name: string;
  durationMonths: number;
  listPricePaise: number;
}

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

function ConsentFields({
  defaultConsent,
  defaultSource,
  errors,
  note,
}: {
  defaultConsent: boolean;
  defaultSource: string;
  errors: Record<string, string>;
  note?: string;
}) {
  const [consent, setConsent] = useState(defaultConsent);
  return (
    <fieldset className="space-y-3 rounded-xl border border-line p-3">
      <legend className="px-1 text-sm font-semibold">WhatsApp reminders</legend>
      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          name="consent"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 size-5 shrink-0 accent-tiger-600"
        />
        <span className="text-sm">
          This member has agreed to receive WhatsApp messages about their membership and fee payments.
        </span>
      </label>
      {consent ? (
        <Field label="Where was consent given?" htmlFor="consentSource" error={errors.consentSource} hint="For your records, e.g. signed enrolment form.">
          <TextInput
            id="consentSource"
            list="consent-sources"
            maxLength={120}
            defaultValue={defaultSource}
            placeholder="Signed enrolment form"
            error={errors.consentSource}
          />
          <datalist id="consent-sources">
            <option value="Signed enrolment form" />
            <option value="Verbal, recorded by staff" />
            <option value="WhatsApp message from member" />
          </datalist>
        </Field>
      ) : (
        <p className="text-sm text-ink-soft">No reminders will be sent to this member until consent is recorded.</p>
      )}
      {note ? <p className="text-xs text-amber-800">{note}</p> : null}
    </fieldset>
  );
}

export function CreateMemberForm({ action, plans, today }: { action: Action; plans: PlanOption[]; today: string }) {
  const [state, formAction] = useActionState(action, null);
  const errors = state?.fieldErrors ?? {};
  const v = state?.values ?? {};
  const [fullName, setFullName] = useState(v.fullName ?? "");

  const first = plans[0]!;
  const [planCode, setPlanCode] = useState<PlanCode>((v.planCode as PlanCode) ?? first.code);
  const plan = plans.find((p) => p.code === planCode) ?? first;
  const [joinedOn, setJoinedOn] = useState(v.joinedOn ?? today);
  const [price, setPrice] = useState(v.agreedPrice ?? String(plan.listPricePaise / 100));
  const [priceTouched, setPriceTouched] = useState(Boolean(v.agreedPrice));
  const [firstDue, setFirstDue] = useState(v.firstDueOn ?? joinedOn);
  const [dueTouched, setDueTouched] = useState(Boolean(v.firstDueOn));

  function choosePlan(code: PlanCode) {
    setPlanCode(code);
    const p = plans.find((x) => x.code === code);
    if (p && !priceTouched) setPrice(String(p.listPricePaise / 100));
  }

  const preview = useMemo(() => {
    const paise = parseRupeesToPaise(price);
    if (!isValidDate(firstDue) || paise === null) return null;
    const months = PLAN_DURATION_MONTHS[planCode];
    const upcoming = [0, 1, 2].map((k) => cycleStart(firstDue, months, k));
    const started = generatePeriods({ anchor: firstDue, planCode, amountPaise: paise, horizon: generationHorizon(today) });
    const alreadyPast = started.filter((p) => p.dueOn <= addDays(today, -1));
    return {
      paise,
      first: upcoming[0]!,
      termEnd: upcoming[1]!,
      then: upcoming.slice(1),
      pastCount: alreadyPast.length,
      pastTotal: alreadyPast.length * paise,
    };
  }, [firstDue, price, planCode, today]);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <Card className="space-y-4">
        <PhotoPicker fullName={fullName} />
        <Field label="Full name" htmlFor="fullName" error={errors.fullName}>
          <TextInput id="fullName" autoComplete="off" required maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} error={errors.fullName} />
        </Field>
        <Field label="WhatsApp number" htmlFor="phone" error={errors.phone} hint="Indian mobile, e.g. +91 98765 43210">
          <TextInput id="phone" type="tel" inputMode="tel" autoComplete="off" required defaultValue={v.phone ?? ""} error={errors.phone} />
        </Field>
        <Field label="Alternate contact (optional)" htmlFor="alternateContact" error={errors.alternateContact}>
          <TextInput id="alternateContact" maxLength={40} defaultValue={v.alternateContact ?? ""} error={errors.alternateContact} />
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-bold">Membership &amp; billing</h2>
        <Field label="Joining date" htmlFor="joinedOn" error={errors.joinedOn}>
          <TextInput
            id="joinedOn"
            type="date"
            required
            value={joinedOn}
            onChange={(e) => {
              setJoinedOn(e.target.value);
              if (!dueTouched) setFirstDue(e.target.value);
            }}
            error={errors.joinedOn}
          />
        </Field>
        <Field label="Plan" htmlFor="planCode" error={errors.planCode}>
          <SelectInput id="planCode" required value={planCode} onChange={(e) => choosePlan(e.target.value as PlanCode)} error={errors.planCode}>
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name} · {p.durationMonths} month{p.durationMonths > 1 ? "s" : ""} · list {formatINR(p.listPricePaise)}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field
          label="Agreed fee per term (₹)"
          htmlFor="agreedPrice"
          error={errors.agreedPrice}
          hint={`List price is ${formatINR(plan.listPricePaise)}. Change it to give this member a different fee.`}
        >
          <TextInput
            id="agreedPrice"
            inputMode="decimal"
            required
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              setPriceTouched(true);
            }}
            error={errors.agreedPrice}
          />
        </Field>
        <Field
          label="First fee due on"
          htmlFor="firstDueOn"
          error={errors.firstDueOn}
          hint="Fees are collected in advance for each term, so this is the day the first term starts and is paid for. It can differ from the joining date."
        >
          <TextInput
            id="firstDueOn"
            type="date"
            required
            value={firstDue}
            onChange={(e) => {
              setFirstDue(e.target.value);
              setDueTouched(true);
            }}
            error={errors.firstDueOn}
          />
        </Field>

        <div aria-live="polite" className="rounded-xl bg-tiger-50 p-3 text-sm">
          {preview ? (
            <>
              <p className="font-semibold">Billing preview</p>
              <p className="mt-1">
                First fee <strong>{formatINR(preview.paise)}</strong> due <strong>{formatDateIN(preview.first)}</strong>, covering{" "}
                {formatDateIN(preview.first)} to {formatDateIN(addDays(preview.termEnd, -1))}.
              </p>
              <p className="mt-1 text-ink-soft">Then due {preview.then.map(formatDateIN).join(", ")}…</p>
              {preview.pastCount > 0 ? (
                <p className="mt-2 rounded-lg bg-amber-100 px-2 py-1.5 font-medium text-amber-900">
                  {preview.pastCount} term{preview.pastCount > 1 ? "s" : ""} up to today will be created as unpaid ({formatINR(preview.pastTotal)}).
                  Move the first due date forward if those were already settled.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-ink-soft">Enter a valid fee and first due date to preview the billing schedule.</p>
          )}
        </div>
      </Card>

      <Card className="space-y-4">
        <ConsentFields defaultConsent={v.consent === "on"} defaultSource={v.consentSource ?? ""} errors={errors} />
        <Field label="Notes (optional)" htmlFor="notes" error={errors.notes}>
          <TextArea id="notes" maxLength={1000} defaultValue={v.notes ?? ""} error={errors.notes} />
        </Field>
      </Card>

      <FormMessage state={state} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <LinkButton href="/members" variant="secondary">
          Cancel
        </LinkButton>
        <SubmitButton size="lg" pendingLabel="Adding…">
          Add member
        </SubmitButton>
      </div>
    </form>
  );
}

export function EditMemberForm({
  action,
  memberId,
  photoUrl,
  initial,
}: {
  action: Action;
  memberId: string;
  photoUrl?: string | null;
  initial: {
    fullName: string;
    phone: string;
    alternateContact: string;
    joinedOn: string;
    notes: string;
    consent: boolean;
    consentSource: string;
  };
}) {
  const [state, formAction] = useActionState(action, null);
  const errors = state?.fieldErrors ?? {};
  const v = state?.values ?? {};
  const [phone, setPhone] = useState(v.phone ?? initial.phone);
  const [fullName, setFullName] = useState(v.fullName ?? initial.fullName);
  const phoneChanged = phone.replace(/\D/g, "").slice(-10) !== initial.phone.replace(/\D/g, "").slice(-10);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <Card className="space-y-4">
        <PhotoPicker fullName={fullName} currentUrl={photoUrl} />
        <Field label="Full name" htmlFor="fullName" error={errors.fullName}>
          <TextInput id="fullName" required maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} error={errors.fullName} />
        </Field>
        <Field label="WhatsApp number" htmlFor="phone" error={errors.phone}>
          <TextInput id="phone" type="tel" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} />
        </Field>
        <Field label="Alternate contact (optional)" htmlFor="alternateContact" error={errors.alternateContact}>
          <TextInput id="alternateContact" maxLength={40} defaultValue={v.alternateContact ?? initial.alternateContact} error={errors.alternateContact} />
        </Field>
        <Field label="Joining date" htmlFor="joinedOn" error={errors.joinedOn}>
          <TextInput id="joinedOn" type="date" required defaultValue={v.joinedOn ?? initial.joinedOn} error={errors.joinedOn} />
        </Field>
        <Field label="Notes (optional)" htmlFor="notes" error={errors.notes}>
          <TextArea id="notes" maxLength={1000} defaultValue={v.notes ?? initial.notes} error={errors.notes} />
        </Field>
      </Card>

      <Card>
        {/* key: re-mount with an unticked box when the number changes, so consent must be re-confirmed. */}
        <ConsentFields
          key={phoneChanged ? "changed" : "same"}
          defaultConsent={phoneChanged ? false : v.consent ? v.consent === "on" : initial.consent}
          defaultSource={v.consentSource ?? initial.consentSource}
          errors={errors}
          note={phoneChanged ? "You changed the number: confirm consent again for the new number. Reminders already queued for the old number will be cancelled." : undefined}
        />
      </Card>

      <p className="text-sm text-ink-soft">
        Plan, fee and due dates are changed separately so you can preview the effect on existing dues.
      </p>
      <FormMessage state={state} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <LinkButton href={`/members/${memberId}`} variant="secondary">
          Cancel
        </LinkButton>
        <SubmitButton size="lg">Save changes</SubmitButton>
      </div>
    </form>
  );
}
