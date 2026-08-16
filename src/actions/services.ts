"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  saveJellyfin,
  saveQbit,
  saveArr,
  savePbs,
  saveHa,
  jellyfinState,
  qbitState,
  arrState,
  pbsState,
  haStates,
  haToggle,
  type JellyfinSettings,
  type QbitSettings,
  type ArrInstance,
  type PbsSettings,
  type HaSettings,
} from "@/lib/services";

/**
 * Configuring the household's services, and the one action that changes
 * something outside HomePlace: flipping a Home Assistant switch.
 *
 * Every save is followed by a real read, so "saved" means "and it answered".
 */

export type ServiceResult = { ok: boolean; error?: string };

export async function saveJellyfinSettings(input: JellyfinSettings): Promise<ServiceResult> {
  await requireRole("admin");
  await saveJellyfin(input.url ? input : null);
  revalidatePath("/settings");
  revalidatePath("/");
  if (!input.url) return { ok: true };
  return (await jellyfinState()) ? { ok: true } : { ok: false, error: "no answer — check the address and the API key" };
}

export async function saveQbitSettings(input: QbitSettings): Promise<ServiceResult> {
  await requireRole("admin");
  await saveQbit(input.url ? input : null);
  revalidatePath("/settings");
  revalidatePath("/");
  if (!input.url) return { ok: true };
  return (await qbitState()) ? { ok: true } : { ok: false, error: "no answer — check the address, user and password" };
}

export async function saveArrSettings(instances: ArrInstance[]): Promise<ServiceResult> {
  await requireRole("admin");
  await saveArr(instances);
  revalidatePath("/settings");
  revalidatePath("/");
  const state = await arrState();
  return state.length === instances.filter((i) => i.url).length
    ? { ok: true }
    : { ok: false, error: "one of them did not answer — check its address and API key" };
}

export async function savePbsSettings(input: PbsSettings): Promise<ServiceResult> {
  await requireRole("admin");
  await savePbs(input.url ? input : null);
  revalidatePath("/settings");
  revalidatePath("/");
  if (!input.url) return { ok: true };
  return (await pbsState()) ? { ok: true } : { ok: false, error: "no answer — check the address and the token" };
}

export async function saveHaSettings(input: HaSettings): Promise<ServiceResult> {
  await requireRole("admin");
  await saveHa(input.url ? input : null);
  revalidatePath("/settings");
  revalidatePath("/");
  if (!input.url) return { ok: true };
  return (await haStates()) ? { ok: true } : { ok: false, error: "no answer — check the address and the token" };
}

/** Entities to choose from when configuring the widget. */
export async function listHaEntities(): Promise<{ id: string; name: string; domain: string }[]> {
  await requireRole("admin");
  const entities = await haStates();
  return (entities ?? []).map((e) => ({ id: e.id, name: e.name, domain: e.domain }));
}

/**
 * Flip a switch. Requires the admin role — a viewer may watch the house, not
 * operate it.
 */
export async function toggleEntity(entityId: string): Promise<ServiceResult> {
  await requireRole("admin");
  const result = await haToggle(entityId);
  revalidatePath("/");
  return result;
}
