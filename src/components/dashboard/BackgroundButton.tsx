"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@/components/Dialog";
import { Field, Input, Button } from "@/components/form";
import { updateDashboardBackground } from "@/actions/dashboard";
import type { Dictionary } from "@/i18n";

/**
 * The background photo of one tab.
 *
 * Dim and blur are sliders rather than a checkbox, because "readable over this
 * particular photo" is a judgement — a dark forest needs almost none, a bright
 * beach needs most of the way.
 */
export function BackgroundButton({
  d,
  dashboardId,
  current,
}: {
  d: Dictionary;
  dashboardId: string;
  current: { backgroundUrl: string; backgroundDim: number; backgroundBlur: number };
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(current);
  const [pending, startTransition] = useTransition();

  function save(next: typeof form) {
    setForm(next);
    startTransition(() => void updateDashboardBackground(dashboardId, next));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={d.dashboard.background}
        aria-label={d.dashboard.background}
        className="rounded-control px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-raised hover:text-text"
      >
        🖼
      </button>

      {open && (
        <Dialog open onClose={() => setOpen(false)} title={d.dashboard.background}>
          <div className="flex flex-col gap-4">
            <Field label={d.dashboard.backgroundUrl} hint={d.dashboard.backgroundHint}>
              <Input
                value={form.backgroundUrl}
                onChange={(e) => setForm({ ...form, backgroundUrl: e.target.value })}
                placeholder="https://…/photo.jpg"
                className="font-mono text-xs"
              />
            </Field>

            <label className="block">
              <span className="mb-1 flex items-center justify-between text-xs font-medium text-muted">
                {d.dashboard.dim} <span className="font-mono">{form.backgroundDim}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={95}
                value={form.backgroundDim}
                onChange={(e) => setForm({ ...form, backgroundDim: Number(e.target.value) })}
                className="w-full accent-[rgb(var(--accent))]"
              />
            </label>

            <label className="block">
              <span className="mb-1 flex items-center justify-between text-xs font-medium text-muted">
                {d.dashboard.blur} <span className="font-mono">{form.backgroundBlur}px</span>
              </span>
              <input
                type="range"
                min={0}
                max={24}
                value={form.backgroundBlur}
                onChange={(e) => setForm({ ...form, backgroundBlur: Number(e.target.value) })}
                className="w-full accent-[rgb(var(--accent))]"
              />
            </label>

            <div className="flex justify-between gap-2 border-t border-line pt-3">
              <Button
                variant="quiet"
                disabled={pending}
                onClick={() => save({ backgroundUrl: "", backgroundDim: 55, backgroundBlur: 0 })}
              >
                {d.common.delete}
              </Button>
              <Button
                variant="primary"
                disabled={pending}
                onClick={() => {
                  save(form);
                  setOpen(false);
                }}
              >
                {d.common.save}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
