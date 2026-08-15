import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/auth";
import { currentUser } from "@/lib/session";
import { dict } from "@/i18n";
import { AppNav } from "@/components/AppNav";
import { startMonitor } from "@/lib/monitor";

export const dynamic = "force-dynamic";

/**
 * The shell every signed-in page lives in.
 *
 * Authentication is enforced here rather than in middleware: middleware runs on
 * the edge runtime with no database, so it could only guess from the presence
 * of a cookie. This layout resolves the real account, and everything below it
 * can assume a user exists.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Idempotent: the first signed-in page render of a process starts the prober,
  // every later one is a no-op.
  startMonitor();

  if (await needsSetup()) redirect("/setup");
  const user = await currentUser();
  if (!user) redirect("/login");

  const d = dict(user.locale);

  return (
    <div className="flex min-h-screen flex-col">
      <AppNav d={d} user={{ name: user.name, role: user.role, avatarUrl: user.avatarUrl }} />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
}
