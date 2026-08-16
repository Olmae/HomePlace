import "server-only";

/**
 * Attempt limiting for the login form.
 *
 * Kept in memory on purpose. A panel for one household runs as a single
 * process, and a table of failed logins would be one more thing to prune — the
 * cost of the simpler choice is that a restart forgives everyone, which is
 * acceptable for slowing down a guess-the-password loop.
 *
 * It is a delay, not a wall: someone who knows the password is never locked
 * out for long, and someone who does not gets a very slow afternoon.
 */

type Bucket = { count: number; first: number; blockedUntil: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 10;
const BLOCK_MS = 15 * 60_000;

export type LimitResult = { allowed: boolean; retryAfterSeconds?: number };

/** Called before checking a password. */
export function checkAttempt(key: string): LimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket) return { allowed: true };

  if (bucket.blockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000) };
  }
  // The window has passed; start counting again.
  if (now - bucket.first > WINDOW_MS) {
    buckets.delete(key);
    return { allowed: true };
  }
  return { allowed: true };
}

/** Called after a failed attempt. */
export function recordFailure(key: string): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.first > WINDOW_MS) {
    buckets.set(key, { count: 1, first: now, blockedUntil: 0 });
    return;
  }

  bucket.count++;
  if (bucket.count >= MAX_ATTEMPTS) {
    bucket.blockedUntil = now + BLOCK_MS;
    bucket.count = 0;
    bucket.first = now;
  }

  // Opportunistic cleanup: this map only grows while someone is failing, and
  // a sweep on write costs nothing at this scale.
  if (buckets.size > 500) {
    for (const [k, v] of buckets) {
      if (v.blockedUntil < now && now - v.first > WINDOW_MS) buckets.delete(k);
    }
  }
}

/** Called after a successful login. */
export function clearAttempts(key: string): void {
  buckets.delete(key);
}
