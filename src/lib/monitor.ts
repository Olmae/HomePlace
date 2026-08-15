import "server-only";
import { prisma } from "./db";
import { settings } from "./config";
import { listContainers } from "./docker";

/**
 * The availability prober.
 *
 * This is the one piece of history HomePlace keeps for itself. Prometheus knows
 * far more about metrics, but "is this service answering right now, and was it
 * answering last night" has to work on a fresh install with nothing else set
 * up — otherwise the dashboard has no status dots on day one.
 *
 * It runs in-process on a timer. A dashboard for one household does not need a
 * job queue, and a single interval is something you can reason about at 2am.
 */

const TICK_MS = 10_000;
let timer: NodeJS.Timeout | null = null;
let running = false;

export function startMonitor(): void {
  if (timer || !settings.monitorEnabled()) return;
  // A first pass shortly after boot, so the dashboard is not blank on arrival.
  setTimeout(() => void tick(), 3000);
  timer = setInterval(() => void tick(), TICK_MS);
  console.log("uptime monitor started");
}

async function tick(): Promise<void> {
  // Ticks must never overlap: a slow probe round would otherwise pile up
  // requests against a service that is already struggling.
  if (running) return;
  running = true;
  try {
    await probeDue();
    await pruneOldChecks();
  } catch (e) {
    console.error("monitor tick failed:", e);
  } finally {
    running = false;
  }
}

type ProbeResult = { ok: boolean; latency?: number; status?: number; error?: string };

async function probeDue(): Promise<void> {
  const items = await prisma.item.findMany({
    where: { checkKind: { not: "none" } },
    include: { checks: { orderBy: { at: "desc" }, take: 1 } },
  });
  if (items.length === 0) return;

  // Container states come from one listing rather than one API call per tile.
  const needContainers = items.some((i) => i.checkKind === "docker");
  const containers = needContainers ? await listContainers() : [];

  const now = Date.now();
  const due = items.filter((item) => {
    const last = item.checks[0];
    const interval = Math.max(settings.minCheckInterval(), item.checkInterval) * 1000;
    return !last || now - last.at.getTime() >= interval;
  });

  await Promise.all(
    due.map(async (item) => {
      const previous = item.checks[0]?.ok ?? null;
      const result =
        item.checkKind === "docker"
          ? probeContainer(item.containerName, item.hostKey, containers)
          : await probeHttp(item.checkUrl || item.internalUrl || item.url);

      await prisma.uptimeCheck.create({
        data: {
          itemId: item.id,
          ok: result.ok,
          latency: result.latency ?? null,
          status: result.status ?? null,
          error: result.error?.slice(0, 300) ?? null,
        },
      });

      // Only transitions become events. Writing one row per probe would bury
      // the feed under thousands of "still fine" entries.
      if (previous !== null && previous !== result.ok) {
        await prisma.event.create({
          data: {
            itemId: item.id,
            type: result.ok ? "up" : "down",
            severity: result.ok ? "info" : "error",
            title: item.title,
            detail: result.ok ? null : result.error?.slice(0, 300) ?? null,
          },
        });
      }
    })
  );
}

async function probeHttp(url: string | null | undefined): Promise<ProbeResult> {
  if (!url) return { ok: false, error: "no address to check" };
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "HomePlace/monitor" },
    });
    // Anything that answers is up. A login page returning 401, or a redirect to
    // one, still proves the service is alive — which is what the dot means.
    const ok = res.status < 500;
    return { ok, latency: Date.now() - started, status: res.status };
  } catch (e) {
    return { ok: false, latency: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
  }
}

function probeContainer(
  name: string | null,
  hostKey: string | null,
  containers: Awaited<ReturnType<typeof listContainers>>
): ProbeResult {
  if (!name) return { ok: false, error: "no container attached" };
  const found = containers.find((c) => c.name === name && (!hostKey || c.hostKey === hostKey));
  if (!found) return { ok: false, error: "container not found" };
  return { ok: found.state === "running", error: found.state === "running" ? undefined : found.status };
}

/** Keep the uptime table a rolling window; events are kept longer and separately. */
async function pruneOldChecks(): Promise<void> {
  const cutoff = new Date(Date.now() - settings.uptimeRetentionDays() * 86400_000);
  await prisma.uptimeCheck.deleteMany({ where: { at: { lt: cutoff } } });
  // Events are cheap but not infinite: a year is plenty for a home panel.
  await prisma.event.deleteMany({ where: { at: { lt: new Date(Date.now() - 365 * 86400_000) } } });
}

/** Availability over a window, for the tile footer. Null when never checked. */
export async function uptimeRatio(itemId: string, hours: number): Promise<number | null> {
  const since = new Date(Date.now() - hours * 3600_000);
  const [total, ok] = await Promise.all([
    prisma.uptimeCheck.count({ where: { itemId, at: { gte: since } } }),
    prisma.uptimeCheck.count({ where: { itemId, at: { gte: since }, ok: true } }),
  ]);
  if (total === 0) return null;
  return (ok / total) * 100;
}
