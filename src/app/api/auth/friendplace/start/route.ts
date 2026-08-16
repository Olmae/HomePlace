import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { enabled, authorizeUrl, newState, STATE_COOKIE } from "@/lib/friendplace";
import { settings } from "@/lib/config";
import { effectiveOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

/**
 * Starts the FriendPlace sign-in round-trip.
 *
 * The state value is stored in a short-lived cookie and compared on the way
 * back: without it, anyone could hand the user a prepared callback URL and log
 * them into an account of the attacker's choosing.
 */
export async function GET() {
  if (!enabled()) {
    // Not an error page: an installation without FriendPlace should behave as
    // if the integration never existed.
    return NextResponse.redirect(new URL("/login", effectiveOrigin()));
  }

  const state = newState();
  cookies().set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: settings.secureCookies(),
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(authorizeUrl(state)!);
}
