"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, Badge } from "@/components/ui";
import { Field, Textarea, Button } from "@/components/form";
import { importUptimeKuma } from "@/actions/import";
import type { Dictionary } from "@/i18n";

/**
 * Bring monitors over from Uptime Kuma.
 *
 * Paste the backup JSON (Kuma → Settings → Backup → Export) or drop the file
 * in; each monitor becomes a link tile on the first dashboard. A one-way import
 * on purpose — it seeds the board, it does not stay in sync.
 */
export function KumaImportCard({ d }: { d: Dictionary }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setResult(null);
    startTransition(async () => {
      const r = await importUptimeKuma(text);
      setResult(r.ok ? `${d.settings.kumaImported}: ${r.created}` : r.error ?? d.common.error);
      if (r.ok) setText("");
    });
  }

  async function onFile(file: File | undefined) {
    if (file) setText(await file.text());
  }

  return (
    <Card>
      <CardHeader
        title={d.settings.kumaImport}
        action={result ? <Badge tone={result.includes(":") ? "ok" : "danger"}>{result}</Badge> : null}
      />
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted">{d.settings.kumaImportHint}</p>

        <Field label={d.settings.kumaJson}>
          <Textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="font-mono text-xs"
            placeholder='{ "monitorList": [ … ] }'
          />
        </Field>

        <div className="flex items-center justify-between gap-2">
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => onFile(e.target.files?.[0])}
            className="text-xs text-muted file:mr-2 file:rounded-control file:border file:border-line file:bg-raised file:px-2 file:py-1 file:text-xs file:text-text"
          />
          <Button variant="primary" disabled={pending || !text.trim()} onClick={run}>
            {d.settings.kumaImportButton}
          </Button>
        </div>
      </div>
    </Card>
  );
}
