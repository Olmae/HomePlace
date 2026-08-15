import { Card, CardHeader, Meter, Badge } from "@/components/ui";
import { Sparkline } from "@/components/Sparkline";
import { Clock } from "./Clock";
import { query, queryOne, queryRange, Q } from "@/lib/prometheus";
import { guests, storages } from "@/lib/proxmox";
import { listContainers } from "@/lib/docker";
import { dockerHosts } from "@/lib/config";
import { prometheusConfig, proxmoxConfig } from "@/lib/integrations";
import { Slideshow } from "./Slideshow";
import { NowPlayingWidget } from "./NowPlaying";
import { bytes, percent, duration } from "@/lib/format";
import type { Dictionary } from "@/i18n";

/**
 * Widgets.
 *
 * Each one is a server component that fetches its own data and renders whatever
 * it managed to get. That isolation is the point: a Prometheus that stops
 * answering turns one card into "no data" instead of taking the dashboard down
 * with it, and adding a widget kind means adding a case here and nothing else.
 */

export type WidgetProps = {
  widget: string;
  config: Record<string, unknown>;
  title: string;
  d: Dictionary;
};

export async function Widget({ widget, config, title, d }: WidgetProps) {
  switch (widget) {
    case "system":
      return <SystemWidget config={config} title={title} d={d} />;
    case "disks":
      return <DisksWidget config={config} title={title} d={d} />;
    case "chart":
      return <ChartWidget config={config} title={title} d={d} />;
    case "containers":
      return <ContainersWidget title={title} d={d} />;
    case "proxmox":
      return <ProxmoxWidget title={title} d={d} />;
    case "clock":
      return <Clock title={title} timeZone={str(config.timeZone)} />;
    case "slideshow":
      return (
        <Slideshow
          images={lines(config.images)}
          intervalSeconds={num(config.intervalSeconds, 20)}
          caption={str(config.caption)}
          fit={str(config.fit) === "contain" ? "contain" : "cover"}
        />
      );
    case "nowplaying":
      return <NowPlayingWidget title={title} d={d} />;
    case "load":
      return <LoadWidget config={config} title={title} d={d} />;
    case "notes":
      return <NotesWidget title={title} text={str(config.text) ?? ""} />;
    default:
      return (
        <Card className="p-4">
          <p className="text-sm text-muted">{d.widgets.noData}</p>
        </Card>
      );
  }
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/** Multi-line textarea input as a list — how URLs are entered in the dialog. */
function lines(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return typeof v === "string" ? v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean) : [];
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Shown wherever a widget needs an integration the operator has not set up. */
function NotConfigured({ title, message, hint }: { title: string; message: string; hint: string }) {
  return (
    <Card className="h-full">
      <CardHeader title={title} />
      <div className="p-4">
        <p className="text-sm font-medium text-muted">{message}</p>
        <p className="mt-1 text-xs text-faint">{hint}</p>
      </div>
    </Card>
  );
}

// ───────────────────────────────── System ────────────────────────────────

async function SystemWidget({ config, title, d }: { config: Record<string, unknown>; title: string; d: Dictionary }) {
  if (!(await prometheusConfig())) {
    return <NotConfigured title={title} message={d.monitoring.noPrometheus} hint={d.monitoring.noPrometheusHint} />;
  }
  const instance = str(config.instance);

  // One await for everything: the numbers belong to the same moment, and four
  // sequential queries would show as a visible stagger on a slow Prometheus.
  const [cpu, memPercent, memUsed, memTotal, load, up, cpuHistory] = await Promise.all([
    queryOne(Q.cpuPercent(instance)),
    queryOne(Q.memoryPercent(instance)),
    queryOne(Q.memoryUsedBytes(instance)),
    queryOne(Q.memoryTotalBytes(instance)),
    queryOne(Q.load1(instance)),
    queryOne(Q.uptimeSeconds(instance)),
    queryRange(Q.cpuPercent(instance), num(config.rangeMinutes, 60), 60),
  ]);

  return (
    <Card className="h-full">
      <CardHeader
        title={title}
        action={up ? <span className="font-mono text-xs text-faint">{duration(up)}</span> : null}
      />
      <div className="space-y-3 p-4">
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-xs text-muted">{d.monitoring.cpu}</span>
            <span className="font-mono text-sm tabular-nums">{percent(cpu)}</span>
          </div>
          <Meter value={cpu ?? 0} />
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-xs text-muted">{d.monitoring.memory}</span>
            <span className="font-mono text-sm tabular-nums">
              {memUsed && memTotal ? `${bytes(memUsed)} / ${bytes(memTotal)}` : percent(memPercent)}
            </span>
          </div>
          <Meter value={memPercent ?? 0} />
        </div>

        {cpuHistory.length > 0 && <Sparkline points={cpuHistory[0].points} min={0} max={100} />}

        {load !== null && (
          <p className="font-mono text-xs text-faint">
            {d.monitoring.load}: {load.toFixed(2)}
          </p>
        )}
      </div>
    </Card>
  );
}

// ────────────────────────────────── Disks ────────────────────────────────

async function DisksWidget({ config, title, d }: { config: Record<string, unknown>; title: string; d: Dictionary }) {
  if (!(await prometheusConfig())) {
    return <NotConfigured title={title} message={d.monitoring.noPrometheus} hint={d.monitoring.noPrometheusHint} />;
  }
  const instance = str(config.instance);
  const [sizes, avail] = await Promise.all([query(Q.filesystems(instance)), query(Q.filesystemsFree(instance))]);

  // Two metrics, joined on the labels that identify a filesystem.
  const freeBy = new Map(avail.map((s) => [`${s.metric.instance}|${s.metric.mountpoint}`, s.value]));
  const rows = sizes
    .map((s) => {
      const key = `${s.metric.instance}|${s.metric.mountpoint}`;
      const free = freeBy.get(key) ?? 0;
      return {
        mount: s.metric.mountpoint ?? "?",
        instance: s.metric.instance ?? "",
        total: s.value,
        free,
        usedPercent: s.value > 0 ? ((s.value - free) / s.value) * 100 : 0,
      };
    })
    .filter((r) => r.total > 0)
    // Fullest first: the one about to cause a problem should be the one you see.
    .sort((a, b) => b.usedPercent - a.usedPercent)
    .slice(0, num(config.limit, 6));

  return (
    <Card className="h-full">
      <CardHeader title={title} />
      <div className="space-y-2.5 p-4">
        {rows.length === 0 && <p className="text-sm text-muted">{d.widgets.noData}</p>}
        {rows.map((r) => (
          <div key={`${r.instance}${r.mount}`}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate font-mono text-xs text-muted" title={r.mount}>
                {r.mount}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
                {bytes(r.free)} {d.monitoring.free}
              </span>
            </div>
            <Meter value={r.usedPercent} />
          </div>
        ))}
      </div>
    </Card>
  );
}

// ────────────────────────────────── Chart ────────────────────────────────

async function ChartWidget({ config, title, d }: { config: Record<string, unknown>; title: string; d: Dictionary }) {
  if (!(await prometheusConfig())) {
    return <NotConfigured title={title} message={d.monitoring.noPrometheus} hint={d.monitoring.noPrometheusHint} />;
  }
  const promql = str(config.query);
  if (!promql) {
    return (
      <Card className="h-full">
        <CardHeader title={title} />
        <p className="p-4 text-sm text-muted">{d.widgets.queryHint}</p>
      </Card>
    );
  }

  const minutes = num(config.rangeMinutes, 180);
  const unit = str(config.unit) ?? "number";
  const series = await queryRange(promql, minutes);
  const first = series[0];
  const last = first?.points.at(-1)?.[1];

  const formatted =
    last === undefined ? "—" : unit === "percent" ? percent(last, 1) : unit === "bytes" ? bytes(last) : last.toFixed(2);

  return (
    <Card className="h-full">
      <CardHeader title={title} action={<span className="font-mono text-xs tabular-nums text-faint">{formatted}</span>} />
      <div className="p-4">
        {first ? (
          <Sparkline points={first.points} min={unit === "percent" ? 0 : undefined} max={unit === "percent" ? 100 : undefined} />
        ) : (
          <p className="text-sm text-muted">{d.widgets.noData}</p>
        )}
        {series.length > 1 && <p className="mt-2 text-xs text-faint">+{series.length - 1}</p>}
      </div>
    </Card>
  );
}

// ──────────────────────────────── Containers ─────────────────────────────

async function ContainersWidget({ title, d }: { title: string; d: Dictionary }) {
  if (dockerHosts().length === 0) {
    return <NotConfigured title={title} message={d.containers.noDocker} hint={d.containers.noDockerHint} />;
  }
  const containers = await listContainers();
  const running = containers.filter((c) => c.state === "running").length;
  const stopped = containers.filter((c) => c.state !== "running");

  return (
    <Card className="h-full">
      <CardHeader title={title} />
      <div className="p-4">
        <p className="font-mono text-2xl tabular-nums">
          {running}
          <span className="text-base text-faint"> / {containers.length}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted">{d.status.running}</p>
        {stopped.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {stopped.slice(0, 8).map((c) => (
              <Badge key={c.id} tone="danger">
                {c.name}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ────────────────────────────────── Proxmox ──────────────────────────────

async function ProxmoxWidget({ title, d }: { title: string; d: Dictionary }) {
  if (!(await proxmoxConfig())) {
    return <NotConfigured title={title} message={d.monitoring.noProxmox} hint={d.monitoring.noProxmoxHint} />;
  }
  const [vms, stores] = await Promise.all([guests(), storages()]);
  const running = vms.filter((g) => g.status === "running").length;

  return (
    <Card className="h-full">
      <CardHeader title={title} />
      <div className="space-y-3 p-4">
        <div>
          <p className="font-mono text-2xl tabular-nums">
            {running}
            <span className="text-base text-faint"> / {vms.length}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">{d.monitoring.guests}</p>
        </div>
        {stores.slice(0, 4).map((s) => (
          <div key={`${s.node}-${s.storage}`}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate font-mono text-xs text-muted">{s.storage}</span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-faint">{bytes(s.avail)}</span>
            </div>
            <Meter value={s.total > 0 ? (s.used / s.total) * 100 : 0} />
          </div>
        ))}
      </div>
    </Card>
  );
}

// ────────────────────────── Container load ───────────────────────────────

/**
 * Which containers are actually using the machine.
 *
 * Sorted by CPU by default, because the question this answers is almost always
 * "what is making the fans spin". A list of names in the config narrows it to
 * the ones worth watching; empty means everything, top N.
 */
async function LoadWidget({ config, title, d }: { config: Record<string, unknown>; title: string; d: Dictionary }) {
  if (!(await prometheusConfig())) {
    return <NotConfigured title={title} message={d.monitoring.noPrometheus} hint={d.monitoring.noPrometheusHint} />;
  }

  const only = lines(config.containers);
  const sortBy = str(config.sortBy) === "memory" ? "memory" : "cpu";
  const limit = num(config.limit, 6);

  const [cpu, mem] = await Promise.all([query(Q.allContainerCpu()), query(Q.allContainerMemory())]);
  const memBy = new Map(mem.map((s) => [s.metric.name, s.value]));

  const rows = cpu
    .map((s) => ({ name: s.metric.name ?? "?", cpu: s.value, memory: memBy.get(s.metric.name) ?? 0 }))
    .filter((r) => (only.length === 0 ? true : only.includes(r.name)))
    .sort((a, b) => (sortBy === "memory" ? b.memory - a.memory : b.cpu - a.cpu))
    .slice(0, limit);

  // Bars are relative to the busiest row rather than to 100%: a host idling at
  // 3% would otherwise draw six identical empty bars.
  const peak = Math.max(...rows.map((r) => (sortBy === "memory" ? r.memory : r.cpu)), 0.0001);

  return (
    <Card className="h-full">
      <CardHeader title={title} action={<span className="text-[11px] text-faint">{sortBy}</span>} />
      <div className="space-y-2 p-4">
        {rows.length === 0 && <p className="text-sm text-muted">{d.widgets.noData}</p>}
        {rows.map((r) => (
          <div key={r.name}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate font-mono text-xs" title={r.name}>
                {r.name}
              </span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
                {percent(r.cpu, 1)} · {bytes(r.memory)}
              </span>
            </div>
            <Meter value={((sortBy === "memory" ? r.memory : r.cpu) / peak) * 100} tone="ok" />
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─────────────────────────────────── Note ────────────────────────────────

function NotesWidget({ title, text }: { title: string; text: string }) {
  return (
    <Card className="h-full">
      <CardHeader title={title} />
      {/* whitespace-pre-wrap keeps the line breaks the user typed; a note is a
          scratchpad, not a rich text document. */}
      <p className="whitespace-pre-wrap p-4 text-sm leading-relaxed text-muted">{text}</p>
    </Card>
  );
}
