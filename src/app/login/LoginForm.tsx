"use client";

import { useFormState } from "react-dom";
import { signIn, type FormState } from "@/actions/auth";
import { Field, Input, SubmitButton, FormError } from "@/components/form";
import { lookup, type Dictionary } from "@/i18n";

export function LoginForm({ d, initialError }: { d: Dictionary; initialError?: string }) {
  const [state, action] = useFormState(signIn, {} as FormState);
  // An error carried in the URL (a failed SSO round-trip) shows until the user
  // tries again; after that the form's own state takes over.
  const message = lookup(d, state.error) ?? initialError;

  return (
    <form action={action} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card">
      <FormError message={message} />
      <Field label={d.auth.login}>
        <Input name="login" autoComplete="username" required autoFocus />
      </Field>
      <Field label={d.auth.password}>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="pt-1">
        <SubmitButton>{d.auth.signIn}</SubmitButton>
      </div>
    </form>
  );
}
