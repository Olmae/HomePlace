"use server";

import { currentUser } from "@/lib/session";
import { notificationFeed, markSeen, type FeedItem } from "@/lib/notifications";

/** The bell's list, on demand when it opens. */
export async function fetchNotifications(): Promise<{ items: FeedItem[]; unread: number }> {
  const user = await currentUser();
  if (!user) return { items: [], unread: 0 };
  return notificationFeed(user.id);
}

/** Called when the bell opens: everything currently shown counts as read. */
export async function markNotificationsSeen(): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  await markSeen(user.id);
}
