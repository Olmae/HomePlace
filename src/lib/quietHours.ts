/**
 * The quiet window for notifications.
 *
 * Pure and dependency-free so it can be tested directly: a window that wraps
 * past midnight is the normal case for "do not wake me", and getting the
 * comparison backwards would silence the whole day instead of the night.
 */
export function inQuietHours(quietHours: string, now = new Date()): boolean {
  const match = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(quietHours.trim());
  if (!match) return false;

  const [, sh, sm, eh, em] = match;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = Number(sh) * 60 + Number(sm);
  const end = Number(eh) * 60 + Number(em);

  // start <= end is a window inside one day; otherwise it crosses midnight and
  // "inside" means after the start OR before the end.
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}
