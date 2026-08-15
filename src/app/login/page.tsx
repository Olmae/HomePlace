import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/auth";
import { currentUser } from "@/lib/session";
import { settings } from "@/lib/config";
import { enabled as ssoEnabled } from "@/lib/friendplace";
import { dict, lookup } from "@/i18n";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  if (await needsSetup()) redirect("/setup");
  if (await currentUser()) redirect("/");

  const d = dict(settings.defaultLocale());
  // SSO is an optional extra. With no FriendPlace configured the button is not
  // rendered at all, and the page is a plain local login — which is what a
  // standalone installation should look like.
  const sso = ssoEnabled();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-12">
      <div className="mb-7">
        <p className="mb-1 font-mono text-xs uppercase tracking-widest text-muted">HomePlace</p>
        <h1 className="text-2xl font-semibold tracking-tight">{d.auth.signIn}</h1>
      </div>

      <LoginForm d={d} initialError={lookup(d, searchParams.error)} />

      {sso && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-line" />
            {d.auth.or}
            <span className="h-px flex-1 bg-line" />
          </div>
          <a
            href="/api/auth/friendplace/start"
            className="flex items-center justify-center gap-2 rounded-control border border-line bg-surface px-3.5 py-2 text-sm font-medium transition-colors hover:bg-raised"
          >
            {d.auth.signInWithFriendPlace}
          </a>
        </>
      )}
    </main>
  );
}
