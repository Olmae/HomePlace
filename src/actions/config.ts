"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, getSetting, setSetting } from "@/lib/db";
import { requireRole } from "@/lib/auth";

/**
 * The dashboard as one file.
 *
 * What travels: dashboards, tiles, their layout and widget settings, plus the
 * handful of harmless preferences. What never travels: accounts, sessions,
 * uptime history, and every credential — an export is something people paste
 * into a forum post to show off a layout, and it must be safe to do that.
 */

const VERSION = 1;

const itemSchema = z.object({
  kind: z.string(),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  internalUrl: z.string().nullable().optional(),
  newTab: z.boolean().optional(),
  containerName: z.string().nullable().optional(),
  hostKey: z.string().nullable().optional(),
  checkKind: z.string().optional(),
  checkUrl: z.string().nullable().optional(),
  checkInterval: z.number().optional(),
  widget: z.string().nullable().optional(),
  config: z.string().nullable().optional(),
  order: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().optional(),
  h: z.number().optional(),
  /** Index into the same array; folders come before their children. */
  parent: z.number().nullable().optional(),
});

const exportSchema = z.object({
  version: z.number(),
  exportedAt: z.string().optional(),
  dashboards: z.array(
    z.object({
      name: z.string(),
      icon: z.string().nullable().optional(),
      order: z.number().optional(),
      shared: z.boolean().optional(),
      backgroundUrl: z.string().nullable().optional(),
      backgroundDim: z.number().optional(),
      backgroundBlur: z.number().optional(),
      items: z.array(itemSchema),
    })
  ),
  settings: z.record(z.unknown()).optional(),
});

export type ConfigExport = z.infer<typeof exportSchema>;

/** Settings safe to carry between installations — no addresses, no secrets. */
const PORTABLE_SETTINGS = ["containers.groups", "home.config"];

export async function exportConfig(): Promise<ConfigExport> {
  await requireRole("admin");

  const dashboards = await prisma.dashboard.findMany({
    orderBy: { order: "asc" },
    include: { items: { orderBy: { order: "asc" } } },
  });

  const settings: Record<string, unknown> = {};
  for (const key of PORTABLE_SETTINGS) settings[key] = await getSetting(key, null);

  return {
    version: VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    dashboards: dashboards.map((dash) => {
      // Parent links become array indexes: ids are meaningless in another
      // installation, and a folder has to keep its children.
      const index = new Map(dash.items.map((item, i) => [item.id, i]));
      return {
        name: dash.name,
        icon: dash.icon,
        order: dash.order,
        shared: dash.shared,
        backgroundUrl: dash.backgroundUrl,
        backgroundDim: dash.backgroundDim,
        backgroundBlur: dash.backgroundBlur,
        items: dash.items.map((item) => ({
          kind: item.kind,
          title: item.title,
          subtitle: item.subtitle,
          icon: item.icon,
          color: item.color,
          url: item.url,
          internalUrl: item.internalUrl,
          newTab: item.newTab,
          containerName: item.containerName,
          hostKey: item.hostKey,
          checkKind: item.checkKind,
          checkUrl: item.checkUrl,
          checkInterval: item.checkInterval,
          widget: item.widget,
          config: item.config,
          order: item.order,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
          parent: item.parentId !== null ? index.get(item.parentId) ?? null : null,
        })),
      };
    }),
  };
}

export type ImportResult = { ok: boolean; error?: string; dashboards?: number; items?: number };

/**
 * Import a file produced by exportConfig.
 *
 * "replace" wipes the existing dashboards first; "merge" adds the imported ones
 * alongside. Replace is the one people mean when restoring a backup, and it is
 * destructive enough that the interface asks before calling it.
 */
export async function importConfig(json: string, mode: "merge" | "replace"): Promise<ImportResult> {
  const user = await requireRole("admin");

  let parsed: ConfigExport;
  try {
    parsed = exportSchema.parse(JSON.parse(json));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : "not a valid configuration file" };
  }
  if (parsed.version > VERSION) {
    return { ok: false, error: `this file was written by a newer HomePlace (version ${parsed.version})` };
  }

  if (mode === "replace") await prisma.dashboard.deleteMany({});

  let dashboardCount = 0;
  let itemCount = 0;
  const base = await prisma.dashboard.count();

  for (const [i, dash] of parsed.dashboards.entries()) {
    const created = await prisma.dashboard.create({
      data: {
        name: dash.name,
        icon: dash.icon ?? null,
        order: base + i,
        shared: dash.shared ?? true,
        ownerId: user.id,
        backgroundUrl: dash.backgroundUrl ?? null,
        backgroundDim: dash.backgroundDim ?? 55,
        backgroundBlur: dash.backgroundBlur ?? 0,
      },
    });
    dashboardCount++;

    // Two passes: everything is created first, then parents are attached, so a
    // folder's children do not depend on insertion order.
    const ids: string[] = [];
    for (const item of dash.items) {
      const row = await prisma.item.create({
        data: {
          dashboardId: created.id,
          kind: item.kind,
          title: item.title,
          subtitle: item.subtitle ?? null,
          icon: item.icon ?? null,
          color: item.color ?? null,
          url: item.url ?? null,
          internalUrl: item.internalUrl ?? null,
          newTab: item.newTab ?? true,
          containerName: item.containerName ?? null,
          hostKey: item.hostKey ?? null,
          checkKind: item.checkKind ?? "none",
          checkUrl: item.checkUrl ?? null,
          checkInterval: item.checkInterval ?? 60,
          widget: item.widget ?? null,
          config: item.config ?? null,
          order: item.order ?? 0,
          x: item.x ?? 0,
          y: item.y ?? 0,
          w: item.w ?? 3,
          h: item.h ?? 1,
        },
      });
      ids.push(row.id);
      itemCount++;
    }

    for (const [j, item] of dash.items.entries()) {
      if (item.parent === null || item.parent === undefined) continue;
      const parentId = ids[item.parent];
      if (parentId && parentId !== ids[j]) {
        await prisma.item.update({ where: { id: ids[j] }, data: { parentId } });
      }
    }
  }

  for (const [key, value] of Object.entries(parsed.settings ?? {})) {
    if (PORTABLE_SETTINGS.includes(key) && value !== null) await setSetting(key, value);
  }

  await prisma.event.create({
    data: {
      type: "system",
      title: `configuration imported (${mode})`,
      detail: `${dashboardCount} dashboards, ${itemCount} tiles`,
      actor: user.name,
    },
  });

  revalidatePath("/");
  return { ok: true, dashboards: dashboardCount, items: itemCount };
}
