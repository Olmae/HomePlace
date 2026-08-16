"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { queryOne } from "@/lib/prometheus";
import { RULE_TEMPLATES } from "@/lib/rules";

/** Creating, changing and trying out metric rules. */

export type RuleInput = {
  name: string;
  query: string;
  comparison: string;
  threshold: number;
  forSeconds: number;
  severity: string;
  unit: string;
  enabled: boolean;
};

export async function listRules() {
  await requireRole("admin");
  return prisma.alertRule.findMany({ orderBy: { createdAt: "asc" } });
}

export async function saveRule(id: string | null, input: RuleInput): Promise<void> {
  await requireRole("admin");
  const data = {
    name: input.name.trim() || "Rule",
    query: input.query.trim(),
    comparison: input.comparison === "lt" ? "lt" : "gt",
    threshold: Number(input.threshold) || 0,
    forSeconds: Math.max(0, Math.round(Number(input.forSeconds) || 0)),
    severity: ["info", "warn", "error"].includes(input.severity) ? input.severity : "warn",
    unit: ["percent", "bytes", "number"].includes(input.unit) ? input.unit : "number",
    enabled: input.enabled,
  };

  if (id) {
    // Editing a rule resets its state: the new condition has not been true for
    // ten minutes, whatever the old one was doing.
    await prisma.alertRule.update({
      where: { id },
      data: { ...data, firing: false, since: null, notifiedAt: null },
    });
  } else {
    await prisma.alertRule.create({ data });
  }
  revalidatePath("/settings");
}

export async function deleteRule(id: string): Promise<void> {
  await requireRole("admin");
  await prisma.alertRule.delete({ where: { id } });
  revalidatePath("/settings");
}

export async function toggleRule(id: string): Promise<void> {
  await requireRole("admin");
  const rule = await prisma.alertRule.findUnique({ where: { id }, select: { enabled: true } });
  if (!rule) return;
  await prisma.alertRule.update({
    where: { id },
    data: { enabled: !rule.enabled, firing: false, since: null, notifiedAt: null },
  });
  revalidatePath("/settings");
}

/**
 * Run the query now and show what comes back.
 *
 * Writing PromQL without seeing the result is guesswork, and a rule that
 * silently never fires because of a typo is worse than no rule at all.
 */
export async function testRuleQuery(query: string): Promise<{ ok: boolean; value?: number; error?: string }> {
  await requireRole("admin");
  if (!query.trim()) return { ok: false, error: "empty query" };
  try {
    const value = await queryOne(query);
    if (value === null) return { ok: false, error: "the query returned nothing" };
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Add the ready-made set, for a panel that has no rules yet. */
export async function addRuleTemplates(): Promise<void> {
  await requireRole("admin");
  for (const template of RULE_TEMPLATES) {
    const exists = await prisma.alertRule.findFirst({ where: { name: template.name } });
    if (exists) continue;
    await prisma.alertRule.create({ data: { ...template, enabled: true } });
  }
  revalidatePath("/settings");
}
