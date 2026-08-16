"use client";

import { useState, useTransition } from "react";
import type { AlertRule } from "@prisma/client";
import { Card, CardHeader, Badge } from "@/components/ui";
import { Field, Input, Select, Button } from "@/components/form";
import { Dialog } from "@/components/Dialog";
import { saveRule, deleteRule, toggleRule, testRuleQuery, addRuleTemplates } from "@/actions/rules";
import type { Dictionary } from "@/i18n";

/**
 * Metric rules.
 *
 * The list is the important part — a rule you cannot see the state of is a rule
 * you stop trusting. Each row shows whether it is currently breached and what
 * the last reading was, so "why did I not get a message" has an answer on the
 * page rather than in a log.
 */
export function RuleForms({ d, rules }: { d: Dictionary; rules: AlertRule[] }) {
  const [editing, setEditing] = useState<AlertRule | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader
        title={d.settings.rules}
        action={
          <div className="flex gap-2">
            {rules.length === 0 && (
              <Button size="sm" disabled={pending} onClick={() => startTransition(() => void addRuleTemplates())}>
                {d.settings.rulesTemplates}
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={() => setEditing("new")}>
              +
            </Button>
          </div>
        }
      />

      <div className="p-4">
        <p className="mb-3 text-xs text-muted">{d.settings.rulesHint}</p>

        <ul className="divide-y divide-line">
          {rules.length === 0 && <li className="py-2 text-sm text-muted">{d.settings.rulesEmpty}</li>}
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center gap-2 py-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  !rule.enabled ? "bg-faint" : rule.firing ? "bg-danger" : "bg-ok"
                }`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{rule.name}</p>
                <p className="truncate font-mono text-[11px] text-faint" title={rule.query}>
                  {rule.comparison === "lt" ? "<" : ">"} {rule.threshold}
                  {rule.unit === "percent" ? "%" : ""} · {Math.round(rule.forSeconds / 60)} min
                  {rule.lastValue !== null && ` · ${d.settings.rulesLast} ${rule.lastValue.toFixed(1)}`}
                  {rule.lastError && ` · ${rule.lastError}`}
                </p>
              </div>
              <Badge tone={rule.severity === "error" ? "danger" : rule.severity === "info" ? "neutral" : "warn"}>
                {rule.severity}
              </Badge>
              <Button size="sm" variant="quiet" disabled={pending} onClick={() => startTransition(() => void toggleRule(rule.id))}>
                {rule.enabled ? "⏸" : "▶"}
              </Button>
              <Button size="sm" variant="quiet" onClick={() => setEditing(rule)}>
                ✎
              </Button>
            </li>
          ))}
        </ul>
      </div>

      {editing && (
        <RuleDialog
          d={d}
          rule={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function RuleDialog({ d, rule, onClose }: { d: Dictionary; rule: AlertRule | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: rule?.name ?? "",
    query: rule?.query ?? "",
    comparison: rule?.comparison ?? "gt",
    threshold: rule?.threshold ?? 90,
    forSeconds: rule?.forSeconds ?? 600,
    severity: rule?.severity ?? "warn",
    unit: rule?.unit ?? "percent",
    enabled: rule?.enabled ?? true,
  });
  const [probe, setProbe] = useState<{ ok: boolean; value?: number; error?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open onClose={onClose} title={rule ? d.common.edit : d.settings.rules} wide>
      <div className="flex flex-col gap-4">
        <Field label={d.dashboard.tileTitle}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </Field>

        <Field label={d.widgets.query} hint={d.settings.rulesQueryHint}>
          <Input
            value={form.query}
            onChange={(e) => setForm({ ...form, query: e.target.value })}
            className="font-mono text-xs"
            placeholder='100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'
          />
        </Field>

        <div className="flex items-center gap-3">
          <Button
            disabled={pending}
            onClick={() => startTransition(async () => setProbe(await testRuleQuery(form.query)))}
          >
            {d.common.test}
          </Button>
          {probe &&
            (probe.ok ? (
              <span className="font-mono text-xs text-ok">{probe.value?.toFixed(2)}</span>
            ) : (
              <span className="truncate text-xs text-danger">{probe.error}</span>
            ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label={d.settings.rulesComparison}>
            <Select value={form.comparison} onChange={(e) => setForm({ ...form, comparison: e.target.value })}>
              <option value="gt">{d.settings.rulesAbove}</option>
              <option value="lt">{d.settings.rulesBelow}</option>
            </Select>
          </Field>
          <Field label={d.settings.rulesThreshold}>
            <Input
              type="number"
              value={form.threshold}
              onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })}
            />
          </Field>
          <Field label={d.widgets.unit}>
            <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              <option value="percent">{d.widgets.unitPercent}</option>
              <option value="number">{d.widgets.unitNumber}</option>
              <option value="bytes">{d.widgets.unitBytes}</option>
            </Select>
          </Field>
          <Field label={`${d.settings.rulesFor}, ${d.dashboard.seconds}`}>
            <Input
              type="number"
              min={0}
              value={form.forSeconds}
              onChange={(e) => setForm({ ...form, forSeconds: Number(e.target.value) })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={d.settings.rulesSeverity}>
            <Select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </Select>
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            {d.common.enabled}
          </label>
        </div>

        <div className="flex justify-between gap-2 border-t border-line pt-3">
          {rule ? (
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => {
                if (!confirm(d.common.confirmDelete)) return;
                startTransition(async () => {
                  await deleteRule(rule.id);
                  onClose();
                });
              }}
            >
              {d.common.delete}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="quiet" onClick={onClose}>
              {d.common.cancel}
            </Button>
            <Button
              variant="primary"
              disabled={pending || !form.name.trim() || !form.query.trim()}
              onClick={() =>
                startTransition(async () => {
                  await saveRule(rule?.id ?? null, form);
                  onClose();
                })
              }
            >
              {d.common.save}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
