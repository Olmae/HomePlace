import "server-only";
import { prisma, getSetting, setSetting } from "./db";
import { telegramConfig } from "./integrations";
import { tgApi, tgSend } from "./telegram";
import { listContainers, controlContainer } from "./docker";
import { addShopping, getShopping } from "./shopping";
import { haToggle } from "./services";
import { sendWol } from "./wol";

/**
 * The Telegram command bot.
 *
 * Outbound already works; this is the way back in. Rather than a webhook — which
 * a home server behind NAT cannot receive — it long-polls getUpdates on the
 * monitor tick, so the only traffic is outbound, the same as the rest of the
 * panel. It answers only the one chat the integration is configured for, and
 * everything it creates belongs to the owner account.
 *
 * What it does today: add reminders in plain language, list them, and answer a
 * status question. The parser is forgiving — "Buy bread tomorrow 18:00" and
 * "Купить хлеб | завтра 18:00" both work — and anything it cannot read gets a
 * one-line example back rather than silence.
 */

const OFFSET_KEY = "telegram.offset";
const state = new Map<string, "reminder" | "shopping">(); // chatId → what the next message is

const MENU = [["➕ Напоминание", "🛒 В список"], ["📋 Напоминания", "📊 Статус"]];

export async function pollTelegram(): Promise<void> {
  const cfg = await telegramConfig();
  if (!cfg?.enabled) return;
  if (!(await getSetting<boolean>("telegram.commands", false))) return;

  const offset = (await getSetting<number>(OFFSET_KEY, 0)) || 0;
  const updates = await tgApi<TgUpdate[]>("getUpdates", { offset: offset + 1, timeout: 0, allowed_updates: ["message"] });
  if (!updates || updates.length === 0) return;

  await setSetting(OFFSET_KEY, updates[updates.length - 1].update_id);

  for (const u of updates) {
    const msg = u.message;
    if (!msg?.text || !msg.chat) continue;
    // Only the configured chat is trusted — anyone else is a stranger with the
    // bot's username, and this is a control surface.
    if (String(msg.chat.id) !== String(cfg.chatId)) continue;
    try {
      await handle(String(msg.chat.id), msg.text.trim());
    } catch (e) {
      console.error("telegram command failed:", e);
    }
  }
}

async function handle(chatId: string, text: string): Promise<void> {
  const lower = text.toLowerCase();

  // "Done" leaves whatever mode we are in.
  if (/^\/(done)|^готово$|^меню$|^menu$/.test(lower)) {
    state.delete(chatId);
    await tgSend(chatId, "Готово.", MENU);
    return;
  }

  // Shopping mode: every line becomes an item until "готово".
  if (state.get(chatId) === "shopping" && !/^\//.test(lower) && !/список|статус/.test(lower)) {
    await addShopping(text);
    await tgSend(chatId, `🛒 Добавлено: <b>${escape(text)}</b>. Ещё? Или «Готово».`);
    return;
  }

  if (/^\/(shop|buy)|список покупок|^🛒|в список/.test(lower)) {
    state.set(chatId, "shopping");
    const items = await getShopping();
    const open = items.filter((i) => !i.done);
    const list = open.length > 0 ? "\n\n" + open.map((i) => `• ${escape(i.text)}`).join("\n") : "";
    await tgSend(chatId, `Пишите товары — по одному в сообщении. «Готово» — закончить.${list}`);
    return;
  }

  if (/^\/(start|help)|^меню$|^menu$/.test(lower)) {
    state.delete(chatId);
    await tgSend(
      chatId,
      "Напишите напоминание (например «Купить хлеб завтра 18:00») или выберите ниже.\n\n" +
        "Команды:\n/restart &lt;имя&gt; — перезапустить контейнер\n/scene &lt;entity&gt; — запустить сцену\n/wake &lt;MAC&gt; — разбудить ПК",
      MENU
    );
    return;
  }
  if (/^\/status|статус/.test(lower)) {
    state.delete(chatId);
    await tgSend(chatId, await statusText(), MENU);
    return;
  }

  // Control commands: /restart <name>, /scene <entity>, /wake <mac>.
  const restart = /^\/restart\s+(.+)$/i.exec(text);
  if (restart) {
    state.delete(chatId);
    await tgSend(chatId, await restartContainer(restart[1].trim()));
    return;
  }
  const scene = /^\/scene\s+(\S+)/i.exec(text);
  if (scene) {
    state.delete(chatId);
    const r = await haToggle(scene[1]);
    await tgSend(chatId, r.ok ? `▶️ Запущено: <b>${escape(scene[1])}</b>` : `⚠ ${escape(r.error ?? "ошибка")}`);
    return;
  }
  const wake = /^\/wake\s+([0-9a-f:\-]+)/i.exec(text);
  if (wake) {
    state.delete(chatId);
    const r = await sendWol(wake[1]);
    await tgSend(chatId, r.ok ? `⏻ Magic-пакет отправлен на ${escape(wake[1])}` : `⚠ ${escape(r.error ?? "ошибка")}`);
    return;
  }
  if (/^\/list|^📋/.test(lower)) {
    state.delete(chatId);
    await tgSend(chatId, await remindersText(), MENU);
    return;
  }
  if (/^\/remind|^➕/.test(lower)) {
    state.set(chatId, "reminder");
    await tgSend(chatId, "Напишите напоминание и время. Например: «Позвонить маме завтра 19:30» или «Оплатить интернет | 25.12 10:00».");
    return;
  }

  // Free text: treat as a reminder, whether or not it was asked for.
  const parsed = parseReminder(text);
  if (!parsed) {
    await tgSend(chatId, "Не понял время. Пример: «Купить хлеб завтра 18:00» или «Текст | 25.12 10:00».", MENU);
    return;
  }
  state.delete(chatId);
  await createReminder(parsed);
  const when = parsed.at.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const rep = parsed.repeat !== "none" ? ` (${parsed.repeat})` : "";
  await tgSend(chatId, `✅ Добавлено: <b>${escape(parsed.title)}</b> — ${when}${rep}`, MENU);
}

async function createReminder(r: { title: string; at: Date; repeat: string }): Promise<void> {
  const owner =
    (await prisma.user.findFirst({ where: { role: "owner" }, orderBy: { createdAt: "asc" }, select: { id: true } })) ??
    (await prisma.user.findFirst({ where: { role: "admin" }, orderBy: { createdAt: "asc" }, select: { id: true } })) ??
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }));
  if (!owner) return;
  await prisma.reminder.create({ data: { userId: owner.id, title: r.title, at: r.at, repeat: r.repeat } });
}

async function remindersText(): Promise<string> {
  const rows = await prisma.reminder.findMany({ where: { done: false }, orderBy: { at: "asc" }, take: 10 });
  if (rows.length === 0) return "Напоминаний нет.";
  return rows
    .map((r) => `• ${escape(r.title)} — ${r.at.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`)
    .join("\n");
}

async function restartContainer(name: string): Promise<string> {
  const c = (await listContainers()).find((x) => x.name === name);
  if (!c) return `⚠ Контейнер «${escape(name)}» не найден`;
  const r = await controlContainer(c.hostKey, c.id, "restart");
  return r.ok ? `🔁 Перезапущен: <b>${escape(name)}</b>` : `⚠ ${escape(r.error ?? "ошибка")}`;
}

async function statusText(): Promise<string> {
  try {
    const containers = await listContainers();
    const running = containers.filter((c) => c.state === "running").length;
    const problems = containers.filter((c) => c.state === "restarting" || c.state === "dead" || c.health === "unhealthy");
    let out = `📦 Контейнеры: ${running}/${containers.length} работают`;
    if (problems.length > 0) out += `\n⚠ Проблемы: ${problems.slice(0, 8).map((p) => escape(p.name)).join(", ")}`;
    return out;
  } catch {
    return "Статус недоступен.";
  }
}

// ───────────────────────────── Time parsing ──────────────────────────────

/** Pull a title, a moment and a repeat out of a plain-language line. */
export function parseReminder(input: string): { title: string; at: Date; repeat: string } | null {
  let text = input.trim();
  if (text.includes("|")) {
    // Explicit form: "text | when" — parse the two halves separately.
    const [t, w] = text.split("|");
    const when = parseWhen(w);
    const title = t.trim();
    return when && title ? { title, at: when.at, repeat: when.repeat } : null;
  }

  const now = new Date();
  const d = new Date(now);
  d.setSeconds(0, 0);
  let repeat = "none";
  let found = false;
  let timeSet = false;

  const strip = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = text.match(re);
    if (!m) return;
    fn(m);
    text = text.replace(re, " ");
    found = true;
  };

  strip(/\b(каждый день|ежедневно|daily)\b/i, () => (repeat = "daily"));
  strip(/\b(каждую неделю|еженедельно|weekly)\b/i, () => (repeat = "weekly"));
  strip(/\b(каждый месяц|ежемесячно|monthly)\b/i, () => (repeat = "monthly"));

  strip(/\b(через|in)\s+(\d+)\s*(мин\w*|м|min\w*|час\w*|ч|h|hours?|дн\w*|день|дня|дней|d|days?)\b/i, (m) => {
    const n = Number(m[2]);
    const u = m[3].toLowerCase();
    const ms = /^(мин|м|min)/.test(u) ? 60_000 : /^(час|ч|h)/.test(u) ? 3_600_000 : 86_400_000;
    d.setTime(now.getTime() + n * ms);
    d.setSeconds(0, 0);
    timeSet = true;
  });

  strip(/\b(послезавтра|день после завтра)\b/i, () => d.setDate(now.getDate() + 2));
  strip(/\b(завтра|tomorrow)\b/i, () => d.setDate(now.getDate() + 1));
  strip(/\b(сегодня|today)\b/i, () => {});

  strip(/\b(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?\b/, (m) => {
    d.setMonth(Number(m[2]) - 1, Number(m[1]));
    if (m[3]) d.setFullYear(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]));
  });

  strip(/\b(\d{1,2}):(\d{2})\b/, (m) => {
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    timeSet = true;
  });
  if (!timeSet) {
    strip(/\bв\s+(\d{1,2})(?:\s*(час\w*|ч))?\b/i, (m) => {
      d.setHours(Number(m[1]), 0, 0, 0);
      timeSet = true;
    });
  }

  if (!found) return null;
  if (!timeSet) d.setHours(9, 0, 0, 0); // a date with no time means the morning
  if (d < now) d.setDate(d.getDate() + 1); // a time already past today is tomorrow's

  const title = text.replace(/\s+/g, " ").replace(/^[\s|·,-]+|[\s|·,-]+$/g, "").trim();
  return title ? { title, at: d, repeat } : null;
}

function parseWhen(str: string): { at: Date; repeat: string } | null {
  const parsed = parseReminder(`placeholder ${str}`);
  return parsed ? { at: parsed.at, repeat: parsed.repeat } : null;
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type TgUpdate = { update_id: number; message?: { text?: string; chat?: { id: number } } };
