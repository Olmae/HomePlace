"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, Badge } from "@/components/ui";
import { Field, Input, Button } from "@/components/form";
import { saveDockerHostsSettings } from "@/actions/integrations";
import type { Dictionary } from "@/i18n";

type Host = { key: string; label: string; url: string };

/**
 * Docker hosts, added from the interface.
 *
 * A single endpoint in `.env` covers the common case, but a household with a
 * second machine had to edit `.env` and rebuild to add it. Here they are rows:
 * a label and the URL of the machine's socket proxy. Anything the `.env`
 * already fixes is shown above, read-only, because a file always wins.
 */
export function DockerHostsForm({ d, env, stored }: { d: Dictionary; env: Host[]; stored: Host[] }) {
  const [rows, setRows] = useState<Host[]>(stored);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function update(i: number, patch: Partial<Host>) {
    setSaved(false);
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function add() {
    setSaved(false);
    setRows((prev) => [...prev, { key: `docker${Date.now().toString(36)}`, label: "", url: "" }]);
  }

  function remove(i: number) {
    setSaved(false);
    setRows((prev) => prev.filter((_, j) => j !== i));
  }

  function save() {
    startTransition(async () => {
      await saveDockerHostsSettings(rows.filter((r) => r.url.trim()));
      setSaved(true);
    });
  }

  return (
    <Card>
      <CardHeader
        title={d.settings.dockerHosts}
        action={saved ? <Badge tone="ok">{d.common.save}</Badge> : null}
      />
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted">{d.settings.dockerHostsHint}</p>

        {env.length > 0 && (
          <div className="space-y-1">
            {env.map((h) => (
              <div key={h.key} className="flex items-center gap-2 rounded-control border border-line bg-raised px-3 py-1.5 text-xs">
                <span className="font-medium">{h.label}</span>
                <span className="truncate font-mono text-faint">{h.url}</span>
                <Badge tone="neutral">.env</Badge>
              </div>
            ))}
          </div>
        )}

        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-control border border-line p-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
            <Field label={d.settings.dockerHostLabel}>
              <Input value={r.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Server 2" />
            </Field>
            <Field label={d.settings.url}>
              <Input value={r.url} onChange={(e) => update(i, { url: e.target.value })} placeholder="http://192.168.0.20:2375" className="font-mono text-xs" />
            </Field>
            <Button variant="quiet" onClick={() => remove(i)} title={d.common.delete}>
              ✕
            </Button>
          </div>
        ))}

        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={add}>
            ＋ {d.settings.dockerHostAdd}
          </Button>
          <Button variant="primary" disabled={pending} onClick={save}>
            {d.common.save}
          </Button>
        </div>
      </div>
    </Card>
  );
}
