"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createItem } from "./dashboard";

/**
 * Import monitors from an Uptime Kuma backup.
 *
 * Kuma's "Export Backup" is a JSON file with a `monitorList`. Each monitor
 * becomes a link tile on the first dashboard: HTTP monitors keep their address
 * and an availability check, everything else (a TCP port, a ping) becomes a
 * plain link to a best-effort address, since HomePlace only checks HTTP. Names
 * are what carry over — the point is to not retype forty of them by hand.
 */
type KumaMonitor = {
  name?: string;
  type?: string;
  url?: string;
  hostname?: string;
  port?: number;
};

export async function importUptimeKuma(text: string): Promise<{ ok: boolean; created?: number; error?: string }> {
  await requireRole("admin");

  let monitors: KumaMonitor[];
  try {
    const parsed = JSON.parse(text) as { monitorList?: unknown };
    const list = parsed.monitorList;
    monitors = Array.isArray(list) ? (list as KumaMonitor[]) : list && typeof list === "object" ? (Object.values(list) as KumaMonitor[]) : [];
  } catch {
    return { ok: false, error: "not valid JSON" };
  }
  if (monitors.length === 0) return { ok: false, error: "no monitorList in the file" };

  const dashboard = await prisma.dashboard.findFirst({ orderBy: { order: "asc" }, select: { id: true } });
  if (!dashboard) return { ok: false, error: "no dashboard to import into" };

  let created = 0;
  for (const m of monitors.slice(0, 200)) {
    const name = (m.name ?? "").trim();
    if (!name) continue;

    const isHttp = m.type === "http" || m.type === "keyword" || (!!m.url && /^https?:\/\//i.test(m.url));
    const url =
      m.url && /^https?:\/\//i.test(m.url)
        ? m.url
        : m.hostname
          ? `http://${m.hostname}${m.port ? `:${m.port}` : ""}`
          : null;

    try {
      await createItem({
        dashboardId: dashboard.id,
        kind: "link",
        title: name,
        url,
        checkKind: isHttp && url ? "http" : "none",
        checkUrl: isHttp && url ? url : null,
      });
      created++;
    } catch {
      // One bad monitor should not abort the whole import.
    }
  }

  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true, created };
}
