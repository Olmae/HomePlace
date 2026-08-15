import { prisma } from "@/lib/db";
import { pageUser } from "@/lib/pageUser";
import { dict } from "@/i18n";
import { Card, EmptyState, Badge } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ago } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * The feed of things that changed.
 *
 * Only transitions land here — a service going down or coming back, a restart
 * someone triggered, a sign-in. A row per probe would be a log, and nobody
 * reads a log looking for "what broke last night".
 */
export default async function EventsPage() {
  const user = await pageUser();
  const d = dict(user.locale);

  const events = await prisma.event.findMany({
    orderBy: { at: "desc" },
    take: 200,
    include: { item: { select: { title: true } } },
  });

  if (events.length === 0) {
    return <EmptyState title={d.events.empty} />;
  }

  const label: Record<string, string> = {
    down: d.events.wentDown,
    up: d.events.cameUp,
    restart: d.events.restarted,
    login: d.events.signedIn,
    "auth-fail": d.events.authFailed,
    discovery: d.events.discovered,
  };

  return (
    <>
      <AutoRefresh seconds={60} />
      <h1 className="mb-4 text-lg font-semibold tracking-tight">{d.events.title}</h1>

      <Card>
        <ul className="divide-y divide-line">
          {events.map((event) => (
            <li key={event.id} className="flex items-start gap-3 px-4 py-2.5">
              <span
                className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                  event.severity === "error" ? "bg-danger" : event.severity === "warn" ? "bg-warn" : "bg-ok"
                }`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{event.item?.title ?? event.title}</span>{" "}
                  <span className="text-muted">{label[event.type] ?? event.type}</span>
                </p>
                {event.detail && (
                  <p className="mt-0.5 truncate font-mono text-[11px] text-faint" title={event.detail}>
                    {event.detail}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {event.actor && <Badge>{event.actor}</Badge>}
                <span className="whitespace-nowrap text-xs text-faint">{ago(event.at, d)}</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
