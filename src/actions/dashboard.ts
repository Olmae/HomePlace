"use server";

import { revalidatePath } from "next/cache";
import { prisma, getSetting, setSetting } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { settings } from "@/lib/config";

/**
 * Everything that changes the dashboard layout.
 *
 * All of it requires the admin role: a viewer can look at the panel but not
 * rearrange it, and certainly not point a tile somewhere new.
 */

export async function createDashboard(name: string): Promise<string> {
  const user = await requireRole("admin");
  const count = await prisma.dashboard.count();
  const created = await prisma.dashboard.create({
    data: { name: name.trim() || "New", order: count, ownerId: user.id, shared: true },
  });
  revalidatePath("/");
  return created.id;
}

export async function renameDashboard(id: string, name: string): Promise<void> {
  await requireRole("admin");
  await prisma.dashboard.update({ where: { id }, data: { name: name.trim() || "New" } });
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
  const siblings = await prisma.item.count({
    where: { dashboardId: input.dashboardId, parentId: input.parentId ?? null },
  });
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
      order: siblings,
      w: clamp(input.w ?? defaultWidth(input.kind), 1, 12),
      h: clamp(input.h ?? 1, 1, 4),
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
      ...(input.h !== undefined ? { h: clamp(input.h, 1, 4) } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
    },
  });
  revalidatePath("/");
}

export async function deleteItem(id: string): Promise<void> {
  await requireRole("admin");
  await prisma.item.delete({ where: { id } });
  revalidatePath("/");
}

/**
 * Reordering by swapping with the neighbour.
 *
 * Deliberately not drag-and-drop-with-fractional-indexes: two buttons work on a
 * phone, work from the keyboard, and cannot leave the list in a half-sorted
 * state if the request fails halfway.
 */
export async function moveItem(id: string, direction: "up" | "down"): Promise<void> {
  await requireRole("admin");
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) return;

  const neighbour = await prisma.item.findFirst({
    where: {
      dashboardId: item.dashboardId,
      parentId: item.parentId,
      order: direction === "up" ? { lt: item.order } : { gt: item.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbour) return;

  await prisma.$transaction([
    prisma.item.update({ where: { id: item.id }, data: { order: neighbour.order } }),
    prisma.item.update({ where: { id: neighbour.id }, data: { order: item.order } }),
  ]);
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
