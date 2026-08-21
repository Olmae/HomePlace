import { fill, type Dictionary } from "@/i18n";

/**
 * When a repeating thing happens next, and how to say it.
 *
 * Pure and separate from the server actions on purpose: a `"use server"` module
 * may only export async functions, and this is neither — it is arithmetic and a
 * little grammar, and it is the part worth having a test for.
 *
 * A repeat is one of the named cadences ("daily", "weekly", "monthly",
 * "yearly", "hourly") or an interval — "every:2:day", "every:3:hour" — which is
 * how "water the plants every two days" is stored. "none" never repeats. The
 * named forms are just the intervals with a count of one, kept as words because
 * that is how people say them and how older reminders were already written.
 */

export type RepeatUnit = "hour" | "day" | "week" | "month" | "year";

const NAMED: Record<string, { n: number; unit: RepeatUnit }> = {
  hourly: { n: 1, unit: "hour" },
  daily: { n: 1, unit: "day" },
  weekly: { n: 1, unit: "week" },
  monthly: { n: 1, unit: "month" },
  yearly: { n: 1, unit: "year" },
};

/** Decode a repeat into a step, or null for "none" and anything unrecognised. */
function parseRepeat(repeat: string): { n: number; unit: RepeatUnit } | null {
  if (repeat in NAMED) return NAMED[repeat];
  const m = /^every:(\d+):(hour|day|week|month|year)$/.exec(repeat);
  return m ? { n: Math.max(1, Number(m[1])), unit: m[2] as RepeatUnit } : null;
}

/** Canonical repeat string for a count and unit — a word when the count is one. */
export function makeRepeat(n: number, unit: RepeatUnit): string {
  const count = Math.max(1, Math.round(n));
  if (count === 1) {
    const named = (Object.keys(NAMED) as string[]).find((k) => NAMED[k].unit === unit);
    return named ?? `every:1:${unit}`;
  }
  return `every:${count}:${unit}`;
}

/** Is this a repeat string the rest of the system will understand? */
export function isRepeat(repeat: string): boolean {
  return repeat === "none" || parseRepeat(repeat) !== null;
}

function step(d: Date, n: number, unit: RepeatUnit): void {
  if (unit === "hour") d.setHours(d.getHours() + n);
  else if (unit === "day") d.setDate(d.getDate() + n);
  else if (unit === "week") d.setDate(d.getDate() + 7 * n);
  else if (unit === "month") d.setMonth(d.getMonth() + n);
  else d.setFullYear(d.getFullYear() + n);
}

/** The next occurrence strictly after now. */
export function nextOccurrence(from: Date, repeat: string): Date {
  const next = new Date(from);
  const spec = parseRepeat(repeat);
  if (!spec) return next;

  const now = Date.now();
  // Step forward until it passes now, rather than adding a single interval: a
  // reminder ignored for a while should come back at its next real time, not at
  // one that has already gone. The guard is generous enough for an hourly
  // reminder left alone for years, and cheap either way.
  for (let guard = 0; guard < 200_000 && next.getTime() <= now; guard++) {
    step(next, spec.n, spec.unit);
  }
  return next;
}

// ─────────────────────────────── Wording ─────────────────────────────────

/** Russian and English disagree on how many plural forms a number has. */
function pluralIndex(n: number, lang: string): number {
  if (lang === "ru") {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 0;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1;
    return 2;
  }
  return n === 1 ? 0 : 1;
}

/** A human phrase for a repeat: "Daily", "Every 2 days", "каждые 3 часа". */
export function repeatLabel(repeat: string, d: Dictionary): string {
  if (repeat === "none") return d.reminders.once;
  const r = d.reminders;
  const named: Record<string, string> = { hourly: r.hourly, daily: r.daily, weekly: r.weekly, monthly: r.monthly, yearly: r.yearly };
  if (repeat in named) return named[repeat];

  const spec = parseRepeat(repeat);
  if (!spec) return repeat;
  const forms = r.units[spec.unit];
  const unit = forms[pluralIndex(spec.n, d.lang)] ?? forms[forms.length - 1];
  return fill(r.every, { n: spec.n, unit });
}

// ─────────────────────────── Parsing from text ────────────────────────────

const NUMWORDS: Record<string, number> = {
  один: 1, одна: 1, одно: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5,
  шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10, пол: 1,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function count(token: string | undefined): number {
  if (!token) return 1;
  const t = token.trim().toLowerCase();
  return NUMWORDS[t] ?? Math.max(1, parseInt(t, 10) || 1);
}

function ruUnit(word: string): RepeatUnit {
  const w = word.toLowerCase();
  if (w.startsWith("час")) return "hour";
  if (w.startsWith("недел")) return "week";
  if (w.startsWith("месяц")) return "month";
  if (w.startsWith("год") || w === "лет" || w.startsWith("лет")) return "year";
  return "day";
}
function enUnit(word: string): RepeatUnit {
  const w = word.toLowerCase();
  if (w.startsWith("hour")) return "hour";
  if (w.startsWith("week")) return "week";
  if (w.startsWith("month")) return "month";
  if (w.startsWith("year")) return "year";
  return "day";
}

/**
 * Pull a repeat phrase out of a line, returning the cadence and the text with
 * the phrase removed. Understands both languages and both spellings of a count
 * ("every 2 days", "каждые два дня", "ежедневно", "each week").
 */
export function extractRepeat(input: string): { repeat: string; text: string } {
  let text = input;
  let repeat = "none";

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void): boolean => {
    if (repeat !== "none") return false;
    const m = text.match(re);
    if (!m) return false;
    fn(m);
    text = text.replace(m[0], " ");
    return true;
  };

  // Intervals first — "каждые 2 дня", "every 3 hours", "each two weeks". No word
  // boundaries (`\b`) around the Cyrillic: in JS `\b` is ASCII-only, so it never
  // fires next to Russian letters. Explicit letter classes stand in for `\w`.
  const RU_UNIT = "(час[а-яё]*|дн[а-яё]*|день|недел[а-яё]*|месяц[а-яё]*|год[а-яё]*|лет)";
  take(new RegExp(`кажд[а-яё]*\\s+(\\d+|[а-яё]+)\\s+${RU_UNIT}`, "i"), (m) => {
    repeat = makeRepeat(count(m[1]), ruUnit(m[2]));
  });
  take(new RegExp(`(?:раз в|через каждые)\\s+(\\d+|[а-яё]+)\\s+${RU_UNIT}`, "i"), (m) => {
    repeat = makeRepeat(count(m[1]), ruUnit(m[2]));
  });
  take(/(?:every|each)\s+(\d+|[a-z]+)\s+(hours?|days?|weeks?|months?|years?)/i, (m) => {
    repeat = makeRepeat(count(m[1]), enUnit(m[2]));
  });

  // Named cadences ("каждый день", "ежедневно", "every week").
  take(/(ежечасно|кажд[а-яё]*\s+час|hourly|every hour)/i, () => (repeat = "hourly"));
  take(/(ежедневно|кажд[а-яё]*\s+день|daily|every day)/i, () => (repeat = "daily"));
  take(/(еженедельно|кажд[а-яё]*\s+недел[а-яё]*|weekly|every week)/i, () => (repeat = "weekly"));
  take(/(ежемесячно|кажд[а-яё]*\s+месяц|monthly|every month)/i, () => (repeat = "monthly"));
  take(/(ежегодно|кажд[а-яё]*\s+год|yearly|annually|every year)/i, () => (repeat = "yearly"));

  return { repeat, text };
}
