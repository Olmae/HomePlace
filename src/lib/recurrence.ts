/**
 * When a repeating thing happens next.
 *
 * Pure and separate from the server actions on purpose: a `"use server"` module
 * may only export async functions, and this is neither — it is arithmetic, and
 * it is the part worth having a test for.
 */
/** The next occurrence strictly after now. */
export function nextOccurrence(from: Date, repeat: string): Date {
  const next = new Date(from);
  const now = Date.now();

  // Stepping forward until it passes now, rather than adding one interval:
  // a weekly reminder ignored for a month should come back next week, not
  // three weeks ago.
  for (let guard = 0; guard < 500 && next.getTime() <= now; guard++) {
    if (repeat === "daily") next.setDate(next.getDate() + 1);
    else if (repeat === "weekly") next.setDate(next.getDate() + 7);
    else if (repeat === "monthly") next.setMonth(next.getMonth() + 1);
    else break;
  }
  return next;
}
