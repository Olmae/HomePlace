"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, Badge } from "@/components/ui";
import { saveSmart } from "@/actions/smart";
import type { SmartConfig } from "@/lib/smart";
import type { Dictionary } from "@/i18n";

/**
 * Which disk-health counters, if any, are worth a message.
 *
 * Shown only when Proxmox is connected (that is where the SMART data comes
 * from). Everything defaults on, but the whole watch can be switched off and
 * each counter dropped — a home NAS wants the warning, a laptop panel does not.
 */
export function SmartCard({ d, config }: { d: Dictionary; config: SmartConfig }) {
  const [form, setForm] = useState<SmartConfig>(config);
  const [, startTransition] = useTransition();

  function update(patch: Partial<SmartConfig>) {
    const next = { ...form, ...patch };
    setForm(next);
    startTransition(() => void saveSmart(next));
  }

  const t = d.settings;
  const counters: { key: keyof SmartConfig; label: string }[] = [
    { key: "reallocated", label: t.smartReallocated },
    { key: "pending", label: t.smartPending },
    { key: "uncorrectable", label: t.smartUncorrectable },
    { key: "health", label: t.smartHealth },
  ];

  return (
    <Card>
      <CardHeader title={t.smartTitle} action={<Badge tone={form.enabled ? "ok" : "neutral"}>{form.enabled ? d.common.enabled : "—"}</Badge>} />
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted">{t.smartHint}</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
          {t.smartEnable}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {counters.map((c) => (
            <label key={c.key} className={`flex items-center gap-2 text-sm ${form.enabled ? "" : "opacity-50"}`}>
              <input
                type="checkbox"
                disabled={!form.enabled}
                checked={form[c.key] as boolean}
                onChange={(e) => update({ [c.key]: e.target.checked } as Partial<SmartConfig>)}
              />
              {c.label}
            </label>
          ))}
        </div>
      </div>
    </Card>
  );
}
