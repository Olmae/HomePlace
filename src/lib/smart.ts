import "server-only";
import { getSetting, setSetting, prisma } from "./db";
import { proxmoxConfig } from "./integrations";
import { nodes, disks, diskSmart, type DiskSmartCounters } from "./proxmox";
import { notify } from "./notify";

/**
 * SMART drift watch.
 *
 * A disk rarely dies all at once — it starts remapping sectors, then leaving
 * some pending, then failing to read them. The absolute count matters less than
 * the *change*: eight reallocated sectors that have sat at eight for a year are
 * fine; eight that became twelve last night are a warning to copy your data off.
 *
 * So this keeps a snapshot of the failing-sector counters and, on a slow
 * cadence, compares. Only an increase (or a health verdict falling from PASSED)
 * is worth a message — the first run just records the baseline silently, so the
 * known-eight does not page anyone. Reads SMART through Proxmox, which already
 * has privileged access to the disks the panel's own container does not.
 */

export type SmartDisk = {
  node: string;
  devpath: string;
  model: string;
  sizeGB: number;
  health: string;
  wearout?: number;
  type: string;
  counters: DiskSmartCounters;
};

const SNAPSHOT_KEY = "smart.snapshot";
type Snapshot = Record<string, { reallocated: number | null; pending: number | null; uncorrectable: number | null; health: string }>;

let cache: { at: number; disks: SmartDisk[] } | null = null;
let lastCheck = 0;

/** Current SMART for every physical disk Proxmox can see. Cached five minutes. */
export async function smartDisks(): Promise<SmartDisk[]> {
  if (cache && Date.now() - cache.at < 300_000) return cache.disks;
  if (!(await proxmoxConfig())) return [];

  const out: SmartDisk[] = [];
  for (const node of await nodes()) {
    for (const disk of await disks(node.node)) {
      out.push({
        node: node.node,
        devpath: disk.devpath,
        model: disk.model,
        sizeGB: Math.round(disk.size / 1e9),
        health: disk.health,
        wearout: disk.wearout,
        type: disk.type,
        counters: await diskSmart(node.node, disk.devpath),
      });
    }
  }
  cache = { at: Date.now(), disks: out };
  return out;
}

/**
 * Compare the failing-sector counters to the last snapshot and raise a
 * notification on any worsening. Runs at most hourly; safe to call every tick.
 */
export async function checkSmartDrift(): Promise<void> {
  if (Date.now() - lastCheck < 3_600_000) return;
  if (!(await proxmoxConfig())) return;
  lastCheck = Date.now();

  const current = await smartDisks();
  if (current.length === 0) return;

  const prev = (await getSetting<Snapshot | null>(SNAPSHOT_KEY, null)) ?? null;
  const next: Snapshot = {};
  const alerts: { title: string; body: string; severity: "warn" | "error" }[] = [];

  for (const d of current) {
    next[d.devpath] = { ...d.counters, health: d.health };
    const was = prev?.[d.devpath];
    if (!was) continue; // first sighting — baseline only, no alert

    const rose = (label: string, before: number | null, after: number | null): string | null =>
      before != null && after != null && after > before ? `${label} ${before} → ${after}` : null;

    const changes = [
      rose("reallocated", was.reallocated, d.counters.reallocated),
      rose("pending", was.pending, d.counters.pending),
      rose("uncorrectable", was.uncorrectable, d.counters.uncorrectable),
    ].filter((x): x is string => x !== null);

    const healthFell = was.health === "PASSED" && d.health !== "PASSED";

    if (changes.length > 0 || healthFell) {
      const name = `${d.model || d.devpath} (${d.sizeGB}GB)`;
      const parts = [...changes];
      if (healthFell) parts.push(`SMART: ${d.health}`);
      // Pending/uncorrectable rising, or a failed verdict, is the serious kind.
      const severe = healthFell || (d.counters.pending ?? 0) > (was.pending ?? 0) || (d.counters.uncorrectable ?? 0) > (was.uncorrectable ?? 0);
      alerts.push({ title: `💽 ${name}`, body: parts.join(", "), severity: severe ? "error" : "warn" });
    }
  }

  await setSetting(SNAPSHOT_KEY, next);

  for (const a of alerts) {
    await prisma.event.create({ data: { type: "system", severity: a.severity, title: a.title, detail: a.body } });
    await notify({ type: "system", severity: a.severity, title: a.title, body: a.body });
  }
}
