"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type ScheduleInput = {
  id?: string;
  name: string;
  enabled: boolean;
  kind: string; // daily | weekly | interval
  timeOfDay?: string;
  weekday?: number | null;
  intervalMinutes?: number | null;
  action: string; // restart | scene | notify
  hostKey?: string | null;
  containerName?: string | null;
  entityId?: string | null;
  title?: string | null;
  body?: string | null;
};

export async function saveSchedule(input: ScheduleInput): Promise<void> {
  await requireRole("admin");
  const data = {
    name: input.name.trim() || "Schedule",
    enabled: input.enabled,
    kind: input.kind,
    timeOfDay: input.kind === "interval" ? null : input.timeOfDay || null,
    weekday: input.kind === "weekly" ? input.weekday ?? null : null,
    intervalMinutes: input.kind === "interval" ? Number(input.intervalMinutes) || null : null,
    action: input.action,
    hostKey: input.action === "restart" ? input.hostKey || null : null,
    containerName: input.action === "restart" ? input.containerName || null : null,
    entityId: input.action === "scene" ? input.entityId || null : null,
    title: input.action === "notify" ? input.title || null : null,
    body: input.action === "notify" ? input.body || null : null,
  };
  if (input.id) await prisma.schedule.update({ where: { id: input.id }, data });
  else await prisma.schedule.create({ data });
  revalidatePath("/settings");
}

export async function toggleSchedule(id: string, enabled: boolean): Promise<void> {
  await requireRole("admin");
  await prisma.schedule.update({ where: { id }, data: { enabled } });
  revalidatePath("/settings");
}

export async function deleteSchedule(id: string): Promise<void> {
  await requireRole("admin");
  await prisma.schedule.delete({ where: { id } });
  revalidatePath("/settings");
}
