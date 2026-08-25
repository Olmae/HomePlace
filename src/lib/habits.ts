import "server-only";
import { getSetting, setSetting } from "./db";

/**
 * A daily habit tracker.
 *
 * Personal, per account, and deliberately tiny: a list of things to do each day,
 * a tick when they are done, and a streak so a good run is visible and worth
 * keeping. Nothing but the ticks is stored — the habit names live in the widget
 * config, so two people can watch different lists on the same board.
 */

const key = (userId: string) => `habits:${userId}`;
type Store = Record<string, string[]>; // date "Y-M-D" → habit names done that day

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export type HabitState = { name: string; doneToday: boolean; streak: number };

export async function habitsState(userId: string, names: string[]): Promise<HabitState[]> {
  const store = (await getSetting<Store | null>(key(userId), null)) ?? {};
  const today = new Date();
  const doneOn = (name: string, d: Date) => (store[dayKey(d)] ?? []).includes(name);

  return names.map((name) => {
    const doneToday = doneOn(name, today);
    // Consecutive days done, ending today — or yesterday, so a habit not yet
    // ticked today does not read as a broken streak until the day is over.
    const cursor = new Date(today);
    if (!doneToday) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (doneOn(name, cursor)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return { name, doneToday, streak };
  });
}

export async function toggleHabitFor(userId: string, name: string): Promise<void> {
  if (!name) return;
  const store = (await getSetting<Store | null>(key(userId), null)) ?? {};
  const k = dayKey(new Date());
  const set = new Set(store[k] ?? []);
  if (set.has(name)) set.delete(name);
  else set.add(name);
  store[k] = [...set];

  // Keep the store from growing forever — ten weeks is more than any streak needs.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 70);
  for (const day of Object.keys(store)) {
    const [y, m, d] = day.split("-").map(Number);
    if (new Date(y, m - 1, d) < cutoff) delete store[day];
  }
  await setSetting(key(userId), store);
}
