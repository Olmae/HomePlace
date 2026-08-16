"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ui";
import { Input, Select, Button } from "@/components/form";
import { addReminder, completeReminder, deleteReminder } from "@/actions/reminders";
import type { Dictionary } from "@/i18n";

export type ReminderRow = { id: string; title: string; at: string; repeat: string };

/**
 * Reminders, on the board.
 *
 * Adding one is a single line and a time, right on the tile — a reminder that
 * takes a dialog and four fields to create is one that never gets created. The
 * notification goes to whoever set it, through push and Telegram.
 */
export function RemindersWidget({ d, title, rows }: { d: Dictionary; title: string; rows: ReminderRow[] }) {
  const [text, setText] = useState("");
  const [when, setWhen] = useState(defaultWhen());
  const [repeat, setRepeat] = useState("none");
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!text.trim()) return;
    startTransition(async () => {
      await addReminder({ title: text, at: when, repeat });
      setText("");
      setAdding(false);
    });
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title={title}
        action={
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded-control px-1.5 text-sm text-muted transition-colors hover:bg-raised hover:text-text"
            aria-label={d.common.add}
          >
            +
          </button>
        }
      />

      {adding && (
        <div className="flex flex-col gap-2 border-b border-line p-3">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder={d.reminders.what}
            autoFocus
          />
          <div className="flex gap-2">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="flex-1" />
            <Select value={repeat} onChange={(e) => setRepeat(e.target.value)} className="w-28">
              <option value="none">{d.reminders.once}</option>
              <option value="daily">{d.reminders.daily}</option>
              <option value="weekly">{d.reminders.weekly}</option>
              <option value="monthly">{d.reminders.monthly}</option>
            </Select>
            <Button variant="primary" size="sm" disabled={pending || !text.trim()} onClick={submit}>
              {d.common.add}
            </Button>
          </div>
        </div>
      )}

      <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
        {rows.length === 0 && <li className="px-4 py-3 text-sm text-muted">{d.reminders.empty}</li>}

        {rows.map((row) => {
          const at = new Date(row.at);
          const overdue = at.getTime() < Date.now();
          const today = at.toDateString() === new Date().toDateString();

          return (
            <li key={row.id} className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                title={d.reminders.done}
                aria-label={`${row.title} — ${d.reminders.done}`}
                disabled={pending}
                onClick={() => startTransition(() => void completeReminder(row.id))}
                className="h-4 w-4 shrink-0 rounded border border-line transition-colors hover:border-accent hover:bg-accent/20"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{row.title}</p>
                <p className={`text-[11px] ${overdue ? "text-danger" : "text-faint"}`}>
                  {today
                    ? at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
                    : at.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {row.repeat !== "none" && ` · ${d.reminders[row.repeat as "daily" | "weekly" | "monthly"]}`}
                </p>
              </div>
              <button
                type="button"
                title={d.common.delete}
                disabled={pending}
                onClick={() => startTransition(() => void deleteReminder(row.id))}
                className="shrink-0 rounded px-1 text-xs text-faint transition-colors hover:text-danger"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Default: the next round hour, which is what people mean by "later". */
function defaultWhen(): string {
  const when = new Date();
  when.setHours(when.getHours() + 1, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}`;
}
