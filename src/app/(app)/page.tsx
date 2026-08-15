import Link from "next/link";
import { prisma } from "@/lib/db";
import { pageUser } from "@/lib/pageUser";
import { canEdit } from "@/lib/auth";
import { listContainers } from "@/lib/docker";
import { dockerHosts } from "@/lib/config";
import { statusFor } from "@/lib/status";
import { dict } from "@/i18n";
import { EmptyState } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Grid, GridCell } from "@/components/dashboard/Grid";
import { Tile } from "@/components/dashboard/Tile";
import { Tabs } from "@/components/dashboard/Tabs";
import { AddButton } from "@/components/dashboard/AddButton";
import type { ContainerOption } from "@/components/dashboard/ItemDialog";

export const dynamic = "force-dynamic";

/**
 * The home page: tabs of tiles.
 *
 * Which tab is open and whether the layout is being edited both live in the
 * URL. That keeps this a plain server component — no client-side layout state
 * to synchronise, and every view is a link someone can bookmark.
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

  const dashboards = await prisma.dashboard.findMany({ orderBy: { order: "asc" } });
  const active = dashboards.find((x) => x.id === searchParams.tab) ?? dashboards[0];

  if (!active) {
    return <EmptyState title={d.dashboard.empty} hint={d.dashboard.emptyHint} />;
  }

  const items = await prisma.item.findMany({
    where: { dashboardId: active.id, parentId: null },
    orderBy: { order: "asc" },
    include: { children: { orderBy: { order: "asc" } } },
  });

  // Children need statuses too — they are the links inside folders.
  const ids = items.flatMap((i) => [i.id, ...i.children.map((c) => c.id)]);
  const statuses = await statusFor(ids);

  // Only fetched when it can be used: the container picker in the add dialog.
  const containers: ContainerOption[] =
    editable && dockerHosts().length > 0
      ? (await listContainers()).map((c) => ({
          name: c.name,
          hostKey: c.hostKey,
          hostLabel: c.hostLabel,
          state: c.state,
          suggestedUrl: c.suggestedUrl,
          icon: c.declared?.icon,
          group: c.declared?.group,
        }))
      : [];

  const folders = items.filter((i) => i.kind === "folder").map((i) => ({ id: i.id, title: i.title }));

  return (
    <>
      <AutoRefresh seconds={30} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Tabs
          d={d}
          dashboards={dashboards.map((x) => ({ id: x.id, name: x.name }))}
          activeId={active.id}
          canEdit={editable}
        />

        {editable && (
          <div className="flex items-center gap-2">
            <Link
              href={`/?tab=${active.id}${editing ? "" : "&edit=1"}`}
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
        <Grid>
          {items.map((item) => (
            <GridCell key={item.id} w={item.w}>
              <Tile item={item} statuses={statuses} d={d} editing={editing} canEdit={editable} />
            </GridCell>
          ))}
        </Grid>
      )}
    </>
  );
}
