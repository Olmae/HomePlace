import { prisma, getSetting } from "@/lib/db";
import { pageUser } from "@/lib/pageUser";
import { canEdit } from "@/lib/auth";
import { listContainers } from "@/lib/docker";
import { dockerHosts, settings } from "@/lib/config";
import { dict } from "@/i18n";
import { EmptyState, SectionTitle, Badge } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ContainerCard } from "@/components/containers/ContainerCard";

export const dynamic = "force-dynamic";

/**
 * Every container on every configured host, whether or not it is on a
 * dashboard.
 *
 * Discovery is the point: a container that appears on the server shows up here
 * by itself, and adding it to the dashboard is one click. Nothing has to be
 * declared in advance, and nothing is added to the dashboard without being
 * asked for.
 */
export default async function ContainersPage() {
  const user = await pageUser();
  const d = dict(user.locale);
  const editable = canEdit(user);

  if (dockerHosts().length === 0) {
    return <EmptyState title={d.containers.noDocker} hint={d.containers.noDockerHint} />;
  }

  const [containers, placed, hidden, dashboards] = await Promise.all([
    listContainers(),
    prisma.item.findMany({ where: { containerName: { not: null } }, select: { containerName: true } }),
    getSetting<string[]>("containers.hidden", []),
    prisma.dashboard.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ]);

  const placedNames = new Set(placed.map((p) => p.containerName!));
  const hiddenSet = new Set(hidden);

  // Three groups, in the order they matter: what is new, what is already
  // arranged, and what was deliberately put out of sight.
  const fresh = containers.filter((c) => !placedNames.has(c.name) && !hiddenSet.has(c.name) && !c.declared?.hide);
  const onDashboard = containers.filter((c) => placedNames.has(c.name));
  const hiddenOnes = containers.filter((c) => hiddenSet.has(c.name) || c.declared?.hide);

  const groups = [
    { key: "fresh", title: d.containers.discovered, hint: d.containers.discoveredHint, list: fresh },
    { key: "placed", title: d.containers.onDashboard, hint: undefined, list: onDashboard },
    { key: "hidden", title: d.containers.hidden, hint: undefined, list: hiddenOnes },
  ].filter((g) => g.list.length > 0);

  return (
    <>
      <AutoRefresh seconds={20} />

      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">{d.containers.title}</h1>
        {!settings.allowContainerControl() && <Badge tone="warn">{d.containers.controlDisabled}</Badge>}
      </div>

      {groups.length === 0 && <EmptyState title={d.containers.noDocker} hint={d.containers.noDockerHint} />}

      {groups.map((group) => (
        <section key={group.key} className="mb-7">
          <SectionTitle hint={group.hint}>
            {group.title} <span className="text-muted">· {group.list.length}</span>
          </SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.list.map((c) => (
              <ContainerCard
                key={`${c.hostKey}/${c.id}`}
                d={d}
                canEdit={editable}
                controlEnabled={settings.allowContainerControl()}
                hidden={hiddenSet.has(c.name)}
                dashboards={dashboards}
                container={{
                  id: c.id,
                  name: c.name,
                  image: c.image,
                  state: c.state,
                  status: c.status,
                  hostKey: c.hostKey,
                  hostLabel: c.hostLabel,
                  ports: c.ports,
                  suggestedUrl: c.suggestedUrl,
                  icon: c.declared?.icon,
                  onDashboard: placedNames.has(c.name),
                }}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
