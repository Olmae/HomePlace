"use client";

import { useMemo, useState } from "react";
import type { Dictionary } from "@/i18n";

export type CalendarItem = {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
};

/**
 * The month, drawn.
 *
 * Client-side because the two useful interactions — moving between months and
 * picking a day — should not be a round trip to the server for data that is
 * already in the browser.
 *
 * Weeks start on Monday. That is what the calendar on the wall does here, and a
 * grid that disagrees with the wall is read wrong at a glance.
 */
export function CalendarGrid({
  d,
  events,
  showList = true,
}: {
  d: Dictionary;
  events: CalendarItem[];
  showList?: boolean;
}) {
  const today = new Date();
  const [monthOffset, setMonthOffset] = useState(0);
  const [selected, setSelected] = useState<string>(dayKey(today));

  const view = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);

  // Events indexed by day, so painting the grid is a lookup rather than a scan
  // of every event for every one of the forty-two cells.
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const event of events) {
      const key = dayKey(new Date(event.start));
      const list = map.get(key);
      if (list) list.push(event);
      else map.set(key, [event]);
    }
    return map;
  }, [events]);

  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    // Monday = 0. getDay() calls Sunday 0, which would shift the whole grid.
    const lead = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - lead);

    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return date;
    });
  }, [view]);

  const selectedEvents = byDay.get(selected) ?? [];
  const weekdays = weekdayNames();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pt-2">
        <button
          type="button"
          onClick={() => setMonthOffset((m) => m - 1)}
          className="rounded-control px-2 py-0.5 text-sm text-muted transition-colors hover:bg-raised hover:text-text"
          aria-label="←"
        >
          ‹
        </button>
        <span className="text-xs font-medium">
          {view.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </span>
        <button
          type="button"
          onClick={() => setMonthOffset((m) => m + 1)}
          className="rounded-control px-2 py-0.5 text-sm text-muted transition-colors hover:bg-raised hover:text-text"
          aria-label="→"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-[2px] px-3 pt-2">
        {weekdays.map((name) => (
          <span key={name} className="text-center text-[10px] uppercase text-faint">
            {name}
          </span>
        ))}

        {cells.map((date) => {
          const key = dayKey(date);
          const outside = date.getMonth() !== view.getMonth();
          const isToday = key === dayKey(today);
          const count = byDay.get(key)?.length ?? 0;

          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              className={`flex aspect-square flex-col items-center justify-center rounded-[4px] text-[11px] transition-colors ${
                key === selected ? "bg-accent text-accent-fg" : isToday ? "bg-raised font-semibold" : "hover:bg-raised"
              } ${outside ? "text-faint" : ""}`}
            >
              {date.getDate()}
              {/* A dot, not a number: on a tile this size the count would be
                  unreadable, and "is anything on" is the question being asked. */}
              <span
                className={`mt-[1px] h-1 w-1 rounded-full ${
                  count === 0 ? "bg-transparent" : key === selected ? "bg-accent-fg" : "bg-accent"
                }`}
              />
            </button>
          );
        })}
      </div>

      {showList && (
        <ul className="mt-2 min-h-0 flex-1 divide-y divide-line overflow-y-auto border-t border-line">
          {selectedEvents.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted">{d.widgets.calendarEmpty}</li>
          )}
          {selectedEvents.map((event) => (
            <li key={event.id} className="flex items-baseline gap-2 px-3 py-1.5">
              <span className="w-12 shrink-0 font-mono text-[10px] tabular-nums text-muted">
                {event.allDay
                  ? d.widgets.allDay
                  : new Date(event.start).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs">{event.summary || "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Local date as YYYY-MM-DD. Not toISOString, which would shift by timezone. */
function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Short weekday names in the viewer's locale, Monday first. */
function weekdayNames(): string[] {
  const reference = new Date(2024, 0, 1); // a Monday
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(reference);
    day.setDate(reference.getDate() + i);
    return day.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2);
  });
}
