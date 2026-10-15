"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { Field, FormMessage, SubmitButton, TextInput } from "@/components/ui/form";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Email" htmlFor="email">
        <TextInput id="email" type="email" autoComplete="username" inputMode="email" required defaultValue={state?.values?.email ?? ""} />
      </Field>
      <Field label="Password" htmlFor="password">
        <TextInput id="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
