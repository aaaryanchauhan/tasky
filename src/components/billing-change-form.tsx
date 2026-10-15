"use client";

import { useActionState, useState } from "react";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm";
import { Field, FormMessage, SelectInput, SubmitButton, TextInput } from "@/components/ui/form";
import { formatDateIN } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import type { BillingPreview } from "@/app/actions/members";
import type { ActionState } from "@/app/actions/shared";
import type { PlanOption } from "./member-form";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function BillingChangeForm({
  action,
  memberId,
  plans,
  current,
  today,
  reactivate,
}: {
  action: Action;
  memberId: string;
  plans: PlanOption[];
  current: { planCode: string; pricePaise: number };
  today: string;
  reactivate: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  // A preview is only valid for the exact inputs it was computed from: editing any field
  // after previewing marks that result stale, so "Apply" can't run against outdated numbers.
  const [staleFor, setStaleFor] = useState<ActionState>(null);
  const stale = staleFor !== null && staleFor === state;

  const errors = state?.fieldErrors ?? {};
  // Controlled on purpose: React resets uncontrolled fields after a server action, and a reset
  // <select> would silently fall back to the member's current plan between Preview and Apply.
  const [planCode, setPlanCode] = useState(current.planCode);
  const [effectiveOn, setEffectiveOn] = useState(today);
  const [price, setPrice] = useState(String(current.pricePaise / 100));
  const [anchor, setAnchor] = useState("");
  const preview = state?.ok && !stale ? (state.data as BillingPreview | undefined) : undefined;

  return (
    <form action={formAction} onChange={() => setStaleFor(state)} className="space-y-5" noValidate>
      <Card className="space-y-4">
        <Field
          label={reactivate ? "Resume billing from" : "Effective from"}
          htmlFor="effectiveOn"
          error={errors.effectiveOn}
          hint={
            reactivate
              ? "Billing restarts on this date. Nothing is charged for the inactive period."
              : "Terms that start on or after this date are re-billed under the new settings. A term already started or paid keeps running to its end — nothing is prorated."
          }
        >
          <TextInput id="effectiveOn" type="date" required value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} error={errors.effectiveOn} />
        </Field>
        <Field label="Plan" htmlFor="planCode" error={errors.planCode}>
          <SelectInput id="planCode" required value={planCode} onChange={(e) => setPlanCode(e.target.value)} error={errors.planCode}>
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name} · list {formatINR(p.listPricePaise)}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Agreed fee per term (₹)" htmlFor="agreedPrice" error={errors.agreedPrice}>
          <TextInput id="agreedPrice" inputMode="decimal" required value={price} onChange={(e) => setPrice(e.target.value)} error={errors.agreedPrice} />
        </Field>
        <Field
          label="First due date under the new terms (optional)"
          htmlFor="requestedAnchor"
          error={errors.requestedAnchor}
          hint="Leave blank to start right after any term that is already running."
        >
          <TextInput id="requestedAnchor" type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} error={errors.requestedAnchor} />
        </Field>
      </Card>

      {!state?.ok ? <FormMessage state={state} /> : null}

      {preview ? (
        <Card className="space-y-3 border-tiger-200 bg-tiger-50">
          <h2 className="font-bold">What will change</h2>
          <p className="text-sm">
            New schedule starts <strong>{formatDateIN(preview.newAnchor)}</strong>. {preview.keepCount} existing period
            {preview.keepCount === 1 ? "" : "s"} stay exactly as they are (history and payments are never rewritten).
          </p>
          {preview.cancel.length > 0 ? (
            <div>
              <p className="text-sm font-semibold">Unpaid periods that will be cancelled</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {preview.cancel.map((p) => (
                  <li key={p.periodStart}>
                    Due {formatDateIN(p.dueOn)} · {formatINR(p.amountDuePaise)}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm">No unpaid periods are affected.</p>
          )}
          {preview.create.length > 0 ? (
            <div>
              <p className="text-sm font-semibold">Periods that will be created now</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {preview.create.map((p) => (
                  <li key={p.periodStart}>
                    Due {formatDateIN(p.periodStart)} · {formatINR(p.amountDuePaise)}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm">The first new period will be created automatically a week before it&apos;s due.</p>
          )}
          {preview.warnings.map((w) => (
            <p key={w} className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900">
              {w}
            </p>
          ))}
        </Card>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <LinkButton href={`/members/${memberId}`} variant="secondary">
          Cancel
        </LinkButton>
        <SubmitButton name="intent" value="preview" variant={preview ? "secondary" : "primary"} size="lg" pendingLabel="Checking…">
          Preview changes
        </SubmitButton>
        {preview ? (
          <ConfirmSubmit
            label={reactivate ? "Reactivate member" : "Apply changes"}
            size="lg"
            title={reactivate ? "Reactivate this member?" : "Apply these billing changes?"}
            description="The periods listed above will be cancelled and created. Payments and past periods are not touched."
            confirmLabel="Apply"
            submitter={{ name: "intent", value: "apply" }}
          />
        ) : null}
      </div>
    </form>
  );
}
