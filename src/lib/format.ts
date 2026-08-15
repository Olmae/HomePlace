import { fill, type Dictionary } from "@/i18n";

/** Bytes as a human size. Binary units, because that is what disks report. */
export function bytes(n: number, digits = 1): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const value = n / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export function percent(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

/** Duration in seconds as "12d 4h" — long uptimes should stay readable. */
export function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** "5 min ago", localised. */
export function ago(date: Date | string | number, d: Dictionary): string {
  const then = new Date(date).getTime();
  const diff = Math.max(0, Date.now() - then) / 1000;
  if (diff < 45) return d.time.justNow;
  if (diff < 90) return fill(d.time.minutesAgo, { n: 1 });
  if (diff < 3600) return fill(d.time.minutesAgo, { n: Math.round(diff / 60) });
  if (diff < 86400) return fill(d.time.hoursAgo, { n: Math.round(diff / 3600) });
  return fill(d.time.daysAgo, { n: Math.round(diff / 86400) });
}

/**
 * Milliseconds as a latency label. Sub-millisecond replies exist on a LAN and
 * printing "0 ms" for them looks broken, so they get "<1 ms".
 */
export function latency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
