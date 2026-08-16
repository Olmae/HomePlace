"use server";

import { revalidatePath } from "next/cache";
import { prisma, getSetting, setSetting } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { settings } from "@/lib/config";
import { readingOrder, nextFreeSlot, compactVertically, resolveCollisions } from "@/lib/layout";
import { uniqueSlug } from "@/lib/slug";

/**
 * Everything that changes the dashboard layout.
 *
 * All of it requires the admin role: a viewer can look at the panel but not
 * rearrange it, and certainly not point a tile somewhere new.
 */

export async function createDashboard(name: string): Promise<string> {
  const user = await requireRole("admin");
  const existing = await prisma.dashboard.findMany({ select: { slug: true } });
  const created = await prisma.dashboard.create({
    data: {
      name: name.trim() || "New",
      slug: uniqueSlug(name, existing.map((d) => d.slug ?? ""), "tab"),
      order: existing.length,
      ownerId: user.id,
      shared: true,
    },
  });
  revalidatePath("/");
  return created.id;
}

export async function renameDashboard(id: string, name: string): Promise<void> {
  await requireRole("admin");
  // The slug follows the name, so the URL keeps matching what the tab says.
  // Other dashboards' slugs are reserved, this one's own is not — renaming
  // "Home" to "Home" must not turn its slug into "home-2".
  const others = await prisma.dashboard.findMany({ where: { id: { not: id } }, select: { slug: true } });
  await prisma.dashboard.update({
    where: { id },
    data: {
      name: name.trim() || "New",
      slug: uniqueSlug(name, others.map((d) => d.slug ?? ""), id),
    },
  });
  revalidatePath("/");
}

export async function deleteDashboard(id: string): Promise<void> {
  await requireRole("admin");
  // Never delete the last one: the home page would have nothing to render and
  // no obvious way to create a replacement.
  if ((await prisma.dashboard.count()) <= 1) return;
  await prisma.dashboard.delete({ where: { id } });
  revalidatePath("/");
}

export type ItemInput = {
  dashboardId: string;
  parentId?: string | null;
  kind: "service" | "link" | "folder" | "widget";
  title: string;
  subtitle?: string | null;
  icon?: string | null;
  color?: string | null;
  url?: string | null;
  internalUrl?: string | null;
  newTab?: boolean;
  containerName?: string | null;
  hostKey?: string | null;
  checkKind?: string;
  checkUrl?: string | null;
  checkInterval?: number;
  widget?: string | null;
  config?: unknown;
  w?: number;
  h?: number;
};

export async function createItem(input: ItemInput): Promise<string> {
  await requireRole("admin");
  const siblings = await prisma.item.findMany({
    where: { dashboardId: input.dashboardId, parentId: input.parentId ?? null },
    select: { id: true, x: true, y: true, w: true, h: true },
  });
  // A new tile goes into the first gap that fits it, not on top of an existing
  // one and not always at the bottom.
  const width = clamp(input.w ?? defaultWidth(input.kind), 1, 12);
  const height = clamp(input.h ?? defaultHeight(input.kind), 1, 12);
  const slot = nextFreeSlot(siblings, width, height);
  const created = await prisma.item.create({
    data: {
      dashboardId: input.dashboardId,
      parentId: input.parentId ?? null,
      kind: input.kind,
      title: input.title.trim() || "Untitled",
      subtitle: input.subtitle || null,
      icon: input.icon || null,
      color: input.color || null,
      url: normalizeUrl(input.url),
      internalUrl: normalizeUrl(input.internalUrl),
      newTab: input.newTab ?? true,
      containerName: input.containerName || null,
      hostKey: input.hostKey || null,
      checkKind: input.checkKind ?? "none",
      checkUrl: normalizeUrl(input.checkUrl),
      checkInterval: clampInterval(input.checkInterval),
      widget: input.widget || null,
      config: input.config ? JSON.stringify(input.config) : null,
      order: siblings.length,
      x: slot.x,
      y: slot.y,
      w: width,
      h: height,
    },
  });
  revalidatePath("/");
  return created.id;
}

export async function updateItem(id: string, input: Partial<ItemInput>): Promise<void> {
  await requireRole("admin");
  await prisma.item.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() || "Untitled" } : {}),
      ...(input.subtitle !== undefined ? { subtitle: input.subtitle || null } : {}),
      ...(input.icon !== undefined ? { icon: input.icon || null } : {}),
      ...(input.color !== undefined ? { color: input.color || null } : {}),
      ...(input.url !== undefined ? { url: normalizeUrl(input.url) } : {}),
      ...(input.internalUrl !== undefined ? { internalUrl: normalizeUrl(input.internalUrl) } : {}),
      ...(input.newTab !== undefined ? { newTab: input.newTab } : {}),
      ...(input.checkKind !== undefined ? { checkKind: input.checkKind } : {}),
      ...(input.checkUrl !== undefined ? { checkUrl: normalizeUrl(input.checkUrl) } : {}),
      ...(input.checkInterval !== undefined ? { checkInterval: clampInterval(input.checkInterval) } : {}),
      ...(input.config !== undefined ? { config: input.config ? JSON.stringify(input.config) : null } : {}),
      ...(input.w !== undefined ? { w: clamp(input.w, 1, 12) } : {}),
      ...(input.h !== undefined ? { h: clamp(input.h, 1, 12) } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
    },
  });
  revalidatePath("/");
}

export async function deleteItem(id: string): Promise<void> {
  await requireRole("admin");
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) return;
  await prisma.item.delete({ where: { id } });

  // Close the hole the tile left behind. Gaps someone made on purpose survive
  // a drag; a gap left by a departure is just a hole.
  const rest = await prisma.item.findMany({
    where: { dashboardId: item.dashboardId, parentId: item.parentId },
    select: { id: true, x: true, y: true, w: true, h: true },
  });
  const compacted = compactVertically(rest);
  await prisma.$transaction(
    compacted.map((box) => prisma.item.update({ where: { id: box.id }, data: { y: box.y } }))
  );
  revalidatePath("/");
}

/**
 * Persist the whole board after a drag or a resize.
 *
 * One statement per tile inside a transaction: the layout is only ever
 * meaningful as a set, and a half-written board would put tiles on top of each
 * other until the next drag.
 */
export async function saveLayout(boxes: { id: string; x: number; y: number; w: number; h: number }[]): Promise<void> {
  await requireRole("admin");
  if (boxes.length === 0) return;

  await prisma.$transaction(
    // Reading order doubles as the phone layout, so it is recomputed here from
    // the positions rather than kept as a separate thing to drift out of sync.
    readingOrder(boxes.map((b) => ({ ...b }))).map((box, index) =>
      prisma.item.update({
        where: { id: box.id },
        data: {
          x: clamp(box.x, 0, 11),
          y: clamp(box.y, 0, 500),
          w: clamp(box.w, 1, 12),
          h: clamp(box.h, 1, 12),
          order: index,
        },
      })
    )
  );
  revalidatePath("/");
}

/** Background photo of one dashboard — the "home page" part of the panel. */
export async function updateDashboardBackground(
  id: string,
  input: { backgroundUrl?: string | null; backgroundDim?: number; backgroundBlur?: number }
): Promise<void> {
  await requireRole("admin");
  await prisma.dashboard.update({
    where: { id },
    data: {
      ...(input.backgroundUrl !== undefined ? { backgroundUrl: normalizeUrl(input.backgroundUrl) } : {}),
      ...(input.backgroundDim !== undefined ? { backgroundDim: clamp(input.backgroundDim, 0, 95) } : {}),
      ...(input.backgroundBlur !== undefined ? { backgroundBlur: clamp(input.backgroundBlur, 0, 40) } : {}),
    },
  });
  revalidatePath("/");
}

/** Containers the user chose not to see in the discovery list. */
export async function hideContainer(name: string, hidden: boolean): Promise<void> {
  await requireRole("admin");
  const list = await getSetting<string[]>("containers.hidden", []);
  const next = hidden ? Array.from(new Set([...list, name])) : list.filter((n) => n !== name);
  await setSetting("containers.hidden", next);
  revalidatePath("/containers");
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampInterval(seconds: number | undefined): number {
  return clamp(seconds ?? 60, settings.minCheckInterval(), 86400);
}

/** Widgets need room to say anything; links are fine as small tiles. */
function defaultWidth(kind: string): number {
  return kind === "widget" ? 4 : 3;
}

/** Heights in grid rows: a link is one row, a widget needs two to say anything. */
function defaultHeight(kind: string): number {
  return kind === "widget" ? 3 : 1;
}

/**
 * "192.168.0.10:8080" is what people actually type. Without a scheme the
 * browser treats it as a relative path and the tile silently goes nowhere.
 */
function normalizeUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  return `http://${trimmed}`;
}
