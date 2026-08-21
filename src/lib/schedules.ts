import "server-only";
import { prisma } from "./db";
import { controlContainer, listContainers } from "./docker";
import { haToggle } from "./services";
import { notify } from "./notify";

/**
 * Scheduled actions.
 *
 * Do a thing on a clock: restart a container every night, run a "leaving" scene
 * on a weekday morning, send a reminder every few hours. Evaluated on the same
 * monitor tick as everything else, so there is no second scheduler to run or
 * keep alive, and each occurrence fires exactly once even if the tick that was
 * meant to catch it was late.
 */

type Schedule = {
  id: string;
  name: string;
  enabled: boolean;
  kind: string;
  timeOfDay: string | null;
  weekday: number | null;
  intervalMinutes: number | null;
  action: string;
  hostKey: string | null;
  containerName: string | null;
  entityId: string | null;
  title: string | null;
  body: string | null;
  lastRunAt: Date | null;
};

export async function runDueSchedules(): Promise<void> {
  const schedules = (await prisma.schedule.findMany({ where: { enabled: true } })) as Schedule[];
  const now = new Date();

  for (const s of schedules) {
    if (!isDue(s, now)) continue;
    // Mark it run first: a slow action must not let the next tick fire it again.
    await prisma.schedule.update({ where: { id: s.id }, data: { lastRunAt: new Date() } });
    try {
      await runAction(s);
    } catch (e) {
      console.error(`schedule "${s.name}" failed:`, e);
    }
  }
}

/** Is this schedule's next occurrence in the past and not yet run? */
function isDue(s: Schedule, now: Date): boolean {
  if (s.kind === "interval") {
    if (!s.intervalMinutes || s.intervalMinutes <= 0) return false;
    return !s.lastRunAt || now.getTime() - s.lastRunAt.getTime() >= s.intervalMinutes * 60_000;
  }

  if (!s.timeOfDay) return false;
  if (s.kind === "weekly" && s.weekday != null && now.getDay() !== s.weekday) return false;

  const [h, m] = s.timeOfDay.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;

  const scheduled = new Date(now);
  scheduled.setHours(h, m, 0, 0);
  if (now < scheduled) return false; // the moment has not arrived today
  // Already fired for today's occurrence?
  return !s.lastRunAt || s.lastRunAt < scheduled;
}

async function runAction(s: Schedule): Promise<void> {
  let detail = s.name;
  let ok = true;

  if (s.action === "restart" && s.hostKey && s.containerName) {
    // The stored name is stable; the id is not, so resolve it at run time.
    const container = (await listContainers(s.hostKey)).find((c) => c.name === s.containerName);
    if (!container) {
      ok = false;
      detail = `${s.containerName}: not found`;
    } else {
      const r = await controlContainer(s.hostKey, container.id, "restart");
      ok = r.ok;
      detail = r.ok ? `${s.containerName}: restarted` : `${s.containerName}: ${r.error ?? "failed"}`;
    }
  } else if (s.action === "scene" && s.entityId) {
    const r = await haToggle(s.entityId);
    ok = r.ok;
    detail = r.ok ? s.entityId : `${s.entityId}: ${r.error ?? "failed"}`;
  } else if (s.action === "notify") {
    await notify({ title: s.title || s.name, body: s.body || "", type: "system", severity: "info" });
    detail = s.title || s.name;
  } else {
    ok = false;
    detail = "action not configured";
  }

  await prisma.event
    .create({
      data: {
        type: "system",
        severity: ok ? "info" : "error",
        title: s.name,
        detail,
        actor: "schedule",
      },
    })
    .catch(() => {});
}
