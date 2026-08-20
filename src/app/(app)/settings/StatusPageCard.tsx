"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, Badge } from "@/components/ui";
import { Field, Input, Button } from "@/components/form";
import { saveStatusPage } from "@/actions/status";
import type { StatusPageConfig } from "@/lib/statusPage";
import type { Dictionary } from "@/i18n";

/**
 * The public status page, configured.
 *
 * A switch to turn it on, a title, and the list of checkable services to
 * expose — nothing is public until it is ticked here, and the whole thing is
 * off until the switch is thrown.
 */
export function StatusPageCard({
  d,
  initial,
  items,
}: {
  d: Dictionary;
  initial: StatusPageConfig;
  items: { id: string; title: string }[];
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [title, setTitle] = useState(initial.title);
  const [ids, setIds] = useState<string[]>(initial.itemIds);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSaved(false);
    setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function save() {
    startTransition(async () => {
      await saveStatusPage({ enabled, title: title.trim(), itemIds: ids });
      setSaved(true);
    });
  }

  return (
    <Card>
      <CardHeader
        title={d.settings.statusPage}
        action={
          <div className="flex items-center gap-2">
            {enabled && (
              <a href="/status" target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
                /status ↗
              </a>
            )}
            {saved && <Badge tone="ok">{d.common.save}</Badge>}
          </div>
        }
      />
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted">{d.settings.statusPageHint}</p>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setSaved(false);
              setEnabled(e.target.checked);
            }}
          />
          {d.settings.statusPageEnable}
        </label>

        <Field label={d.settings.statusPageTitle}>
          <Input
            value={title}
            onChange={(e) => {
              setSaved(false);
              setTitle(e.target.value);
            }}
            placeholder="Status"
          />
        </Field>

        <Field label={d.settings.statusPageServices}>
          {items.length === 0 ? (
            <p className="text-xs text-muted">{d.settings.statusPageNoServices}</p>
          ) : (
            <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-control border border-line p-1">
              {items.map((item) => (
                <label key={item.id} className="flex items-center gap-2 rounded-control px-2 py-1 text-sm hover:bg-raised">
                  <input type="checkbox" checked={ids.includes(item.id)} onChange={() => toggle(item.id)} />
                  <span className="truncate">{item.title}</span>
                </label>
              ))}
            </div>
          )}
        </Field>

        <div className="flex justify-end">
          <Button variant="primary" disabled={pending} onClick={save}>
            {d.common.save}
          </Button>
        </div>
      </div>
    </Card>
  );
}
