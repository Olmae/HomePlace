import "server-only";
import { prisma } from "./db";
import { listContainers } from "./docker";
import { getProfile, computeTargets } from "./nutrition";

/**
 * A one-message digest of the home — for a scheduled Telegram push.
 *
 * Deliberately short: the containers in a line, today's reminders in a line,
 * what has been eaten against the target in a line. It is a glance, not a
 * report — the kind of thing worth waking up to, not something to scroll.
 * Everything degrades: a section with nothing to say simply is not there.
 */

async function ownerId(): Promise<string | null> {
  const owner =
    (await prisma.user.findFirst({ where: { role: "owner" }, orderBy: { createdAt: "asc" }, select: { id: true } })) ??
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }));
  return owner?.id ?? null;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function dailySummary(): Promise<string> {
  const now = new Date();
  const lines: string[] = [`☀️ <b>Сводка</b> — ${now.toLocaleDateString("ru-RU", { day: "2-digit", month: "long" })}`];

  try {
    const cs = await listContainers();
    const running = cs.filter((c) => c.state === "running").length;
    const problems = cs.filter((c) => c.state === "restarting" || c.state === "dead" || c.health === "unhealthy");
    lines.push(`📦 Контейнеры: ${running}/${cs.length}${problems.length ? ` · ⚠ ${problems.slice(0, 5).map((p) => esc(p.name)).join(", ")}` : ""}`);
  } catch {
    /* Docker not reachable — skip the line rather than fail the digest. */
  }

  const oid = await ownerId();
  if (oid) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const reminders = await prisma.reminder.findMany({
      where: { userId: oid, done: false, at: { gte: start, lte: end } },
      orderBy: { at: "asc" },
      take: 8,
    });
    if (reminders.length > 0) {
      lines.push(
        "⏰ " +
          reminders.map((r) => `${esc(r.title)} (${r.at.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })})`).join("; ")
      );
    }

    const food = await prisma.foodLog.findMany({ where: { userId: oid, at: { gte: start } }, select: { kcal: true } });
    if (food.length > 0) {
      const kcal = Math.round(food.reduce((s, f) => s + f.kcal, 0));
      const profile = await getProfile(oid);
      const target = profile ? computeTargets(profile) : null;
      lines.push(`🍎 Съедено: ${kcal}${target ? ` / ${target.kcal}` : ""} ккал`);
    }
  }

  return lines.join("\n");
}
