import "server-only";
import { ProxyAgent } from "undici";
import { socksDispatcher } from "fetch-socks";
import { telegramConfig, type TelegramSettings } from "./integrations";

/**
 * Telegram delivery.
 *
 * Two things make this less trivial than "POST to the Bot API". The first is
 * that plenty of home servers cannot reach Telegram directly and already run a
 * proxy for exactly that reason — so an optional proxy is a first-class option
 * here, not an afterthought. The second is quiet hours: a dashboard that wakes
 * you at 4am over a container that restarts itself gets muted within a week,
 * and a muted alerting system is worse than none.
 */

/**
 * Dispatcher for the proxy, if one is configured.
 *
 * socks5:// goes through fetch-socks, http(s):// through undici's own
 * ProxyAgent. Built per call rather than cached because the address can change
 * from the settings page at any time, and a stale agent would keep using the
 * old one until a restart.
 */
// The return type is deliberately loose: fetch-socks bundles its own copy of
// undici, and the two Dispatcher types are structurally identical but not
// interchangeable to TypeScript. Both are valid dispatchers at runtime.
function proxyDispatcher(proxyUrl: string): unknown {
  if (!proxyUrl) return undefined;
  try {
    const url = new URL(proxyUrl);
    if (url.protocol === "socks5:" || url.protocol === "socks:" || url.protocol === "socks5h:") {
      return socksDispatcher({
        type: 5,
        host: url.hostname,
        port: Number(url.port || 1080),
        userId: url.username || undefined,
        password: url.password || undefined,
      });
    }
    if (url.protocol === "http:" || url.protocol === "https:") {
      return new ProxyAgent(proxyUrl);
    }
    console.error(`unsupported telegram proxy scheme: ${url.protocol}`);
  } catch {
    console.error("TELEGRAM proxy URL is not a valid URL — ignoring it");
  }
  return undefined;
}

export type SendResult = { ok: boolean; error?: string };

/** Send a message with an explicit configuration — used by the "test" button. */
export async function sendWith(cfg: Pick<TelegramSettings, "botToken" | "chatId" | "proxyUrl">, text: string): Promise<SendResult> {
  if (!cfg.botToken || !cfg.chatId) return { ok: false, error: "bot token or chat id is missing" };

  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: cfg.chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      // @ts-expect-error — undici's dispatcher option is not in the DOM types.
      dispatcher: proxyDispatcher(cfg.proxyUrl ?? ""),
    });

    if (!res.ok) {
      // Telegram explains refusals in the body, and "chat not found" is by far
      // the most common one — worth surfacing verbatim.
      const body = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: describeNetworkError(e, !!cfg.proxyUrl) };
  }
}

/**
 * Turn "fetch failed" into something actionable.
 *
 * Node's fetch reports every transport problem as the same three words and
 * hides the real reason in `cause` — sometimes nested twice. On a home server
 * the answer is almost always "this network cannot reach Telegram", and the
 * fix is the proxy field, so say that instead of making someone read the
 * container log.
 */
function describeNetworkError(e: unknown, hasProxy: boolean): string {
  const parts: string[] = [];
  let current: unknown = e;
  for (let depth = 0; depth < 4 && current; depth++) {
    if (current instanceof Error) {
      const code = (current as NodeJS.ErrnoException).code;
      parts.push(code ? `${current.message} (${code})` : current.message);
      current = (current as { cause?: unknown }).cause;
    } else {
      parts.push(String(current));
      break;
    }
  }

  const detail = parts.join(" ← ");
  const looksBlocked = /fetch failed|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|UND_ERR/i.test(detail);

  if (looksBlocked && !hasProxy) {
    return `${detail} — the server cannot reach api.telegram.org. If your connection blocks it, set a SOCKS5 or HTTP proxy in the Proxy field.`;
  }
  if (/ECONNREFUSED/i.test(detail) && hasProxy) {
    // The common trap: a proxy running in another container that binds
    // 127.0.0.1 inside its own namespace. Publishing the port does not help —
    // Docker forwards the connection to the container's address, where nothing
    // is listening. Containers that share its network namespace reach it, and
    // everything else is refused, which looks like the proxy is down.
    return `${detail} — the address answered with "refused". If the proxy runs in another container, check that it listens on 0.0.0.0 and not on 127.0.0.1: a published port cannot reach a service bound to localhost inside its own container.`;
  }
  if (looksBlocked && hasProxy) {
    return `${detail} — the proxy did not connect. Check that the address is reachable from inside this container (a proxy on the host is not "localhost" here).`;
  }
  return detail;
}

/** Send using the saved configuration. No-op when Telegram is off. */
export async function send(text: string): Promise<SendResult> {
  const cfg = await telegramConfig();
  if (!cfg || !cfg.enabled) return { ok: false, error: "telegram is not enabled" };
  return sendWith(cfg, text);
}

/**
 * Is now inside the quiet window?
 *
 * Format is "23:00-08:00", and a window that wraps past midnight is the normal
 * case rather than an edge case — which is why the comparison flips when the
 * end is earlier than the start.
 */
export function inQuietHours(quietHours: string, now = new Date()): boolean {
  const match = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(quietHours.trim());
  if (!match) return false;
  const [, sh, sm, eh, em] = match;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = Number(sh) * 60 + Number(sm);
  const end = Number(eh) * 60 + Number(em);
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}
