import "server-only";
import { statsForContainers, listContainers } from "./docker";

/**
 * A short history of what each container is costing.
 *
 * Prometheus with cAdvisor answers this properly and for weeks; this is for
 * everyone who has not set that up. The samples live in memory, capped, and are
 * lost on restart — which is the honest trade for a sparkline that appears on a
 * fresh installation with no exporters at all.
 *
 * It is deliberately not written to the database: a row per container per
 * fifteen seconds is a million rows a week, to draw a line two centimetres long.
 */

const MAX_POINTS = 60;
const MIN_GAP_MS = 20_000;

type Point = { at: number; cpu: number; memory: number };

const history = new Map<string, Point[]>();
let lastSample = 0;
let sampling = false;

/** Take one sample of every running container, at most every twenty seconds. */
export async function sampleContainers(): Promise<void> {
  if (sampling || Date.now() - lastSample < MIN_GAP_MS) return;
  sampling = true;
  try {
    const running = (await listContainers()).filter((c) => c.state === "running");
    if (running.length === 0) return;

    const stats = await statsForContainers(running, 40);
    const at = Date.now();

    for (const stat of stats) {
      const points = history.get(stat.name) ?? [];
      points.push({ at, cpu: stat.cpu, memory: stat.memory });
      // A ring buffer by another name: twenty minutes at this interval, which
      // is the width of the sparkline it feeds.
      history.set(stat.name, points.slice(-MAX_POINTS));
    }

    // Containers that no longer exist would otherwise keep their history for as
    // long as the process lives.
    const names = new Set(running.map((c) => c.name));
    for (const name of history.keys()) {
      if (!names.has(name)) history.delete(name);
    }

    lastSample = at;
  } catch (e) {
    console.error("container sampling failed:", e);
  } finally {
    sampling = false;
  }
}

/** Points for one container, oldest first, as the chart wants them. */
export function containerHistory(name: string): { cpu: [number, number][]; memory: [number, number][] } {
  const points = history.get(name) ?? [];
  return {
    cpu: points.map((p) => [p.at, p.cpu]),
    memory: points.map((p) => [p.at, p.memory]),
  };
}

export function hasHistory(): boolean {
  return history.size > 0;
}
