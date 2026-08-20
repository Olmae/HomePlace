"use server";

import { requireUser, requireRole } from "@/lib/auth";
import {
  haMediaPlayers,
  haMediaCommand,
  haMediaSet,
  haMediaSay,
  type HaMediaPlayer,
  type MediaCommand,
} from "@/lib/services";

/**
 * The remote control.
 *
 * Reading is open to anyone signed in — a speaker in the kitchen is not a
 * secret. Pressing a button needs the admin role, the same line the rest of the
 * panel draws between watching the house and operating it.
 *
 * Every command answers with the player's fresh state, so the widget never has
 * to guess whether a press landed: it replaces what it is showing with what the
 * speaker now says about itself.
 */

export type MediaResult = { ok: boolean; error?: string; players?: HaMediaPlayer[] };

export async function readMediaPlayers(ids?: string[]): Promise<MediaResult> {
  await requireUser();
  const players = await haMediaPlayers(ids);
  if (!players) return { ok: false, error: "home assistant did not answer" };
  return { ok: true, players };
}

export async function sendMediaCommand(entityId: string, command: MediaCommand): Promise<MediaResult> {
  await requireRole("admin");
  const result = await haMediaCommand(entityId, command);
  if (!result.ok) return result;
  return { ok: true, players: (await afterCommand(entityId)) ?? undefined };
}

export async function setMediaValue(
  entityId: string,
  what: "volume" | "seek" | "source",
  value: number | string
): Promise<MediaResult> {
  await requireRole("admin");
  const result = await haMediaSet(entityId, what, value);
  if (!result.ok) return result;
  return { ok: true, players: (await afterCommand(entityId)) ?? undefined };
}

/**
 * The widget's own button: whatever phrase the operator configured, sent to the
 * player. "Like" is the one everybody wants, and no two assistants spell it the
 * same way, so the panel does not pretend to know it.
 */
export async function sendMediaPhrase(entityId: string, service: string, phrase: string): Promise<MediaResult> {
  await requireRole("admin");
  const result = await haMediaSay(entityId, service, phrase);
  if (!result.ok) return result;
  return { ok: true, players: (await afterCommand(entityId)) ?? undefined };
}

/**
 * Home Assistant acknowledges a service call before the device has finished
 * obeying it: reading straight back would return the state from before the
 * press. A short wait costs nothing on a click and is the difference between a
 * pause button that looks broken and one that does not.
 *
 * No `revalidatePath` here on purpose — the widget polls and repaints itself,
 * and re-rendering the whole dashboard on every volume step would send a page
 * worth of RSC payload for a number.
 */
async function afterCommand(entityId: string): Promise<HaMediaPlayer[] | null> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return haMediaPlayers([entityId]);
}
