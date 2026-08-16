"use client";

import { useFormState } from "react-dom";
import { changePassword, signOutEverywhere, type FormState } from "@/actions/auth";
import { Field, Input, SubmitButton, FormError } from "@/components/form";
import { lookup, type Dictionary } from "@/i18n";

export function PasswordForm({ d }: { d: Dictionary }) {
  const [state, action] = useFormState(changePassword, {} as FormState);

  return (
    <>
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
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton>{d.common.save}</SubmitButton>
      </div>
    </form>

    {/* Separate form: ending every session is not a thing to do by accident
        while typing a new password. */}
    <form action={signOutEverywhere} className="mt-3 border-t border-line pt-3">
      <button
        type="submit"
        className="text-xs text-muted underline-offset-2 transition-colors hover:text-danger hover:underline"
      >
        {d.settings.signOutEverywhere}
      </button>
    </form>
    </>
  );
}
