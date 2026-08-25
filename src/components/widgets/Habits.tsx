"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui";
import { toggleHabit } from "@/actions/habits";
import type { HabitState } from "@/lib/habits";
import type { Dictionary } from "@/i18n";

/**
 * Daily habits, on the board.
 *
 * A checklist that resets each morning: tick the thing when it is done, and a
 * streak keeps score so a good run is worth protecting. Personal — the ticks
 * belong to the signed-in account.
 */
export function Habits({ d, title, habits, canControl }: { d: Dictionary; title: string; habits: HabitState[]; canControl: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Card className="flex h-full flex-col">
      <CardHeader title={title} icon="✅" />
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {habits.length === 0 && <p className="p-4 text-sm text-muted">{d.widgets.habitsEmpty}</p>}
        {habits.map((h) => (
          <button
            key={h.name}
            type="button"
            disabled={!canControl || pending}
            onClick={() => start(() => void toggleHabit(h.name).then(() => router.refresh()))}
            className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-raised disabled:opacity-60"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                h.doneToday ? "border-ok bg-ok/20 text-ok" : "border-line text-transparent"
              }`}
            >
              ✓
            </span>
            <span className={`min-w-0 flex-1 truncate ${h.doneToday ? "" : "text-muted"}`}>{h.name}</span>
            {h.streak > 0 && <span className="shrink-0 text-xs text-faint">🔥 {h.streak}</span>}
          </button>
        ))}
      </div>
    </Card>
  );
}
