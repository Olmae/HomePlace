"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, Badge } from "@/components/ui";
import { Field, Input, Select, Textarea, Button } from "@/components/form";
import { Dialog } from "@/components/Dialog";
import { saveSchedule, toggleSchedule, deleteSchedule, type ScheduleInput } from "@/actions/schedules";
import type { Dictionary } from "@/i18n";

export type ScheduleRow = ScheduleInput & { id: string };

/**
 * Scheduled actions.
 *
 * A list of things the panel does on a clock — restart a container overnight,
 * run a Home Assistant scene, send a reminder — each a name, a when, and a
 * what. Made and edited in a dialog; the monitor tick is what runs them.
 */
export function ScheduleForms({ d, schedules }: { d: Dictionary; schedules: ScheduleRow[] }) {
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader
        title={d.settings.schedules}
        action={
          <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
            ＋ {d.settings.scheduleAdd}
          </Button>
        }
      />
      <div className="space-y-2 p-4">
        <p className="text-xs text-muted">{d.settings.schedulesHint}</p>

        {schedules.length === 0 ? (
          <p className="text-sm text-muted">{d.common.none}</p>
        ) : (
          <ul className="divide-y divide-line rounded-control border border-line">
            {schedules.map((s) => (
              <li key={s.id} className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={s.enabled}
                  onClick={() => startTransition(() => void toggleSchedule(s.id, !s.enabled))}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${s.enabled ? "bg-accent" : "bg-line"}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface transition-transform ${s.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="truncate text-[11px] text-faint">{summary(s, d)}</p>
                </div>
                <Badge>{d.settings[`sa_${s.action}` as keyof typeof d.settings] ?? s.action}</Badge>
                <Button size="sm" variant="quiet" onClick={() => setEditing(s)}>
                  ✎
                </Button>
                <Button size="sm" variant="quiet" onClick={() => startTransition(() => void deleteSchedule(s.id))} title={d.common.delete}>
                  ✕
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(creating || editing) && (
        <ScheduleDialog
          d={d}
          value={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function summary(s: ScheduleRow, d: Dictionary): string {
  if (s.kind === "interval") return `${d.settings.sw_interval} · ${s.intervalMinutes} ${d.settings.minutes}`;
  const day = s.kind === "weekly" && s.weekday != null ? `${WEEKDAYS[s.weekday]} · ` : "";
  return `${day}${s.timeOfDay ?? ""}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ScheduleDialog({ d, value, onClose }: { d: Dictionary; value: ScheduleRow | null; onClose: () => void }) {
  const [form, setForm] = useState<ScheduleInput>(
    value ?? {
      name: "",
      enabled: true,
      kind: "daily",
      timeOfDay: "03:00",
      weekday: 1,
      intervalMinutes: 60,
      action: "restart",
      hostKey: "",
      containerName: "",
      entityId: "",
      title: "",
      body: "",
    }
  );
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof ScheduleInput>(k: K, v: ScheduleInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  function save() {
    startTransition(async () => {
      await saveSchedule({ ...form, id: value?.id });
      onClose();
    });
  }

  return (
    <Dialog open onClose={onClose} title={value ? d.settings.scheduleEdit : d.settings.scheduleAdd} wide>
      <div className="space-y-3">
        <Field label={d.settings.scheduleName}>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nightly restart" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={d.settings.scheduleWhen}>
            <Select value={form.kind} onChange={(e) => set("kind", e.target.value)}>
              <option value="daily">{d.settings.sw_daily}</option>
              <option value="weekly">{d.settings.sw_weekly}</option>
              <option value="interval">{d.settings.sw_interval}</option>
            </Select>
          </Field>
          {form.kind === "interval" ? (
            <Field label={d.settings.minutes}>
              <Input type="number" min={1} value={form.intervalMinutes ?? 60} onChange={(e) => set("intervalMinutes", Number(e.target.value))} />
            </Field>
          ) : (
            <Field label={d.settings.scheduleTime}>
              <Input type="time" value={form.timeOfDay ?? "03:00"} onChange={(e) => set("timeOfDay", e.target.value)} />
            </Field>
          )}
        </div>

        {form.kind === "weekly" && (
          <Field label={d.settings.scheduleWeekday}>
            <Select value={String(form.weekday ?? 1)} onChange={(e) => set("weekday", Number(e.target.value))}>
              {WEEKDAYS.map((w, i) => (
                <option key={i} value={i}>
                  {w}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label={d.settings.scheduleAction}>
          <Select value={form.action} onChange={(e) => set("action", e.target.value)}>
            <option value="restart">{d.settings.sa_restart}</option>
            <option value="scene">{d.settings.sa_scene}</option>
            <option value="notify">{d.settings.sa_notify}</option>
          </Select>
        </Field>

        {form.action === "restart" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={d.settings.scheduleHost} hint={d.common.optional}>
              <Input value={form.hostKey ?? ""} onChange={(e) => set("hostKey", e.target.value)} placeholder="main" className="font-mono text-xs" />
            </Field>
            <Field label={d.dashboard.addContainer}>
              <Input value={form.containerName ?? ""} onChange={(e) => set("containerName", e.target.value)} placeholder="jellyfin" className="font-mono text-xs" />
            </Field>
          </div>
        )}

        {form.action === "scene" && (
          <Field label={d.settings.scheduleEntity}>
            <Input value={form.entityId ?? ""} onChange={(e) => set("entityId", e.target.value)} placeholder="scene.movie_night" className="font-mono text-xs" />
          </Field>
        )}

        {form.action === "notify" && (
          <>
            <Field label={d.settings.scheduleTitle}>
              <Input value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field label={d.settings.scheduleBody}>
              <Textarea rows={2} value={form.body ?? ""} onChange={(e) => set("body", e.target.value)} />
            </Field>
          </>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="quiet" onClick={onClose}>
            {d.common.cancel}
          </Button>
          <Button variant="primary" disabled={pending || !form.name.trim()} onClick={save}>
            {d.common.save}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
