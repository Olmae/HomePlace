"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, Badge } from "@/components/ui";
import { Field, Input, Button } from "@/components/form";
import {
  saveNtfySettings,
  testNtfy,
  saveWebhookSettings,
  testWebhook,
  type TestResult,
} from "@/actions/integrations";
import type { Dictionary } from "@/i18n";

/**
 * The notification routes that are not Telegram.
 *
 * ntfy is the one worth having on a home server: it can run on the same LAN, so
 * it still delivers when the connection to the outside world is the thing that
 * broke. The webhook is the escape hatch for whatever else the household runs.
 */
export function NotifierForms({
  d,
  ntfy,
  webhook,
}: {
  d: Dictionary;
  ntfy: { enabled: boolean; url: string; topic: string; hasToken: boolean };
  webhook: { enabled: boolean; url: string; hasToken: boolean };
}) {
  return (
    <>
      <NtfyCard d={d} value={ntfy} />
      <WebhookCard d={d} value={webhook} />
    </>
  );
}

function Result({ result, d }: { result: TestResult | null; d: Dictionary }) {
  if (!result) return null;
  return result.ok ? (
    <span className="text-xs text-ok">✓ {d.common.ok}</span>
  ) : (
    <span className="truncate text-xs text-danger" title={result.error}>
      {result.error ?? d.common.failed}
    </span>
  );
}

function NtfyCard({ d, value }: { d: Dictionary; value: { enabled: boolean; url: string; topic: string; hasToken: boolean } }) {
  const [form, setForm] = useState({ ...value, token: "" });
  const [result, setResult] = useState<TestResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader title="ntfy" action={<Badge tone={value.enabled ? "ok" : "neutral"}>{value.enabled ? "on" : "off"}</Badge>} />
      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs text-muted">{d.settings.ntfyHint}</p>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          {d.common.enabled}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <Field label={d.settings.url}>
            <Input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://ntfy.sh"
              className="font-mono text-xs"
            />
          </Field>
          <Field label={d.settings.ntfyTopic}>
            <Input
              value={form.topic}
              onChange={(e) => setForm({ ...form, topic: e.target.value })}
              placeholder="homeplace-abc123"
              className="font-mono text-xs"
            />
          </Field>
        </div>

        <Field label={d.settings.token} hint={value.hasToken ? d.settings.secretKept : d.common.optional}>
          <Input
            type="password"
            value={form.token}
            onChange={(e) => setForm({ ...form, token: e.target.value })}
            placeholder={value.hasToken ? "••••••••" : ""}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={pending}
            onClick={() => startTransition(async () => setResult(await saveNtfySettings(form)))}
          >
            {d.common.save}
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                // Saved first, so the test uses what is in the boxes rather than
                // what was stored before the person started typing.
                await saveNtfySettings(form);
                setResult(await testNtfy());
              })
            }
          >
            {d.common.test}
          </Button>
          <Result result={result} d={d} />
        </div>
      </div>
    </Card>
  );
}

function WebhookCard({ d, value }: { d: Dictionary; value: { enabled: boolean; url: string; hasToken: boolean } }) {
  const [form, setForm] = useState({ ...value, token: "" });
  const [result, setResult] = useState<TestResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader
        title={d.settings.webhook}
        action={<Badge tone={value.enabled ? "ok" : "neutral"}>{value.enabled ? "on" : "off"}</Badge>}
      />
      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs text-muted">{d.settings.webhookHint}</p>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          {d.common.enabled}
        </label>

        <Field label={d.settings.url}>
          <Input
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="http://192.168.0.10:1880/homeplace"
            className="font-mono text-xs"
          />
        </Field>

        <Field label={d.settings.token} hint={value.hasToken ? d.settings.secretKept : d.common.optional}>
          <Input
            type="password"
            value={form.token}
            onChange={(e) => setForm({ ...form, token: e.target.value })}
            placeholder={value.hasToken ? "••••••••" : ""}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={pending}
            onClick={() => startTransition(async () => setResult(await saveWebhookSettings(form)))}
          >
            {d.common.save}
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await saveWebhookSettings(form);
                setResult(await testWebhook());
              })
            }
          >
            {d.common.test}
          </Button>
          <Result result={result} d={d} />
        </div>
      </div>
    </Card>
  );
}
