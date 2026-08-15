"use client";

import { useFormState } from "react-dom";
import { setupOwner, type FormState } from "@/actions/auth";
import { Field, Input, SubmitButton, FormError } from "@/components/form";
import { lookup, type Dictionary } from "@/i18n";

const initial: FormState = {};

export function SetupForm({ d }: { d: Dictionary }) {
  const [state, action] = useFormState(setupOwner, initial);

  return (
    <form action={action} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card">
      <FormError message={lookup(d, state.error)} />
      <Field label={d.setup.name}>
        <Input name="name" autoComplete="name" required autoFocus />
      </Field>
      <Field label={d.setup.login}>
        <Input name="login" autoComplete="username" required />
      </Field>
      <Field label={d.setup.password}>
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label={d.setup.passwordRepeat}>
        <Input name="passwordRepeat" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <div className="pt-1">
        <SubmitButton>{d.setup.create}</SubmitButton>
      </div>
    </form>
  );
}
