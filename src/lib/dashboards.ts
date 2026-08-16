import "server-only";
import { prisma } from "./db";
import { uniqueSlug } from "./slug";
import { nextFreeSlot, overlaps, type Box } from "./layout";

/**
 * Repairs applied when a dashboard is loaded.
 *
 * Both of these fix data written by an older version of HomePlace, and both are
 * no-ops once they have run. Doing it on load rather than in a migration script
 * means an existing installation heals itself on the first page view instead of
 * requiring someone to remember a command.
 */

/** Give every dashboard a readable slug. */
export async function ensureSlugs(): Promise<void> {
  const missing = await prisma.dashboard.findMany({ where: { slug: null }, orderBy: { order: "asc" } });
  if (missing.length === 0) return;

  const taken = (await prisma.dashboard.findMany({ where: { slug: { not: null } }, select: { slug: true } }))
    .map((d) => d.slug!)
    .filter(Boolean);

  for (const dash of missing) {
    const slug = uniqueSlug(dash.name, taken, dash.id);
    taken.push(slug);
    await prisma.dashboard.update({ where: { id: dash.id }, data: { slug } });
  }
}

/**
 * Spread tiles that are all sitting on top of each other.
 *
 * Positions arrived with the draggable board; everything created before it has
 * x = 0, y = 0 and therefore renders as one stack of overlapping cards. The
 * first load after the upgrade lays them out in their existing reading order.
 *
 * Only runs when tiles actually overlap, so a board someone arranged
 * deliberately — including one where tiles were dragged on top of each other —
 * is never rearranged behind their back.
 */
export async function ensureLayout(dashboardId: string): Promise<void> {
  const items = await prisma.item.findMany({
    where: { dashboardId, parentId: null },
    orderBy: { order: "asc" },
    select: { id: true, x: true, y: true, w: true, h: true },
  });
  if (items.length < 2) return;

  const stacked = items.some((a, i) => items.slice(i + 1).some((b) => overlaps(a as Box, b as Box)));
  if (!stacked) return;

  const placed: Box[] = [];
  const updates = items.map((item) => {
    const slot = nextFreeSlot(placed, item.w, item.h);
    const box = { id: item.id, x: slot.x, y: slot.y, w: item.w, h: item.h };
    placed.push(box);
    return prisma.item.update({ where: { id: item.id }, data: { x: box.x, y: box.y } });
  });

  await prisma.$transaction(updates);
}
