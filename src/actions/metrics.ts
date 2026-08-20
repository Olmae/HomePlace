"use server";

import { requireRole } from "@/lib/auth";
import { metricNames, instanceNames, queryOne } from "@/lib/prometheus";
import { listContainers } from "@/lib/docker";

/**
 * What the widget dialog offers instead of a blank text field.
 *
 * Every one of these is a list the panel can obtain by asking: the metrics
 * Prometheus holds, the machines reporting to it, the containers running here.
 * Typing any of them by hand is an opportunity to mistype it.
 */

export async function listMetrics(prefix = ""): Promise<string[]> {
  await requireRole("admin");
  return metricNames(prefix);
}

export async function listInstances(): Promise<string[]> {
  await requireRole("admin");
  return instanceNames();
}

export async function listContainerNames(): Promise<string[]> {
  await requireRole("admin");
  const containers = await listContainers();
  return containers.map((c) => c.name).sort();
}

/** Run a query and show the number, so a choice can be checked before saving. */
export async function previewQuery(query: string): Promise<{ ok: boolean; value?: number; error?: string }> {
  await requireRole("admin");
  if (!query.trim()) return { ok: false, error: "empty query" };
  const value = await queryOne(query);
  return value === null ? { ok: false, error: "no data for this query" } : { ok: true, value };
}
