"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  createBackup as create,
  listBackups as list,
  deleteBackup as remove,
  restoreBackup as restore,
  type BackupInfo,
} from "@/lib/backup";

export async function makeBackup(): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("admin");
  const result = await create();
  await prisma.event
    .create({
      data: {
        type: "system",
        severity: result.ok ? "info" : "error",
        title: "Backup created",
        detail: result.name ?? result.error ?? null,
        actor: user.name,
      },
    })
    .catch(() => {});
  revalidatePath("/settings");
  return { ok: result.ok, error: result.error };
}

export async function getBackups(): Promise<BackupInfo[]> {
  await requireRole("admin");
  return list();
}

export async function removeBackup(name: string): Promise<boolean> {
  await requireRole("admin");
  const ok = await remove(name);
  revalidatePath("/settings");
  return ok;
}

export async function restoreFromBackup(name: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("admin");
  const result = await restore(name);
  await prisma.event
    .create({
      data: {
        type: "system",
        severity: result.ok ? "warn" : "error",
        title: "Backup restored",
        detail: result.ok ? `${name} — restart required` : result.error ?? null,
        actor: user.name,
      },
    })
    .catch(() => {});
  return result;
}
