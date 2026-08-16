import "server-only";
import { prisma } from "./db";
import { queryOne } from "./prometheus";
import { prometheusConfig } from "./integrations";
import { telegramConfig } from "./integrations";
import { bytes, percent } from "./format";
import { notify } from "./notify";

/**
 * Conditions on metrics, not just on availability.
 *
 * "Is it answering" is what the prober covers, and it needs no configuration.
 * This covers the other half — the things that are wrong long before anything
 * stops answering: a disk filling up, a CPU pinned for ten minutes, memory
 * creeping towards the limit.
 *
 * The condition is PromQL against the configured Prometheus. Inventing a small
 * expression language on top would be a worse version of the one already in the
 * building, and it would not survive the first question it could not answer.
 */

export type RuleEvaluation = { id: string; name: string; value: number | null; firing: boolean; error?: string };

export async function evaluateRules(): Promise<RuleEvaluation[]> {
  // No Prometheus means no numbers to compare — leave the rules alone rather
  // than flapping every one of them into "unknown" and back.
  if (!(await prometheusConfig())) return [];

  const rules = await prisma.alertRule.findMany({ where: { enabled: true } });
  if (rules.length === 0) return [];

  const cfg = await telegramConfig();
  const now = new Date();
  const results: RuleEvaluation[] = [];

  for (const rule of rules) {
    let value: number | null = null;
    let error: string | undefined;

    try {
      value = await queryOne(rule.query);
      if (value === null) error = "the query returned nothing";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    // A query that cannot be evaluated is not a reason to claim the condition
    // is met — that would page someone because Prometheus restarted.
    const breached = value !== null && (rule.comparison === "lt" ? value < rule.threshold : value > rule.threshold);
    results.push({ id: rule.id, name: rule.name, value, firing: breached, error });

    if (!breached) {
      if (rule.firing) {
        const wasNotified = rule.notifiedAt !== null;
        await prisma.alertRule.update({
          where: { id: rule.id },
          data: { firing: false, since: null, notifiedAt: null, lastValue: value, lastError: error ?? null },
        });
        await prisma.event.create({
          data: { type: "up", severity: "info", title: rule.name, detail: describe(rule, value) },
        });
        if (wasNotified && (cfg?.notifyRecovery ?? true)) {
          await notify({
            title: `✅ ${rule.name}`,
            body: `back to normal — ${describe(rule, value)}`,
            severity: "info",
            tag: `rule-${rule.id}`,
          });
        }
      } else {
        await prisma.alertRule.update({
          where: { id: rule.id },
          data: { lastValue: value, lastError: error ?? null },
        });
      }
      continue;
    }

    const since = rule.firing && rule.since ? rule.since : now;
    const heldFor = (now.getTime() - since.getTime()) / 1000;

    await prisma.alertRule.update({
      where: { id: rule.id },
      data: { firing: true, since, lastValue: value, lastError: null },
    });

    // The condition has to hold for the configured time before anyone hears
    // about it, and then exactly once.
    if (rule.notifiedAt || heldFor < rule.forSeconds) continue;

    await prisma.alertRule.update({ where: { id: rule.id }, data: { notifiedAt: now } });
    await prisma.event.create({
      data: {
        type: "system",
        severity: rule.severity === "error" ? "error" : rule.severity === "info" ? "info" : "warn",
        title: rule.name,
        detail: describe(rule, value),
      },
    });

    const mark = rule.severity === "error" ? "🔴" : rule.severity === "info" ? "ℹ️" : "🟠";
    await notify({
      title: `${mark} ${rule.name}`,
      body: describe(rule, value),
      severity: rule.severity === "error" ? "error" : rule.severity === "info" ? "info" : "warn",
      tag: `rule-${rule.id}`,
    });
  }

  return results;
}

/** "disk 92% (over 90%)" — the number, and what it was compared against. */
function describe(rule: { comparison: string; threshold: number; unit: string }, value: number | null): string {
  const format = (v: number) => (rule.unit === "percent" ? percent(v, 1) : rule.unit === "bytes" ? bytes(v) : v.toFixed(2));
  const word = rule.comparison === "lt" ? "below" : "above";
  return `${value === null ? "—" : format(value)} (${word} ${format(rule.threshold)})`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Ready-made rules, offered when the list is empty. */
export const RULE_TEMPLATES = [
  {
    name: "Disk almost full",
    query: '100 - (min(node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"}) / min(node_filesystem_size_bytes{fstype!~"tmpfs|overlay"}) * 100)',
    comparison: "gt",
    threshold: 90,
    forSeconds: 600,
    unit: "percent",
    severity: "error",
  },
  {
    name: "CPU pinned",
    query: '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
    comparison: "gt",
    threshold: 90,
    forSeconds: 600,
    unit: "percent",
    severity: "warn",
  },
  {
    name: "Memory almost gone",
    query: "100 * (1 - min(node_memory_MemAvailable_bytes) / min(node_memory_MemTotal_bytes))",
    comparison: "gt",
    threshold: 90,
    forSeconds: 300,
    unit: "percent",
    severity: "warn",
  },
  {
    name: "Disk too hot",
    query: "max(node_hwmon_temp_celsius)",
    comparison: "gt",
    threshold: 60,
    forSeconds: 600,
    unit: "number",
    severity: "warn",
  },
] as const;
