import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";

/** Raw row shape. SQLite has no boolean or date type — Prisma stores them as
 *  integers, so both arrive as numbers and are converted below. */
type LatestRow = {
  itemId: string;
  ok: number | boolean;
  at: number | string | Date;
  latency: number | null;
  error: string | null;
};

/**
 * Tile status, gathered in a fixed number of queries.
 *
 * The obvious version — "latest check for each tile" in a loop — costs one
 * round-trip per tile, and a dashboard is exactly the page where that shows.
 * Both queries below are aggregate: three statements total, however many tiles
 * there are.
 */

export type TileStatus = {
  ok: boolean | null;
  at: Date | null;
  latency: number | null;
  error: string | null;
  /** Share of successful probes in the last 24 h, or null when never checked. */
  uptime24h: number | null;
};

export async function statusFor(itemIds: string[]): Promise<Map<string, TileStatus>> {
  const result = new Map<string, TileStatus>();
  if (itemIds.length === 0) return result;

  const since = new Date(Date.now() - 24 * 3600_000);

  // Latest probe per tile. A correlated subquery is the one place raw SQL earns
  // its keep here — the alternative is fetching every row and sorting in JS.
  const latest = await prisma.$queryRaw<LatestRow[]>(Prisma.sql`
    SELECT c.itemId, c.ok, c.at, c.latency, c.error
    FROM UptimeCheck c
    WHERE c.itemId IN (${Prisma.join(itemIds)})
      AND c.at = (SELECT MAX(c2.at) FROM UptimeCheck c2 WHERE c2.itemId = c.itemId)
  `);

  const [totals, oks] = await Promise.all([
    prisma.uptimeCheck.groupBy({
      by: ["itemId"],
      where: { itemId: { in: itemIds }, at: { gte: since } },
      _count: { _all: true },
    }),
    prisma.uptimeCheck.groupBy({
      by: ["itemId"],
      where: { itemId: { in: itemIds }, at: { gte: since }, ok: true },
      _count: { _all: true },
    }),
  ]);

  const totalBy = new Map(totals.map((r) => [r.itemId, r._count._all]));
  const okBy = new Map(oks.map((r) => [r.itemId, r._count._all]));

  for (const id of itemIds) {
    const total = totalBy.get(id) ?? 0;
    result.set(id, {
      ok: null,
      at: null,
      latency: null,
      error: null,
      uptime24h: total > 0 ? ((okBy.get(id) ?? 0) / total) * 100 : null,
    });
  }

  for (const row of latest) {
    const existing = result.get(row.itemId);
    if (!existing) continue;
    existing.ok = row.ok === 1 || row.ok === true;
    existing.at = row.at instanceof Date ? row.at : new Date(row.at);
    existing.latency = row.latency;
    existing.error = row.error;
  }

  return result;
}
