import { Card, CardHeader } from "@/components/ui";
import { upcomingEvents, linkedAccount } from "@/lib/google";
import { CalendarGrid } from "./CalendarGrid";
import type { Dictionary } from "@/i18n";

/**
 * A calendar that looks like a calendar.
 *
 * The first version was a list of the next few events, which answers "what is
 * next" but not "how does this week look" — and the second question is the one
 * a wall calendar exists for. This draws the month, marks the days that have
 * something on them, and lists whatever is on the selected day underneath.
 *
 * Personal by construction: it reads the calendar of whoever is looking.
 */
export async function CalendarWidget({
  config,
  title,
  d,
  userId,
}: {
  config: Record<string, unknown>;
  title: string;
  d: Dictionary;
  userId: string;
}) {
  const account = await linkedAccount(userId);
  if (!account) {
    return (
      <Card className="h-full">
        <CardHeader title={title} />
        <div className="p-4">
          <p className="text-sm text-muted">{d.widgets.calendarNotLinked}</p>
          <a href="/settings?section=integrations" className="mt-1 inline-block text-xs text-accent hover:underline">
            {d.nav.settings} →
          </a>
        </div>
      </Card>
    );
  }

  // A month of events rather than a handful: the grid needs to know which days
  // are busy, and a day cannot be marked from a list of the next eight things.
  const events = await upcomingEvents(userId, 45, 250);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader title={title} action={<span className="truncate text-[11px] text-faint">{account.email}</span>} />
      <CalendarGrid
        d={d}
        events={(events ?? []).map((e) => ({
          id: e.id,
          summary: e.summary,
          start: e.start,
          end: e.end,
          allDay: e.allDay,
          location: e.location,
        }))}
        showList={config.list !== false}
      />
    </Card>
  );
}
