import { notFound } from "next/navigation";
import { prisma, getSetting } from "@/lib/db";
import { statusFor } from "@/lib/status";
import { normalizeStatusPage, STATUS_PAGE_KEY, EMPTY_STATUS_PAGE } from "@/lib/statusPage";
import { StatusDot } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { percent } from "@/lib/format";
import { dict } from "@/i18n";
import { settings } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * The public status page.
 *
 * Deliberately outside the (app) group, so it carries none of the panel's
 * navigation and, more to the point, none of its authentication — this is the
 * one page anyone may see. It shows only the services the operator chose, and
 * only whether they are up and how much of the day they have been.
 */
export default async function StatusPage() {
  const config = normalizeStatusPage(await getSetting(STATUS_PAGE_KEY, EMPTY_STATUS_PAGE));
  if (!config.enabled || config.itemIds.length === 0) notFound();

  const d = dict(settings.defaultLocale());
  const items = await prisma.item.findMany({
    where: { id: { in: config.itemIds }, checkKind: { not: "none" } },
    select: { id: true, title: true, subtitle: true },
  });
  const order = new Map(config.itemIds.map((id, i) => [id, i]));
  items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const statuses = await statusFor(items.map((i) => i.id));
  const down = items.filter((i) => statuses.get(i.id)?.ok === false).length;
  const allUp = down === 0;

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-12">
      <AutoRefresh seconds={60} />

      <div className="mb-6 flex items-center gap-3">
        <span className={`h-3 w-3 rounded-full ${allUp ? "bg-ok" : "bg-danger"}`} aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">{config.title.trim() || "Status"}</h1>
      </div>

      <p className="mb-6 text-sm text-muted">
        {allUp ? d.status.up : `${down} ${d.status.down.toLowerCase()}`}
      </p>

      <div className="divide-y divide-line rounded-card border border-line">
        {items.map((item) => {
          const s = statuses.get(item.id);
          const kind = s?.ok === null || s?.ok === undefined ? "unknown" : s.ok ? "up" : "down";
          return (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                {item.subtitle && <p className="truncate text-xs text-muted">{item.subtitle}</p>}
              </div>
              {s?.uptime24h != null && (
                <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
                  {percent(s.uptime24h, 1)}
                </span>
              )}
              <StatusDot kind={kind} label={kind === "up" ? d.status.up : kind === "down" ? d.status.down : d.status.unknown} />
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-[11px] text-faint">HomePlace</p>
    </main>
  );
}
