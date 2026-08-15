import "server-only";
import { prometheus } from "./config";

/**
 * Prometheus is the source of every number with a history: CPU, memory, disk
 * usage, temperatures, per-container metrics.
 *
 * HomePlace does not scrape anything itself. Storing time series in SQLite next
 * to a dashboard is a worse version of a tool most home labs already run, and
 * without it the panel still works — it just shows fewer numbers.
 */

export type Sample = { metric: Record<string, string>; value: number; time: number };
export type Series = { metric: Record<string, string>; points: [number, number][] };

function auth(): HeadersInit {
  const cfg = prometheus();
  if (!cfg?.username || !cfg.password) return {};
  const token = Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
  return { authorization: `Basic ${token}` };
}

async function promFetch(path: string, params: Record<string, string>) {
  const cfg = prometheus();
  if (!cfg) throw new Error("prometheus is not configured");
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${cfg.url}${path}?${qs}`, {
    headers: auth(),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`prometheus HTTP ${res.status}`);
  const body = await res.json();
  if (body.status !== "success") throw new Error(body.error ?? "prometheus returned an error");
  return body.data;
}

/** Instant query. Returns [] rather than throwing when Prometheus is absent. */
export async function query(promql: string): Promise<Sample[]> {
  if (!prometheus()) return [];
  try {
    const data = await promFetch("/api/v1/query", { query: promql });
    if (data.resultType !== "vector") return [];
    return data.result.map((r: { metric: Record<string, string>; value: [number, string] }) => ({
      metric: r.metric,
      time: r.value[0] * 1000,
      value: Number(r.value[1]),
    }));
  } catch (e) {
    console.error("prometheus query failed:", promql, e);
    return [];
  }
}

/** Single number, for a gauge tile. */
export async function queryOne(promql: string): Promise<number | null> {
  const rows = await query(promql);
  if (rows.length === 0) return null;
  const v = rows[0].value;
  return Number.isFinite(v) ? v : null;
}

/** Range query, for charts. `minutes` back from now. */
export async function queryRange(promql: string, minutes: number, points = 120): Promise<Series[]> {
  if (!prometheus()) return [];
  const end = Math.floor(Date.now() / 1000);
  const start = end - minutes * 60;
  // Keep the number of points near what the chart can actually draw; a 30-day
  // range at 15s resolution is 170k points nobody will ever see.
  const step = Math.max(15, Math.round((end - start) / points));
  try {
    const data = await promFetch("/api/v1/query_range", {
      query: promql,
      start: String(start),
      end: String(end),
      step: String(step),
    });
    return data.result.map((r: { metric: Record<string, string>; values: [number, string][] }) => ({
      metric: r.metric,
      points: r.values.map(([t, v]) => [t * 1000, Number(v)] as [number, number]),
    }));
  } catch (e) {
    console.error("prometheus range query failed:", promql, e);
    return [];
  }
}

/**
 * Ready-made queries for the built-in widgets.
 *
 * They assume node_exporter and cAdvisor, the two exporters practically every
 * home lab already has. `instance` narrows them to one machine; empty means all.
 */
export const Q = {
  cpuPercent: (instance?: string) =>
    `100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"${sel(instance)}}[2m])) * 100)`,
  memoryPercent: (instance?: string) =>
    `100 * (1 - node_memory_MemAvailable_bytes${sel(instance, true)} / node_memory_MemTotal_bytes${sel(instance, true)})`,
  memoryUsedBytes: (instance?: string) =>
    `node_memory_MemTotal_bytes${sel(instance, true)} - node_memory_MemAvailable_bytes${sel(instance, true)}`,
  memoryTotalBytes: (instance?: string) => `node_memory_MemTotal_bytes${sel(instance, true)}`,
  load1: (instance?: string) => `node_load1${sel(instance, true)}`,
  uptimeSeconds: (instance?: string) => `time() - node_boot_time_seconds${sel(instance, true)}`,
  /** Filesystem usage, one series per mount point. tmpfs and overlays excluded. */
  filesystems: (instance?: string) =>
    `node_filesystem_size_bytes{fstype!~"tmpfs|overlay|squashfs|ramfs"${sel(instance)}}`,
  filesystemsFree: (instance?: string) =>
    `node_filesystem_avail_bytes{fstype!~"tmpfs|overlay|squashfs|ramfs"${sel(instance)}}`,
  temperatures: (instance?: string) => `node_hwmon_temp_celsius${sel(instance, true)}`,
  networkRx: (instance?: string) => `rate(node_network_receive_bytes_total{device!~"lo|veth.*|br-.*|docker.*"${sel(instance)}}[2m])`,
  networkTx: (instance?: string) => `rate(node_network_transmit_bytes_total{device!~"lo|veth.*|br-.*|docker.*"${sel(instance)}}[2m])`,
  /** Machines reporting to Prometheus — the list behind the host switcher. */
  instances: () => `up{job=~".*node.*"}`,
  containerCpu: (name: string) => `rate(container_cpu_usage_seconds_total{name="${escape(name)}"}[2m]) * 100`,
  containerMemory: (name: string) => `container_memory_working_set_bytes{name="${escape(name)}"}`,
};

/** Build a label selector fragment, either appended to existing labels or alone. */
function sel(instance?: string, standalone = false): string {
  if (!instance) return "";
  const matcher = `instance="${escape(instance)}"`;
  return standalone ? `{${matcher}}` : `,${matcher}`;
}

/** PromQL string literals are double-quoted; a stray quote would break the query. */
function escape(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function prometheusHealth(): Promise<{ ok: boolean; error?: string }> {
  const cfg = prometheus();
  if (!cfg) return { ok: false, error: "not configured" };
  try {
    const res = await fetch(`${cfg.url}/-/healthy`, {
      headers: auth(),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
