import "server-only";
import { getSetting, setSetting } from "./db";
import { decrypt, encrypt } from "./secretBox";
import {
  prometheus as prometheusEnv,
  proxmox as proxmoxEnv,
  friendplace as friendplaceEnv,
  dockerHosts,
} from "./config";

/**
 * Where an integration's settings come from.
 *
 * Two sources, and .env always wins. Someone who pinned an address in the
 * deployment did so on purpose, and a panel that lets a browser session
 * silently override it would be both surprising and a way to point the server
 * at somewhere new. When .env has the value, the settings page shows it as
 * fixed rather than offering an edit box that would do nothing.
 */
export type Source = "env" | "ui" | "none";

export type PrometheusSettings = {
  url: string;
  username?: string;
  password?: string;
};

export type ProxmoxSettings = {
  url: string;
  tokenId: string;
  tokenSecret: string;
  verifyTls: boolean;
};

export type TelegramSettings = {
  enabled: boolean;
  botToken: string;
  chatId: string;
  /** Wait this long before reporting something down, in seconds. */
  delaySeconds: number;
  /** Also send a message when it comes back. */
  notifyRecovery: boolean;
  /** "23:00-08:00", empty = always allowed. Only silences non-critical notices. */
  quietHours: string;
  /**
   * Optional proxy for reaching Telegram, e.g. socks5://192.168.0.10:10808.
   * Home servers behind a filtered connection usually already run something
   * like this for other containers.
   */
  proxyUrl: string;
};

const KEY = {
  prometheus: "integration.prometheus",
  proxmox: "integration.proxmox",
  telegram: "integration.telegram",
};

// ─────────────────────────────── Prometheus ──────────────────────────────

export async function prometheusConfig(): Promise<(PrometheusSettings & { source: Source }) | null> {
  const env = prometheusEnv();
  if (env) return { url: env.url, username: env.username, password: env.password, source: "env" };

  const stored = await getSetting<PrometheusSettings | null>(KEY.prometheus, null);
  if (!stored?.url) return null;
  return {
    url: stored.url.replace(/\/+$/, ""),
    username: stored.username || undefined,
    password: stored.password ? await decrypt(stored.password) : undefined,
    source: "ui",
  };
}

export async function savePrometheus(input: PrometheusSettings | null): Promise<void> {
  if (!input?.url) {
    await setSetting(KEY.prometheus, null);
    return;
  }
  await setSetting(KEY.prometheus, {
    url: input.url.trim().replace(/\/+$/, ""),
    username: input.username?.trim() || "",
    password: input.password ? await encrypt(input.password) : "",
  });
}

// ───────────────────────────────── Proxmox ───────────────────────────────

export async function proxmoxConfig(): Promise<(ProxmoxSettings & { source: Source }) | null> {
  const env = proxmoxEnv();
  if (env) {
    return {
      url: env.url,
      tokenId: env.tokenId,
      tokenSecret: env.tokenSecret,
      verifyTls: env.verifyTls,
      source: "env",
    };
  }

  const stored = await getSetting<ProxmoxSettings | null>(KEY.proxmox, null);
  if (!stored?.url || !stored.tokenId) return null;
  return {
    url: stored.url.replace(/\/+$/, ""),
    tokenId: stored.tokenId,
    tokenSecret: await decrypt(stored.tokenSecret),
    verifyTls: !!stored.verifyTls,
    source: "ui",
  };
}

export async function saveProxmox(input: ProxmoxSettings | null): Promise<void> {
  if (!input?.url || !input.tokenId) {
    await setSetting(KEY.proxmox, null);
    return;
  }
  // An empty secret field means "keep the one already stored" — the form shows
  // a mask, not the value, so re-typing it on every edit would be absurd.
  const existing = await getSetting<ProxmoxSettings | null>(KEY.proxmox, null);
  await setSetting(KEY.proxmox, {
    url: input.url.trim().replace(/\/+$/, ""),
    tokenId: input.tokenId.trim(),
    tokenSecret: input.tokenSecret ? await encrypt(input.tokenSecret) : existing?.tokenSecret ?? "",
    verifyTls: input.verifyTls,
  });
}

// ──────────────────────────────── Telegram ───────────────────────────────

const TELEGRAM_DEFAULTS: TelegramSettings = {
  enabled: false,
  botToken: "",
  chatId: "",
  delaySeconds: 120,
  notifyRecovery: true,
  quietHours: "",
  proxyUrl: "",
};

export async function telegramConfig(): Promise<(TelegramSettings & { source: Source }) | null> {
  // Environment variables win here too, for deployments that keep every secret
  // out of the database on principle.
  const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const envChat = process.env.TELEGRAM_CHAT_ID?.trim();
  if (envToken && envChat) {
    return {
      ...TELEGRAM_DEFAULTS,
      enabled: true,
      botToken: envToken,
      chatId: envChat,
      proxyUrl: process.env.TELEGRAM_PROXY_URL?.trim() ?? "",
      source: "env",
    };
  }

  const stored = await getSetting<TelegramSettings | null>(KEY.telegram, null);
  if (!stored?.botToken || !stored.chatId) return null;
  return {
    ...TELEGRAM_DEFAULTS,
    ...stored,
    botToken: await decrypt(stored.botToken),
    source: "ui",
  };
}

export async function saveTelegram(input: Partial<TelegramSettings>): Promise<void> {
  const existing = await getSetting<TelegramSettings | null>(KEY.telegram, null);
  const botToken = input.botToken ? await encrypt(input.botToken) : existing?.botToken ?? "";
  await setSetting(KEY.telegram, {
    ...TELEGRAM_DEFAULTS,
    ...existing,
    ...input,
    botToken,
    chatId: (input.chatId ?? existing?.chatId ?? "").trim(),
    proxyUrl: (input.proxyUrl ?? existing?.proxyUrl ?? "").trim(),
    delaySeconds: Math.max(0, Number(input.delaySeconds ?? existing?.delaySeconds ?? 120)),
  });
}

/** One place to ask "what can this installation actually do right now?". */
export async function integrationStatus() {
  const [prom, pve, tg] = await Promise.all([prometheusConfig(), proxmoxConfig(), telegramConfig()]);
  return {
    docker: dockerHosts().length > 0,
    prometheus: prom !== null,
    proxmox: pve !== null,
    telegram: tg !== null && tg.enabled,
    friendplace: friendplaceEnv() !== null,
  };
}

/** Settings as the form should show them: secrets masked, never sent raw. */
export async function integrationsForDisplay() {
  const [prom, pve, tg] = await Promise.all([prometheusConfig(), proxmoxConfig(), telegramConfig()]);
  return {
    prometheus: prom
      ? { url: prom.url, username: prom.username ?? "", hasPassword: !!prom.password, source: prom.source }
      : { url: "", username: "", hasPassword: false, source: "none" as Source },
    proxmox: pve
      ? { url: pve.url, tokenId: pve.tokenId, hasSecret: !!pve.tokenSecret, verifyTls: pve.verifyTls, source: pve.source }
      : { url: "", tokenId: "", hasSecret: false, verifyTls: false, source: "none" as Source },
    telegram: tg
      ? {
          enabled: tg.enabled,
          chatId: tg.chatId,
          hasToken: !!tg.botToken,
          delaySeconds: tg.delaySeconds,
          notifyRecovery: tg.notifyRecovery,
          quietHours: tg.quietHours,
          proxyUrl: tg.proxyUrl,
          source: tg.source,
        }
      : {
          enabled: false,
          chatId: "",
          hasToken: false,
          delaySeconds: 120,
          notifyRecovery: true,
          quietHours: "",
          proxyUrl: "",
          source: "none" as Source,
        },
  };
}
