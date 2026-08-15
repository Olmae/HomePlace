"use client";

import { useFormState } from "react-dom";
import { changePassword, type FormState } from "@/actions/auth";
import { Field, Input, SubmitButton, FormError } from "@/components/form";
import { lookup, type Dictionary } from "@/i18n";

export function PasswordForm({ d }: { d: Dictionary }) {
  const [state, action] = useFormState(changePassword, {} as FormState);

  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-xs font-medium text-muted">{d.settings.changePassword}</p>
      <FormError message={lookup(d, state.error)} />
      {state.ok && <p className="text-xs text-ok">{d.settings.saved}</p>}
      <Field label={d.settings.currentPassword}>
        <Input name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field label={d.settings.newPassword}>
        <Input name="newPassword" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <div>
        <SubmitButton>{d.common.save}</SubmitButton>
      </div>
    </form>
  );
}
