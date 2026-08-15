import Link from "next/link";
import { pageUser } from "@/lib/pageUser";
import { prometheus as promConfig, proxmox as pveConfig } from "@/lib/config";
import { query, queryOne, queryRange, Q } from "@/lib/prometheus";
import { nodes, guests, disks, storages } from "@/lib/proxmox";
import { dict } from "@/i18n";
import { Card, CardHeader, Meter, Badge, EmptyState, SectionTitle } from "@/components/ui";
import { Sparkline } from "@/components/Sparkline";
import { AutoRefresh } from "@/components/AutoRefresh";
import { bytes, percent, duration } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Monitoring.
 *
 * One switcher across the top: an overview, then one view per machine that
 * reports to Prometheus, then Proxmox for the things only the hypervisor knows
 * — physical disks, SMART, guests. Which view is open is a URL parameter, so
 * "the page I always look at" is a bookmark.
 */
export default async function MonitoringPage({ searchParams }: { searchParams: { host?: string } }) {
  const user = await pageUser();
  const d = dict(user.locale);

  const hasProm = promConfig() !== null;
  const hasPve = pveConfig() !== null;

  if (!hasProm && !hasPve) {
    return (
      <div className="space-y-3">
        <EmptyState title={d.monitoring.noPrometheus} hint={d.monitoring.noPrometheusHint} />
        <EmptyState title={d.monitoring.noProxmox} hint={d.monitoring.noProxmoxHint} />
      </div>
    );
  }

  // The machine list comes from Prometheus itself rather than from a list
  // someone has to maintain: a new node_exporter shows up here on its own.
  const instances = hasProm
    ? Array.from(new Set((await query(Q.instances())).map((s) => s.metric.instance).filter(Boolean))).sort()
    : [];

  const view = searchParams.host ?? "overview";

  const tabs = [
    { key: "overview", label: d.monitoring.allHosts },
    ...instances.map((i) => ({ key: i, label: i })),
    ...(hasPve ? [{ key: "proxmox", label: "Proxmox" }] : []),
  ];

  return (
    <>
      <AutoRefresh seconds={30} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight">{d.monitoring.title}</h1>
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={`/monitoring?host=${encodeURIComponent(tab.key)}`}
              className={`whitespace-nowrap rounded-control px-3 py-1.5 font-mono text-xs transition-colors ${
                view === tab.key ? "bg-raised text-text" : "text-muted hover:bg-raised hover:text-text"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {view === "overview" && <Overview d={d} instances={instances} hasPve={hasPve} />}
      {view === "proxmox" && hasPve && <ProxmoxView d={d} />}
      {view !== "overview" && view !== "proxmox" && <HostView d={d} instance={view} />}
    </>
  );
}

// ───────────────────────────────── Overview ──────────────────────────────

async function Overview({ d, instances, hasPve }: { d: ReturnType<typeof dict>; instances: string[]; hasPve: boolean }) {
  return (
    <div className="space-y-6">
      {instances.length > 0 && (
        <section>
          <SectionTitle>{d.monitoring.host}</SectionTitle>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {instances.map((instance) => (
              <HostSummary key={instance} d={d} instance={instance} />
            ))}
          </div>
        </section>
      )}

      {hasPve && (
        <section>
          <SectionTitle>Proxmox</SectionTitle>
          <GuestTable d={d} />
        </section>
      )}
    </div>
  );
}

async function HostSummary({ d, instance }: { d: ReturnType<typeof dict>; instance: string }) {
  const [cpu, mem, up, history] = await Promise.all([
    queryOne(Q.cpuPercent(instance)),
    queryOne(Q.memoryPercent(instance)),
    queryOne(Q.uptimeSeconds(instance)),
    queryRange(Q.cpuPercent(instance), 60, 60),
  ]);

  return (
    <Card>
      <CardHeader
        title={<span className="font-mono text-xs">{instance}</span>}
        action={up ? <span className="font-mono text-[11px] text-faint">{duration(up)}</span> : null}
      />
      <div className="space-y-3 p-4">
        <Row label={d.monitoring.cpu} value={percent(cpu)} meter={cpu ?? 0} />
        <Row label={d.monitoring.memory} value={percent(mem)} meter={mem ?? 0} />
        {history[0] && <Sparkline points={history[0].points} min={0} max={100} />}
        <Link
          href={`/monitoring?host=${encodeURIComponent(instance)}`}
          className="inline-block text-xs text-accent hover:underline"
        >
          {d.common.next} →
        </Link>
      </div>
    </Card>
  );
}

// ─────────────────────────────── Single host ─────────────────────────────

async function HostView({ d, instance }: { d: ReturnType<typeof dict>; instance: string }) {
  const [cpuHistory, memHistory, sizes, avail, temps, rx, tx, load, up] = await Promise.all([
    queryRange(Q.cpuPercent(instance), 180),
    queryRange(Q.memoryPercent(instance), 180),
    query(Q.filesystems(instance)),
    query(Q.filesystemsFree(instance)),
    query(Q.temperatures(instance)),
    query(Q.networkRx(instance)),
    query(Q.networkTx(instance)),
    queryOne(Q.load1(instance)),
    queryOne(Q.uptimeSeconds(instance)),
  ]);

  const freeBy = new Map(avail.map((s) => [s.metric.mountpoint, s.value]));
  const filesystems = sizes
    .map((s) => {
      const free = freeBy.get(s.metric.mountpoint) ?? 0;
      return {
        mount: s.metric.mountpoint ?? "?",
        device: s.metric.device ?? "",
        total: s.value,
        free,
        used: s.value - free,
        usedPercent: s.value > 0 ? ((s.value - free) / s.value) * 100 : 0,
      };
    })
    .filter((f) => f.total > 0)
    .sort((a, b) => b.total - a.total);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader
          title={d.monitoring.cpu}
          action={
            <span className="font-mono text-xs text-faint">
              {load !== null ? `load ${load.toFixed(2)}` : ""} {up ? `· ${duration(up)}` : ""}
            </span>
          }
        />
        <div className="p-4">
          {cpuHistory[0] ? <Sparkline points={cpuHistory[0].points} min={0} max={100} /> : <NoData d={d} />}
        </div>
      </Card>

      <Card>
        <CardHeader title={d.monitoring.memory} />
        <div className="p-4">
          {memHistory[0] ? <Sparkline points={memHistory[0].points} min={0} max={100} tone="ok" /> : <NoData d={d} />}
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title={d.monitoring.disks} />
        <div className="space-y-3 p-4">
          {filesystems.length === 0 && <NoData d={d} />}
          {filesystems.map((f) => (
            <div key={f.mount}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-xs">
                  {f.mount} <span className="text-faint">{f.device}</span>
                </span>
                <span className="font-mono text-xs tabular-nums text-muted">
                  {bytes(f.used)} / {bytes(f.total)} · {bytes(f.free)} {d.monitoring.free}
                </span>
              </div>
              <Meter value={f.usedPercent} />
            </div>
          ))}
        </div>
      </Card>

      {temps.length > 0 && (
        <Card>
          <CardHeader title={d.monitoring.temperature} />
          <div className="grid grid-cols-2 gap-2 p-4">
            {temps.slice(0, 8).map((t, i) => (
              <div key={`${t.metric.chip}-${t.metric.sensor}-${i}`} className="flex items-baseline justify-between gap-2">
                <span className="truncate font-mono text-[11px] text-muted">{t.metric.sensor ?? t.metric.chip}</span>
                <span className="font-mono text-sm tabular-nums">{t.value.toFixed(0)}°</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {(rx.length > 0 || tx.length > 0) && (
        <Card>
          <CardHeader title={d.monitoring.network} />
          <div className="space-y-1.5 p-4">
            {rx.map((s, i) => (
              <div key={`${s.metric.device}-${i}`} className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[11px] text-muted">{s.metric.device}</span>
                <span className="font-mono text-xs tabular-nums">
                  ↓ {bytes(s.value)}/s ↑ {bytes(tx.find((t) => t.metric.device === s.metric.device)?.value ?? 0)}/s
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ───────────────────────────────── Proxmox ───────────────────────────────

async function ProxmoxView({ d }: { d: ReturnType<typeof dict> }) {
  const nodeList = await nodes();
  const [diskLists, stores] = await Promise.all([
    Promise.all(nodeList.map(async (n) => ({ node: n.node, list: await disks(n.node) }))),
    storages(),
  ]);

  return (
    <div className="space-y-6">
      <GuestTable d={d} />

      <section>
        <SectionTitle>{d.monitoring.disks}</SectionTitle>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {diskLists.map(({ node, list }) => (
            <Card key={node}>
              <CardHeader title={<span className="font-mono text-xs">{node}</span>} />
              <div className="divide-y divide-line">
                {list.map((disk) => (
                  <div key={disk.devpath} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs">{disk.devpath}</p>
                      <p className="truncate text-[11px] text-faint">
                        {disk.model} · {bytes(disk.size)} · {disk.type}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {disk.wearout !== undefined && <span className="font-mono text-[11px] text-faint">{disk.wearout}%</span>}
                      <Badge tone={disk.health === "PASSED" ? "ok" : disk.health === "UNKNOWN" ? "neutral" : "danger"}>
                        {disk.health === "PASSED" ? d.monitoring.smartPassed : disk.health}
                      </Badge>
                    </div>
                  </div>
                ))}
                {list.length === 0 && <p className="px-4 py-3 text-sm text-muted">{d.widgets.noData}</p>}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>{d.monitoring.storage}</SectionTitle>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {stores.map((s) => (
            <Card key={`${s.node}-${s.storage}`} className="p-4">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="truncate font-mono text-xs">{s.storage}</span>
                <span className="font-mono text-[11px] text-faint">{s.node}</span>
              </div>
              <Meter value={s.total > 0 ? (s.used / s.total) * 100 : 0} />
              <p className="mt-1.5 font-mono text-[11px] tabular-nums text-muted">
                {bytes(s.used)} / {bytes(s.total)}
              </p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

async function GuestTable({ d }: { d: ReturnType<typeof dict> }) {
  const list = await guests();
  if (list.length === 0) return <NoData d={d} />;

  return (
    <Card>
      <CardHeader title={d.monitoring.guests} />
      {/* The table scrolls inside its own box; the page itself must never scroll
          sideways on a phone. */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Node</th>
              <th className="px-4 py-2 font-medium">CPU</th>
              <th className="px-4 py-2 font-medium">{d.monitoring.memory}</th>
              <th className="px-4 py-2 font-medium">{d.monitoring.uptime}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((g) => (
              <tr key={g.id}>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-2">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${g.status === "running" ? "bg-ok" : "bg-faint"}`}
                      aria-hidden
                    />
                    <span className="font-medium">{g.name || g.vmid}</span>
                    <span className="font-mono text-[11px] text-faint">{g.type}</span>
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-muted">{g.node}</td>
                <td className="px-4 py-2 font-mono text-xs tabular-nums">{(g.cpu * 100).toFixed(0)}%</td>
                <td className="px-4 py-2 font-mono text-xs tabular-nums">
                  {bytes(g.mem)} / {bytes(g.maxmem)}
                </td>
                <td className="px-4 py-2 font-mono text-xs tabular-nums text-muted">{duration(g.uptime)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Row({ label, value, meter }: { label: string; value: string; meter: number }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs text-muted">{label}</span>
        <span className="font-mono text-sm tabular-nums">{value}</span>
      </div>
      <Meter value={meter} />
    </div>
  );
}

function NoData({ d }: { d: ReturnType<typeof dict> }) {
  return <p className="text-sm text-muted">{d.widgets.noData}</p>;
}
