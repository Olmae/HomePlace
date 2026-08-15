import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";
import { prisma, getSetting, setSetting } from "./db";
import { settings } from "./config";

export const SESSION_COOKIE = "hp_session";

type SessionPayload = {
  uid: string;
  /** Bumped when a password changes, to invalidate old cookies. */
  v?: number;
};

let cachedSecret: Uint8Array | null = null;

/**
 * Signing key for session cookies.
 *
 * AUTH_SECRET from .env is the right way to run this. If it is absent we
 * generate one and keep it in the database instead of refusing to start —
 * "clone it and open it" has to work for a self-hosted project. The generated
 * key lives with the data, so sessions survive restarts but not a wiped volume.
 */
async function secret(): Promise<Uint8Array> {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv) {
    cachedSecret = new TextEncoder().encode(fromEnv);
    return cachedSecret;
  }
  const stored = await getSetting<string | null>("auth.secret", null);
  if (stored) {
    cachedSecret = new TextEncoder().encode(stored);
    return cachedSecret;
  }
  const generated = randomBytes(32).toString("hex");
  await setSetting("auth.secret", generated);
  console.warn(
    "AUTH_SECRET is not set — a key was generated and stored in the database. " +
      "Set AUTH_SECRET in .env for a stable one."
  );
  cachedSecret = new TextEncoder().encode(generated);
  return cachedSecret;
}

export async function createSession(userId: string): Promise<void> {
  const days = settings.sessionDays();
  const token = await new SignJWT({ uid: userId } satisfies SessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(await secret());

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: settings.secureCookies(),
    path: "/",
    maxAge: days * 24 * 60 * 60,
  });
}

export function destroySession(): void {
  cookies().set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

/** The signed-in user, or null. Every server action starts here. */
export async function currentUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await secret());
    const uid = (payload as SessionPayload).uid;
    if (!uid) return null;
    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (!user || user.disabled) return null;
    return user;
  } catch {
    // Expired or tampered-with cookie — treat as signed out, not as an error.
    return null;
  }
}
