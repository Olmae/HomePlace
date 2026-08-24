"use client";

import { useState, useEffect } from "react";
import { Field, Input } from "@/components/form";
import type { Dictionary } from "@/i18n";

/**
 * A field for a secret that may already be stored.
 *
 * The old empty password box with a dotted placeholder left one question
 * unanswered — "did I already put a token here or not?" This answers it: a
 * stored secret shows as a green "saved" with a Change button, and only asking
 * to change reveals an input. A blank slate is just the input, as before.
 * Leaving the box untouched keeps whatever was saved.
 *
 * Shared by every settings form that holds a credential, so the token boxes all
 * behave the same way.
 */
export function SecretField({
  d,
  label,
  hasSecret,
  value,
  onChange,
  placeholder,
  hint,
}: {
  d: Dictionary;
  label: string;
  hasSecret: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Shown under a fresh, empty field — e.g. where to find the token. */
  hint?: string;
}) {
  const [editing, setEditing] = useState(!hasSecret);
  // After a save the server reports the secret as stored; fold the editor back
  // to the locked "saved" state so the result is unmistakable.
  useEffect(() => {
    if (hasSecret) setEditing(false);
  }, [hasSecret]);

  if (hasSecret && !editing) {
    return (
      <Field label={label}>
        <div className="flex h-9 items-center gap-3">
          <span className="text-xs text-ok">✓ {d.settings.secretSet}</span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-muted underline underline-offset-2 transition-colors hover:text-text"
          >
            {d.common.change}
          </button>
        </div>
      </Field>
    );
  }

  return (
    <Field label={label} hint={hasSecret ? d.settings.secretReplaceHint : hint}>
      <Input type="password" value={value} placeholder={placeholder} autoFocus={hasSecret} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}
