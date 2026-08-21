import "server-only";
import { prisma } from "./db";
import { sendPush } from "./push";
import { notify } from "./notify";
import { nextOccurrence } from "./recurrence";

/**
 * Reminders that have come due.
 *
 * Checked on the same tick as everything else. Quiet hours are deliberately
 * *not* applied here: a reminder is something the person asked for at a
 * specific time, unlike an alert that the server decided to raise.
 */
export async function processReminders(): Promise<void> {
  const now = new Date();

  const due = await prisma.reminder.findMany({
    where: { done: false, at: { lte: now }, notifiedAt: null },
    take: 20,
  });
  if (due.length === 0) return;

  for (const reminder of due) {
    // A one-off is marked notified and stays put until it is ticked off. A
    // repeating one moves itself to its next time right away — "water the
    // plants every two days" should keep coming back on its own, without
    // anyone having to press done for the cycle to continue.
    if (reminder.repeat === "none") {
      await prisma.reminder.update({ where: { id: reminder.id }, data: { notifiedAt: now } });
    } else {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { at: nextOccurrence(reminder.at, reminder.repeat), notifiedAt: null },
      });
    }

    await prisma.event.create({
      data: { type: "system", severity: "info", title: reminder.title, detail: "reminder" },
    });

    // Push goes to the person who set it, and nobody else — a reminder is
    // personal in a way an alert is not.
    await sendPush([reminder.userId], {
      title: `⏰ ${reminder.title}`,
      body: reminder.at.toLocaleString(),
      tag: `reminder-${reminder.id}`,
    }).catch(() => ({ sent: 0, failed: 0 }));

    // The shared routes carry it too, and quiet hours do not apply: this is a
    // time the person chose, not something the server decided to raise.
    await notify({
      title: `⏰ ${reminder.title}`,
      body: reminder.at.toLocaleString(),
      severity: "info",
      tag: `reminder-${reminder.id}`,
      respectQuietHours: false,
      // Already pushed, to the one person it belongs to.
      skipPush: true,
    });
  }
}
