import "server-only";
import { prisma } from "./db";
import { sendPush } from "./push";
import { send as sendTelegram } from "./telegram";
import { telegramConfig } from "./integrations";
import { inQuietHours } from "./quietHours";

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

  const cfg = await telegramConfig();

  for (const reminder of due) {
    await prisma.reminder.update({ where: { id: reminder.id }, data: { notifiedAt: now } });

    await prisma.event.create({
      data: { type: "system", severity: "info", title: reminder.title, detail: "reminder" },
    });

    // To the person who set it, and nobody else.
    await sendPush([reminder.userId], {
      title: `⏰ ${reminder.title}`,
      body: reminder.at.toLocaleString(),
      tag: `reminder-${reminder.id}`,
    }).catch(() => ({ sent: 0, failed: 0 }));

    if (cfg?.enabled && !inQuietHours(cfg.quietHours)) {
      await sendTelegram(`⏰ <b>${escapeHtml(reminder.title)}</b>`);
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
