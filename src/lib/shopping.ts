import "server-only";
import { getSetting, setSetting } from "./db";

/**
 * A shared shopping list.
 *
 * Kept in one setting rather than a table: it is a handful of lines the whole
 * household edits, from the board or from the Telegram bot on the way to the
 * shop, and a JSON array is the honest size of that. Adds append, toggles flip,
 * and "clear done" prunes — small enough that last-write-wins is fine.
 */
export type ShoppingItem = { id: string; text: string; done: boolean };

const KEY = "shopping.items";

export async function getShopping(): Promise<ShoppingItem[]> {
  const raw = await getSetting<ShoppingItem[]>(KEY, []);
  return Array.isArray(raw) ? raw.filter((i) => i && typeof i.text === "string") : [];
}

export async function setShopping(items: ShoppingItem[]): Promise<void> {
  await setSetting(KEY, items.slice(0, 200));
}

/** Append one line — used by the Telegram bot as well as the widget. */
export async function addShopping(text: string): Promise<void> {
  const t = text.trim();
  if (!t) return;
  const items = await getShopping();
  items.push({ id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, text: t, done: false });
  await setShopping(items);
}
