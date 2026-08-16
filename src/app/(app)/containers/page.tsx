import { prisma, getSetting } from "@/lib/db";
import { pageUser } from "@/lib/pageUser";
import { canEdit } from "@/lib/auth";
import { listContainers, statsForContainers } from "@/lib/docker";
import { settings } from "@/lib/config";
import { resolvedDockerHosts } from "@/lib/integrations";
import { dict } from "@/i18n";
import { EmptyState, Card, Badge } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ContainerTable, type Row } from "@/components/containers/ContainerTable";
import { bytes, percent } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Containers: the operations view.
 *
 * Deliberately not a second way to build the dashboard. The dashboard is the
 * arranged view of the services you chose to care about; this is the
 * unarranged truth about the machine — every container, what it costs right
 * now, which one is restarting in a loop — searchable, sortable, with the
 * controls next to each row.
 *
 * Adding one to the dashboard survives as one small button among the others,
 * because that is occasionally what you want after finding something here.
 */
export default async function ContainersPage() {
  const user = await pageUser();
  const d = dict(user.locale);
  const editable = canEdit(user);

  if ((await resolvedDockerHosts()).length === 0) {
    return <EmptyState title={d.containers.noDocker} hint={d.containers.noDockerHint} />;
  }

  const [containers, placed, hidden, dashboard, iconPack] = await Promise.all([
    listContainers(),
    prisma.item.findMany({ where: { containerName: { not: null } }, select: { containerName: true } }),
    getSetting<string[]>("containers.hidden", []),
    prisma.dashboard.findFirst({ orderBy: { order: "asc" }, select: { id: true } }),
    getSetting<boolean>("icons.pack", false),
  ]);

  // Statistics cost one request per container, so only running ones are asked:
  // a stopped container has nothing to report and would only add waiting.
  const running = containers.filter((c) => c.state === "running");
  const stats = await statsForContainers(running, 40);
  const statsBy = new Map(stats.map((s) => [s.name, s]));

  const placedNames = new Set(placed.map((p) => p.containerName!));
  const hiddenSet = new Set(hidden);

  const rows: Row[] = containers.map((c) => ({
    id: c.id,
    name: c.name,
    image: c.image,
    state: c.state,
    status: c.status,
    health: c.health,
    project: c.project,
    hostKey: c.hostKey,
    hostLabel: c.hostLabel,
    ports: c.ports,
    suggestedUrl: c.suggestedUrl,
    icon: c.declared?.icon,
    onDashboard: placedNames.has(c.name),
    hidden: hiddenSet.has(c.name),
    cpu: statsBy.get(c.name)?.cpu,
    memory: statsBy.get(c.name)?.memory,
    memoryLimit: statsBy.get(c.name)?.memoryLimit,
  }));

  const problems = rows.filter((r) => r.state === "restarting" || r.state === "dead" || r.health === "unhealthy");
  const totalCpu = stats.reduce((sum, s) => sum + s.cpu, 0);
  const totalMemory = stats.reduce((sum, s) => sum + s.memory, 0);

  return (
    <>
      <AutoRefresh seconds={20} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">{d.containers.title}</h1>
        {!settings.allowContainerControl() && <Badge tone="warn">{d.containers.controlDisabled}</Badge>}
      </div>

      {/* The summary answers what you came with, before you start reading rows:
          is everything up, and what is this machine spending. */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label={d.status.running} value={`${running.length} / ${rows.length}`} />
        <Summary
          label={d.containers.problems}
          value={String(problems.length)}
          tone={problems.length > 0 ? "danger" : undefined}
          detail={problems.slice(0, 3).map((p) => p.name).join(", ")}
        />
        <Summary label={d.monitoring.cpu} value={percent(totalCpu, 1)} />
        <Summary label={d.monitoring.memory} value={bytes(totalMemory)} />
      </div>

      <ContainerTable
        d={d}
        rows={rows}
        canEdit={editable}
        controlEnabled={settings.allowContainerControl()}
        dashboardId={dashboard?.id ?? null}
        iconPack={iconPack}
      />
    </>
  );
}

function Summary({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: "danger" }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`font-mono text-xl tabular-nums ${tone === "danger" ? "text-danger" : ""}`}>{value}</p>
      {detail && (
        <p className="truncate text-[11px] text-faint" title={detail}>
          {detail}
        </p>
      )}
    </Card>
  );
}
