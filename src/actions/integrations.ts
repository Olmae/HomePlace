"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { setSetting, getSetting } from "@/lib/db";
import { savePrometheus, saveProxmox, saveTelegram, telegramConfig } from "@/lib/integrations";
import { prometheusHealth } from "@/lib/prometheus";
import { proxmoxHealth } from "@/lib/proxmox";
import { sendWith } from "@/lib/telegram";
import { saveGoogleConfig, unlinkAccount } from "@/lib/google";

/**
 * Configuring the integrations from the settings page.
 *
 * Each save is followed by a real request to the thing being configured, and
 * the result is what the page reports. "Saved" on its own is close to useless
 * here — the interesting question is never whether the string was written down,
 * it is whether the address and token actually work.
 */

export type TestResult = { ok: boolean; error?: string };

export async function savePrometheusSettings(input: {
  url: string;
  username: string;
  password: string;
}): Promise<TestResult> {
  await requireRole("admin");
  await savePrometheus(input.url ? input : null);
  revalidatePath("/settings");
  revalidatePath("/monitoring");
  revalidatePath("/");
  if (!input.url) return { ok: true };
  return prometheusHealth();
}

export async function saveProxmoxSettings(input: {
  url: string;
  tokenId: string;
  tokenSecret: string;
  verifyTls: boolean;
}): Promise<TestResult> {
  await requireRole("admin");
  await saveProxmox(input.url ? input : null);
  revalidatePath("/settings");
  revalidatePath("/monitoring");
  revalidatePath("/");
  if (!input.url) return { ok: true };
  return proxmoxHealth();
}

export async function saveTelegramSettings(input: {
  enabled: boolean;
  botToken: string;
  chatId: string;
  delaySeconds: number;
  notifyRecovery: boolean;
  quietHours: string;
  proxyUrl: string;
}): Promise<TestResult> {
  await requireRole("admin");
  await saveTelegram(input);
  revalidatePath("/settings");
  return { ok: true };
}

/** Send a real message, so "it works" means it arrived. */
export async function testTelegram(): Promise<TestResult> {
  await requireRole("admin");
  const cfg = await telegramConfig();
  if (!cfg) return { ok: false, error: "telegram is not configured" };
  return sendWith(cfg, "🏡 <b>HomePlace</b> — test message. Notifications are working.");
}

/**
 * The online icon pack.
 *
 * Off by default because it is the only thing in HomePlace that fetches from
 * the public internet. On a panel with a route out it turns a row of emoji into
 * real logos; on one without, leaving it off costs nothing — the built-in
 * emoji and the services' own favicons keep working.
 */
export async function setIconPack(enabled: boolean): Promise<void> {
  await requireRole("admin");
  await setSetting("icons.pack", enabled);
  revalidatePath("/");
  revalidatePath("/containers");
  revalidatePath("/settings");
}

/**
 * Token for the now-playing endpoint.
 *
 * Generated here rather than typed by a person: it is a shared secret between
 * the panel and a script on some other machine, and a memorable one would be a
 * guessable one.
 */
export async function rotateNowPlayingToken(): Promise<string> {
  await requireRole("admin");
  const token = randomBytes(24).toString("base64url");
  await setSetting("nowplaying.token", token);
  revalidatePath("/settings");
  return token;
}

export async function currentNowPlayingToken(): Promise<string> {
  await requireRole("admin");
  return getSetting<string>("nowplaying.token", "");
}

export async function disableNowPlaying(): Promise<void> {
  await requireRole("admin");
  await setSetting("nowplaying.token", "");
  await setSetting("nowplaying.state", null);
  revalidatePath("/settings");
}

/**
 * Google client credentials.
 *
 * Registered by whoever runs the panel, in their own Google Cloud project —
 * an OAuth client cannot be shipped with an open-source application, because
 * the secret would be in the repository and Google would revoke it.
 */
export async function saveGoogleSettings(input: { clientId: string; clientSecret: string }): Promise<TestResult> {
  await requireRole("admin");
  await saveGoogleConfig(input.clientId, input.clientSecret);
  revalidatePath("/settings");
  return { ok: true };
}

/** Forget the linked calendar for the signed-in account. */
export async function unlinkGoogle(): Promise<void> {
  const user = await requireRole("admin");
  await unlinkAccount(user.id);
  revalidatePath("/settings");
  revalidatePath("/");
}
