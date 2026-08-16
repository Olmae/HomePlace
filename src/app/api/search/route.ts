import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { canEdit } from "@/lib/auth";
import { listContainers } from "@/lib/docker";
import { resolvedDockerHosts } from "@/lib/integrations";
import { autoIcon, GLYPH } from "@/lib/icons";

export const dynamic = "force-dynamic";

export type SearchHit = {
  id: string;
  kind: "tile" | "container" | "page" | "dashboard";
  title: string;
  subtitle?: string;
  icon?: string;
  /** Where to go. External links open in a new tab. */
  href: string;
  external?: boolean;
};

/**
 * Everything the command palette can jump to.
 *
 * Built per request rather than kept as an index: a home lab has tens of
 * services, not thousands, and an index would be one more thing that can be
 * stale at the exact moment someone is looking for the container they just
 * started.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ hits: [] }, { status: 401 });

  const [items, dashboards] = await Promise.all([
    prisma.item.findMany({
      where: { kind: { in: ["service", "link"] } },
      select: { id: true, title: true, subtitle: true, icon: true, url: true, internalUrl: true, dashboardId: true },
    }),
    prisma.dashboard.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ]);

  const hits: SearchHit[] = [];

  for (const item of items) {
    const href = item.url ?? item.internalUrl;
    if (!href) continue;
    hits.push({
      id: `tile:${item.id}`,
      kind: "tile",
      title: item.title,
      subtitle: item.subtitle ?? undefined,
      icon: item.icon ?? autoIcon({ name: item.title, url: href }),
      href,
      external: /^https?:\/\//i.test(href),
    });
  }

  for (const dash of dashboards) {
    hits.push({ id: `dash:${dash.id}`, kind: "dashboard", title: dash.name, icon: GLYPH.dashboard, href: `/?tab=${dash.id}` });
  }

  // Containers are only useful to someone who may act on them.
  if (canEdit(user) && (await resolvedDockerHosts()).length > 0) {
    const containers = await listContainers();
    for (const c of containers) {
      hits.push({
        id: `ctr:${c.hostKey}:${c.id}`,
        kind: "container",
        title: c.name,
        subtitle: `${c.image} · ${c.state}`,
        icon: c.declared?.icon ?? autoIcon({ name: c.name, image: c.image }),
        href: `/containers/${encodeURIComponent(c.hostKey)}/${encodeURIComponent(c.id)}`,
      });
    }
  }

  const pages: SearchHit[] = [
    { id: "page:dashboard", kind: "page", title: "Dashboard", icon: GLYPH.dashboard, href: "/" },
    { id: "page:monitoring", kind: "page", title: "Monitoring", icon: GLYPH.monitoring, href: "/monitoring" },
    { id: "page:containers", kind: "page", title: "Containers", icon: GLYPH.container, href: "/containers" },
    { id: "page:events", kind: "page", title: "Events", icon: GLYPH.events, href: "/events" },
    { id: "page:settings", kind: "page", title: "Settings", icon: GLYPH.settings, href: "/settings" },
  ];

  return NextResponse.json({ hits: [...hits, ...pages] }, { headers: { "cache-control": "no-store" } });
}
