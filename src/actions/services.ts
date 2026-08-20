"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma, setSetting } from "@/lib/db";
import { HOME_CONFIG_KEY, normalizeHome, type HomeConfig } from "@/lib/homeConfig";
import { NOTIFY_POLICY_KEY, normalizePolicy, type NotifyPolicy } from "@/lib/notifyPolicy";
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
  haSetState,
  haHistory,
  type HaHistoryPoint,
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
/**
 * Discovery for the widget's entity picker.
 *
 * Returns the state as well as the name, so the list is recognisable: two lamps
 * called "Ceiling" are told apart by one being on.
 */
export async function discoverHaEntities(): Promise<{
  ok: boolean;
  error?: string;
  entities: { id: string; name: string; state: string; domain: string; toggleable: boolean }[];
}> {
  await requireRole("admin");
  const entities = await haStates();
  if (!entities) {
    return { ok: false, error: "Home Assistant is not configured, or did not answer", entities: [] };
  }
  return {
    ok: true,
    entities: entities.map((e) => ({
      id: e.id,
      name: e.name,
      state: e.state,
      domain: e.domain,
      toggleable: e.toggleable,
    })),
  };
}

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

/** One entity's recent history from Home Assistant, for the device panel. */
export async function entityHistory(entityId: string): Promise<HaHistoryPoint[]> {
  await requireRole("admin");
  return haHistory(entityId);
}

/** Turn a whole group of entities on or off in one call. */
export async function setGroupState(entityIds: string[], on: boolean, groupName?: string): Promise<ServiceResult> {
  const user = await requireRole("admin");
  const result = await haSetState(entityIds, on);
  // A group command is worth a line in the feed — "kitchen turned off" is
  // exactly what you look for when a light is not where you left it.
  await prisma.event.create({
    data: {
      type: "command",
      severity: "info",
      title: groupName ? `${groupName}: ${on ? "on" : "off"}` : on ? "on" : "off",
      detail: result.ok ? `${entityIds.length}` : result.error ?? null,
      actor: user.name,
    },
  });
  revalidatePath("/home");
  revalidatePath("/");
  return result;
}

/** Save the household notification policy — what reaches a phone, and what does not. */
export async function saveNotifyPolicy(policy: NotifyPolicy): Promise<void> {
  await requireRole("admin");
  await setSetting(NOTIFY_POLICY_KEY, normalizePolicy(policy));
  revalidatePath("/settings");
}

/**
 * Save the smart-home layer: hand-made groups, per-entity value formats and
 * name overrides. The client owns the whole shape and hands it back in one
 * call; it is normalised here so a malformed payload cannot poison the setting
 * the home page reads on every load.
 */
export async function saveHomeConfig(config: HomeConfig): Promise<void> {
  await requireRole("admin");
  await setSetting(HOME_CONFIG_KEY, normalizeHome(config));
  revalidatePath("/home");
  revalidatePath("/");
}
