import Link from "next/link";
import { prisma, getSetting } from "@/lib/db";
import { ensureSlugs, ensureLayout } from "@/lib/dashboards";
import { pageUser } from "@/lib/pageUser";
import { canEdit } from "@/lib/auth";
import { listContainers } from "@/lib/docker";
import { dockerHosts } from "@/lib/config";
import { statusFor } from "@/lib/status";
import { dict } from "@/i18n";
import { EmptyState } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Board } from "@/components/dashboard/Board";
import { Tile } from "@/components/dashboard/Tile";
import { Tabs } from "@/components/dashboard/Tabs";
import { AddButton } from "@/components/dashboard/AddButton";
import { BackgroundButton } from "@/components/dashboard/BackgroundButton";
import type { ContainerOption } from "@/components/dashboard/ItemDialog";

export const dynamic = "force-dynamic";

/**
 * The browser tab is named after the dashboard, not after the app. With the
 * panel pinned in a browser all day, "Home · HomePlace" is what makes it
 * findable among twenty other tabs.
 */
export async function generateMetadata({ searchParams }: { searchParams: { tab?: string } }) {
  const dashboards = await prisma.dashboard.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true, slug: true } });
  const active =
    dashboards.find((x) => x.slug === searchParams.tab) ??
    dashboards.find((x) => x.id === searchParams.tab) ??
    dashboards[0];
  return { title: active ? `${active.name} · HomePlace` : "HomePlace" };
}

/**
 * The home page: tabs of tiles on a draggable board.
 *
 * Which tab is open and whether the layout is being edited both live in the
 * URL, which keeps this a plain server component — every view is a link
 * somebody can bookmark or set as their browser's home page.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { tab?: string; edit?: string };
}) {
  const user = await pageUser();
  const d = dict(user.locale);
  const editable = canEdit(user);
  const editing = editable && searchParams.edit === "1";

  // Self-healing for data written before slugs and positions existed. Both are
  // no-ops after the first run.
  await ensureSlugs();

  const dashboards = await prisma.dashboard.findMany({ orderBy: { order: "asc" } });
  // The tab is addressed by its slug; ids still resolve so old bookmarks and
  // links from elsewhere keep working.
  const active =
    dashboards.find((x) => x.slug === searchParams.tab) ??
    dashboards.find((x) => x.id === searchParams.tab) ??
    dashboards[0];

  if (!active) {
    return <EmptyState title={d.dashboard.empty} hint={d.dashboard.emptyHint} />;
  }

  await ensureLayout(active.id);

  const items = await prisma.item.findMany({
    where: { dashboardId: active.id, parentId: null },
    orderBy: [{ y: "asc" }, { x: "asc" }],
    include: { children: { orderBy: { order: "asc" } } },
  });

  // Children need statuses too — they are the links inside folders.
  const ids = items.flatMap((i) => [i.id, ...i.children.map((c) => c.id)]);
  const statuses = await statusFor(ids);

  // Only fetched when it can be used: the container picker in the add dialog.
  // Which containers already have a tile anywhere — the picker sends those to
  // the end of the grid instead of hiding them.
  const placed = new Set(
    (await prisma.item.findMany({ where: { containerName: { not: null } }, select: { containerName: true } })).map(
      (i) => i.containerName!
    )
  );

  const containers: ContainerOption[] =
    editable && dockerHosts().length > 0
      ? (await listContainers()).map((c) => ({
          name: c.name,
          hostKey: c.hostKey,
          hostLabel: c.hostLabel,
          state: c.state,
          image: c.image,
          suggestedUrl: c.suggestedUrl,
          icon: c.declared?.icon,
          group: c.declared?.group,
          onDashboard: placed.has(c.name),
        }))
      : [];

  // Off by default: the pack is fetched from the public internet, and a LAN-only
  // panel should not depend on that.
  const iconPack = await getSetting<boolean>("icons.pack", false);

  const folders = items.filter((i) => i.kind === "folder").map((i) => ({ id: i.id, title: i.title }));

  return (
    <>
      <AutoRefresh seconds={30} />

      {/* The dashboard's own photo, behind everything. Set per tab, so a
          "home" tab can look like a home and a "servers" tab like a panel. */}
      {active.backgroundUrl && (
        <div
          className="hp-backdrop"
          style={{
            ["--backdrop-image" as string]: `url("${active.backgroundUrl.replace(/"/g, "%22")}")`,
            ["--backdrop-dim" as string]: String(active.backgroundDim),
            ["--backdrop-blur" as string]: `${active.backgroundBlur}px`,
          }}
          aria-hidden
        />
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Tabs
          d={d}
          dashboards={dashboards.map((x) => ({ id: x.id, name: x.name, slug: x.slug ?? x.id }))}
          activeId={active.id}
          canEdit={editable}
        />

        {editable && (
          <div className="flex items-center gap-2">
            {editing && <span className="hidden text-xs text-faint sm:inline">{d.dashboard.dragHint}</span>}
            <BackgroundButton
              d={d}
              dashboardId={active.id}
              current={{
                backgroundUrl: active.backgroundUrl ?? "",
                backgroundDim: active.backgroundDim,
                backgroundBlur: active.backgroundBlur,
              }}
            />
            <Link
              href={`/?tab=${active.slug ?? active.id}${editing ? "" : "&edit=1"}`}
              className={`rounded-control px-3 py-1.5 text-sm font-medium transition-colors ${
                editing ? "bg-accent/10 text-accent" : "text-muted hover:bg-raised hover:text-text"
              }`}
            >
              {editing ? d.dashboard.doneEditing : d.dashboard.editMode}
            </Link>
            <AddButton d={d} dashboardId={active.id} containers={containers} folders={folders} />
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState title={d.dashboard.empty} hint={editable ? d.dashboard.emptyHint : undefined} />
      ) : (
        <Board layout={items.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }))} editing={editing}>
          {items.map((item) => (
            <Tile
              key={item.id}
              item={item}
              statuses={statuses}
              d={d}
              editing={editing}
              canEdit={editable}
              iconPack={iconPack}
            />
          ))}
        </Board>
      )}
    </>
  );
}
