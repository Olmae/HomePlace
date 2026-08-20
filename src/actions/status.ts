"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma, setSetting } from "@/lib/db";
import { STATUS_PAGE_KEY, normalizeStatusPage, type StatusPageConfig } from "@/lib/statusPage";

/** The checkable items, for the public-status-page picker. */
export async function listCheckableItems(): Promise<{ id: string; title: string }[]> {
  await requireRole("admin");
  return prisma.item.findMany({
    where: { checkKind: { not: "none" } },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
}

/** Save which services the public status page shows, and whether it is on. */
export async function saveStatusPage(config: StatusPageConfig): Promise<void> {
  await requireRole("admin");
  await setSetting(STATUS_PAGE_KEY, normalizeStatusPage(config));
  revalidatePath("/settings");
  revalidatePath("/status");
}
