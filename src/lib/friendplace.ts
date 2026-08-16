import "server-only";
import { randomBytes } from "node:crypto";
import { friendplace } from "./config";
import { effectiveOrigin } from "./origin";

/**
 * Optional single sign-on against FriendPlace, which acts as an OAuth 2.0
 * provider for the Places ecosystem.
 *
 * Optional is the important word. HomePlace is a self-hosted panel that most
 * people will run on their own with no FriendPlace anywhere: with the variables
 * unset, `enabled()` is false, the button disappears from the login page and
 * the callback route refuses. Local accounts are always the primary way in.
 */

export const REDIRECT_PATH = "/api/auth/callback/friendplace";
/** Cookie holding the anti-forgery state between the two legs of the flow.
 *  It lives here rather than in the route file: a route module may only export
 *  the handlers Next.js knows about, and anything else is a build error. */
export const STATE_COOKIE = "hp_oauth_state";
/** Scope requested from FriendPlace: just enough to identify the person. */
const SCOPE = "profile";

export function enabled(): boolean {
  return friendplace() !== null;
}

export function redirectUri(): string {
  // Same reasoning as the Google flow: the address in the browser is the one
  // the provider must send the person back to.
  return `${effectiveOrigin()}${REDIRECT_PATH}`;
}

/** Random value tying the callback to the browser that started the flow. */
export function newState(): string {
  return randomBytes(16).toString("hex");
}

export function authorizeUrl(state: string): string | null {
  const cfg = friendplace();
  if (!cfg) return null;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: redirectUri(),
    scope: SCOPE,
    state,
  });
  return `${cfg.url}/oauth/authorize?${params.toString()}`;
}

export type FriendPlaceProfile = {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  /** Present only on a FriendPlace new enough to expose it. */
  isAdmin?: boolean;
};

/** Exchange the authorization code for an access token. */
async function exchangeCode(code: string): Promise<string | null> {
  const cfg = friendplace();
  if (!cfg) return null;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const res = await fetch(`${cfg.url}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    console.error("friendplace token exchange failed:", res.status, (await res.text()).slice(0, 300));
    return null;
  }
  const json = await res.json();
  return typeof json.access_token === "string" ? json.access_token : null;
}

/** Full login step: code → token → profile. Null on any failure. */
export async function profileFromCode(code: string): Promise<FriendPlaceProfile | null> {
  const cfg = friendplace();
  if (!cfg) return null;
  const token = await exchangeCode(code);
  if (!token) return null;

  const res = await fetch(`${cfg.url}/oauth/userinfo`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    console.error("friendplace userinfo failed:", res.status);
    return null;
  }
  const json = await res.json();
  if (!json?.id || !json?.email) return null;
  return {
    id: String(json.id),
    email: String(json.email),
    name: String(json.name ?? json.email),
    avatar: json.avatar ? String(json.avatar) : undefined,
    isAdmin: typeof json.isAdmin === "boolean" ? json.isAdmin : undefined,
  };
}

/**
 * Whether this FriendPlace account may enter.
 *
 * With FRIENDPLACE_ADMINS_ONLY on (the default) an account has to be an admin
 * there. If that FriendPlace does not report `isAdmin` at all, we refuse rather
 * than assume — an older provider must not silently turn into "everyone gets
 * in". The refusal message tells the operator to upgrade or to turn the flag
 * off knowingly.
 */
export function mayEnter(profile: FriendPlaceProfile): { ok: boolean; reason?: "not-admin" | "no-admin-flag" } {
  const cfg = friendplace();
  if (!cfg) return { ok: false };
  if (!cfg.adminsOnly) return { ok: true };
  if (profile.isAdmin === undefined) return { ok: false, reason: "no-admin-flag" };
  return profile.isAdmin ? { ok: true } : { ok: false, reason: "not-admin" };
}

export function defaultRole(): string {
  return friendplace()?.defaultRole ?? "admin";
}
