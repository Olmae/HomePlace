import "server-only";
import { prisma, getSetting, setSetting } from "./db";
import { telegramConfig } from "./integrations";
import { tgApi, tgSend } from "./telegram";
import { listContainers, controlContainer } from "./docker";
import { addShopping, getShopping } from "./shopping";
import { haToggle } from "./services";
import { sendWol } from "./wol";
import { extractRepeat, repeatLabel } from "./recurrence";
import { fatSecretSearch, fatSecretBarcode } from "./fatsecret";
import { dict } from "@/i18n";

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
const state = new Map<string, "reminder" | "shopping" | "food">(); // chatId → what the next message is

const MENU = [
  ["➕ Напоминание", "🛒 В список"],
  ["🍎 Еда", "📋 Напоминания"],
  ["📊 Статус"],
];

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

  // Food mode: every line is a food to look up and log until "готово".
  if (state.get(chatId) === "food" && !/^\//.test(lower) && !/список|статус|напомин/.test(lower)) {
    await handleFood(chatId, text);
    return;
  }

  if (/^\/(food|eat)|^🍎|^еда$|дневник еды/.test(lower)) {
    state.set(chatId, "food");
    await tgSend(
      chatId,
      "Что съели? Напишите продукт, можно с граммами: «банан 150», «овсянка», или пришлите цифры штрихкода. «Готово» — закончить." +
        `\n\n${await todayFoodLine()}`
    );
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
      "Напишите напоминание, например:\n" +
        "• «Купить хлеб завтра 18:00»\n" +
        "• «Полить цветы каждые 2 дня»\n" +
        "• «Зарядка каждый день 8:00»\n" +
        "• «Оплатить интернет 25.12 10:00 каждый месяц»\n\n" +
        "🍎 «Еда» — записать съеденное (по названию, граммам или штрихкоду).\n" +
        "🛒 «В список» — добавить покупки.\n\n" +
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
    await tgSend(chatId, "Напишите напоминание и время. Например: «Позвонить маме завтра 19:30», «Полить цветы каждые 2 дня» или «Оплатить интернет | 25.12 10:00 каждый месяц».");
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
  const rep = parsed.repeat !== "none" ? ` · ${repeatLabel(parsed.repeat, dict("ru")).toLowerCase()}` : "";
  // No time was written and a relative day was assumed — say when, and invite a
  // precise time instead.
  const hint = parsed.assumedTime ? "\n<i>Время не указано — поставил через 24 часа. Хотите иначе — допишите время, например «18:00».</i>" : "";
  await tgSend(chatId, `✅ Добавлено: <b>${escape(parsed.title)}</b> — ${when}${rep}${hint}`, MENU);
}

/** The account the bot acts as — its reminders and its food diary belong here. */
async function ownerId(): Promise<string | null> {
  const owner =
    (await prisma.user.findFirst({ where: { role: "owner" }, orderBy: { createdAt: "asc" }, select: { id: true } })) ??
    (await prisma.user.findFirst({ where: { role: "admin" }, orderBy: { createdAt: "asc" }, select: { id: true } })) ??
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }));
  return owner?.id ?? null;
}

async function createReminder(r: { title: string; at: Date; repeat: string }): Promise<void> {
  const id = await ownerId();
  if (!id) return;
  await prisma.reminder.create({ data: { userId: id, title: r.title, at: r.at, repeat: r.repeat } });
}

// ─────────────────────────────── Food diary ──────────────────────────────

/**
 * Look a food up and write it to the diary.
 *
 * A line is "<food> <grams>" — "банан 150" — or just a name (100 g assumed), or
 * a run of digits, which is treated as a barcode. FatSecret answers the same way
 * it does on the web, allow-list and all, so a blocked IP is reported here too.
 */
async function handleFood(chatId: string, text: string): Promise<void> {
  const bare = text.replace(/\s+/g, "");
  const isBarcode = /^\d{6,14}$/.test(bare);

  let query = text.trim();
  let grams = 100;
  if (!isBarcode) {
    const m = text.match(/^(.*?)[\s,]+(\d{1,4})\s*(г|гр|грамм\w*|g)?$/i);
    if (m) {
      query = m[1].trim();
      grams = Math.max(1, Number(m[2]) || 100);
    }
  }

  const res = isBarcode ? await fatSecretBarcode(bare) : await fatSecretSearch(query);
  if (res.error) {
    await tgSend(chatId, foodErrorText(res.error));
    return;
  }
  const match = res.foods.find((f) => f.per100) ?? res.foods[0];
  if (!match || !match.per100) {
    await tgSend(chatId, isBarcode ? "Штрихкод не найден. Попробуйте по названию." : "Не нашёл. Уточните название или добавьте вручную на сайте.");
    return;
  }

  const id = await ownerId();
  if (!id) return;
  const f = grams / 100;
  const kcal = Math.round(match.per100.kcal * f);
  const protein = round1(match.per100.protein * f);
  const fat = round1(match.per100.fat * f);
  const carbs = round1(match.per100.carbs * f);
  await prisma.foodLog.create({ data: { userId: id, name: match.name.slice(0, 120), kcal, protein, fat, carbs, grams } });

  await tgSend(
    chatId,
    `🍎 Записано: <b>${escape(match.name)}</b> — ${grams} г · ${kcal} ккал (Б${protein} Ж${fat} У${carbs})\n\n${await todayFoodLine()}`
  );
}

/** One line: today's running total, for the owner's diary. */
async function todayFoodLine(): Promise<string> {
  const id = await ownerId();
  if (!id) return "";
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = await prisma.foodLog.findMany({ where: { userId: id, at: { gte: start } }, select: { kcal: true, protein: true, fat: true, carbs: true } });
  if (rows.length === 0) return "Сегодня пока пусто.";
  const sum = rows.reduce((a, r) => ({ kcal: a.kcal + r.kcal, protein: a.protein + r.protein, fat: a.fat + r.fat, carbs: a.carbs + r.carbs }), { kcal: 0, protein: 0, fat: 0, carbs: 0 });
  return `📊 Сегодня: <b>${Math.round(sum.kcal)}</b> ккал · Б${Math.round(sum.protein)} Ж${Math.round(sum.fat)} У${Math.round(sum.carbs)}`;
}

function foodErrorText(error: string): string {
  if (error.startsWith("ip:")) return `⚠ FatSecret отклонил IP сервера (${escape(error.slice(3) || "—")}). Добавьте его в белый список в аккаунте FatSecret.`;
  if (error === "auth" || error === "not-configured") return "⚠ FatSecret не настроен или недоступен. Проверьте ключи в настройках.";
  return "⚠ Ошибка FatSecret. Попробуйте ещё раз.";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
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
export function parseReminder(input: string): { title: string; at: Date; repeat: string; assumedTime: boolean } | null {
  let text = input.trim();
  if (text.includes("|")) {
    // Explicit form: "text | when" — parse the two halves separately.
    const [t, w] = text.split("|");
    const when = parseWhen(w);
    const title = t.trim();
    return when && title ? { title, at: when.at, repeat: when.repeat, assumedTime: when.assumedTime } : null;
  }

  const now = new Date();
  const d = new Date(now);
  d.setSeconds(0, 0);
  let found = false;
  let timeSet = false;
  // A relative day ("завтра") with no clock time means the same time tomorrow —
  // exactly 24 hours out — rather than a made-up 09:00. A calendar date is
  // different: there the morning is the sensible default.
  let relativeDay = false;

  // Repeat first, in either language and either spelling — "каждые два дня",
  // "every 3 hours", "ежедневно". Handled by the shared parser so the widget
  // and the bot always agree on what a cadence means.
  const rep = extractRepeat(text);
  let repeat = rep.repeat;
  if (repeat !== "none") {
    text = rep.text;
    found = true;
  }

  const strip = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = text.match(re);
    if (!m) return;
    fn(m);
    text = text.replace(re, " ");
    found = true;
  };

  // `\b` is ASCII-only in JS and never matches next to Cyrillic, so these use
  // explicit letter classes and space anchors instead.
  strip(/(?:^|\s)(через|in)\s+(\d+)\s*(мин[а-яё]*|м|min[a-z]*|час[а-яё]*|ч|h|hours?|дн[а-яё]*|день|d|days?)/i, (m) => {
    const n = Number(m[2]);
    const u = m[3].toLowerCase();
    const ms = /^(мин|м|min)/.test(u) ? 60_000 : /^(час|ч|h)/.test(u) ? 3_600_000 : 86_400_000;
    d.setTime(now.getTime() + n * ms);
    d.setSeconds(0, 0);
    timeSet = true;
  });

  strip(/(послезавтра|день после завтра)/i, () => { d.setDate(now.getDate() + 2); relativeDay = true; });
  strip(/(завтра|tomorrow)/i, () => { d.setDate(now.getDate() + 1); relativeDay = true; });
  strip(/(сегодня|today)/i, () => {});

  strip(/\b(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?\b/, (m) => {
    d.setMonth(Number(m[2]) - 1, Number(m[1]));
    if (m[3]) d.setFullYear(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]));
  });

  strip(/\b(\d{1,2}):(\d{2})\b/, (m) => {
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    timeSet = true;
  });
  if (!timeSet) {
    strip(/(?:^|\s)(?:в|at)\s+(\d{1,2})(?:\s*(час[а-яё]*|ч|h))?(?:\s|$)/i, (m) => {
      d.setHours(Number(m[1]), 0, 0, 0);
      timeSet = true;
    });
  }

  if (!found) return null;

  // "завтра" with no time is exactly a day out, keeping the current clock time;
  // a bare calendar date with no time falls back to the morning.
  let assumedTime = false;
  if (!timeSet) {
    if (relativeDay) {
      assumedTime = true; // same time tomorrow — flag it so the reply can say so
    } else {
      d.setHours(9, 0, 0, 0);
    }
  }
  if (d < now) d.setDate(d.getDate() + 1); // a time already past today is tomorrow's

  const title = text.replace(/\s+/g, " ").replace(/^[\s|·,-]+|[\s|·,-]+$/g, "").trim();
  return title ? { title, at: d, repeat, assumedTime } : null;
}

function parseWhen(str: string): { at: Date; repeat: string; assumedTime: boolean } | null {
  const parsed = parseReminder(`placeholder ${str}`);
  return parsed ? { at: parsed.at, repeat: parsed.repeat, assumedTime: parsed.assumedTime } : null;
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type TgUpdate = { update_id: number; message?: { text?: string; chat?: { id: number } } };
