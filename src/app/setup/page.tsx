import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/auth";
import { settings } from "@/lib/config";
import { dict } from "@/i18n";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

/**
 * First-run wizard. Reachable only while the panel has no accounts — once the
 * owner exists this page redirects away, so it cannot be used later to mint a
 * second owner.
 */
export default async function SetupPage() {
  if (!(await needsSetup())) redirect("/");
  const d = dict(settings.defaultLocale());

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <div className="mb-7">
        <p className="mb-1 font-mono text-xs uppercase tracking-widest text-muted">HomePlace</p>
        <h1 className="text-2xl font-semibold tracking-tight">{d.setup.title}</h1>
        <p className="mt-2 text-sm text-muted">{d.setup.intro}</p>
      </div>
      <SetupForm d={d} />
    </main>
  );
}
