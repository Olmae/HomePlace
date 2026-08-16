import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/session";
import { effectiveOrigin } from "@/lib/origin";
import { enabled, profileFromCode, mayEnter, defaultRole, STATE_COOKIE } from "@/lib/friendplace";

export const dynamic = "force-dynamic";

function back(error?: string) {
  const url = new URL("/login", effectiveOrigin());
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

/**
 * Return leg of the FriendPlace sign-in.
 *
 * Every failure lands back on the login page with a key the page translates —
 * an OAuth callback is a place users end up by accident, and a raw stack trace
 * there tells an outsider more than it tells the owner.
 */
export async function GET(req: NextRequest) {
  if (!enabled()) return back();

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return back("auth.ssoFailed");

  const code = params.get("code");
  const state = params.get("state");
  const expected = cookies().get(STATE_COOKIE)?.value;
  cookies().set(STATE_COOKIE, "", { path: "/", maxAge: 0 });

  if (!code || !state || !expected || state !== expected) return back("auth.ssoStateMismatch");

  const profile = await profileFromCode(code);
  if (!profile) return back("auth.ssoFailed");

  const verdict = mayEnter(profile);
  if (!verdict.ok) {
    await prisma.event.create({
      data: {
        type: "auth-fail",
        severity: "warn",
        title: profile.email,
        detail: verdict.reason ?? "refused",
        actor: profile.email,
      },
    });
    return back(verdict.reason === "no-admin-flag" ? "auth.ssoNoAdminFlag" : "auth.ssoNotAdmin");
  }

  // Match on the provider's user id first: an email can change on their side
  // without becoming a different person.
  let user = await prisma.user.findUnique({ where: { fpUserId: profile.id } });
  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
    user = byEmail
      ? await prisma.user.update({
          where: { id: byEmail.id },
          data: { fpUserId: profile.id, avatarUrl: profile.avatar ?? byEmail.avatarUrl },
        })
      : await prisma.user.create({
          data: {
            name: profile.name,
            email: profile.email,
            fpUserId: profile.id,
            avatarUrl: profile.avatar ?? null,
            // The first account ever created is the owner, even when it arrives
            // through SSO — otherwise a fresh panel would have no one in charge.
            role: (await prisma.user.count()) === 0 ? "owner" : defaultRole(),
          },
        });
  }

  if (user.disabled) return back("auth.accountDisabled");

  // A panel that starts life through SSO still needs somewhere to put tiles.
  if ((await prisma.dashboard.count()) === 0) {
    await prisma.dashboard.create({ data: { name: "Home", order: 0, shared: true, ownerId: user.id } });
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await prisma.event.create({ data: { type: "login", title: user.name, actor: user.name, detail: "FriendPlace" } });
  await createSession(user.id);

  return NextResponse.redirect(new URL("/", effectiveOrigin()));
}
