import { Card, CardHeader } from "@/components/ui";
import { upcomingEvents, linkedAccount } from "@/lib/google";
import type { Dictionary } from "@/i18n";

/**
 * What is coming up, from a linked Google Calendar.
 *
 * Personal by construction: it reads the calendar of whoever is looking, so on
 * a household panel two people see their own days, and someone with no account
 * linked sees an invitation to link one rather than an empty box.
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
          <a href="/settings" className="mt-1 inline-block text-xs text-accent hover:underline">
            {d.nav.settings} →
          </a>
        </div>
      </Card>
    );
  }

  const days = Number(config.days) || 7;
  const limit = Number(config.limit) || 8;
  const events = await upcomingEvents(userId, days, limit);

  if (!events) {
    return (
      <Card className="h-full">
        <CardHeader title={title} />
        <p className="p-4 text-sm text-muted">{d.widgets.noData}</p>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader title={title} action={<span className="truncate text-[11px] text-faint">{account.email}</span>} />
      <ul className="divide-y divide-line">
        {events.length === 0 && <li className="px-4 py-3 text-sm text-muted">{d.widgets.calendarEmpty}</li>}
        {events.map((event) => {
          const start = new Date(event.start);
          const today = new Date().toDateString() === start.toDateString();
          return (
            <li key={event.id} className="flex items-baseline gap-3 px-4 py-2">
              <span className="w-16 shrink-0 font-mono text-[11px] tabular-nums text-muted">
                {event.allDay
                  ? d.widgets.allDay
                  : start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{event.summary || "—"}</span>
                {event.location && <span className="block truncate text-[11px] text-faint">{event.location}</span>}
              </span>
              <span className="shrink-0 text-[11px] text-faint">
                {today
                  ? d.widgets.today
                  : start.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
