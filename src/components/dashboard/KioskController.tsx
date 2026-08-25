"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

/**
 * Kiosk mode for a wall tablet.
 *
 * Turned on with `?kiosk=1` (and an optional `interval` in seconds). It marks
 * the document so the chrome — the top nav and the phone pill — is hidden by
 * CSS, holds a screen wake lock so the tablet does not sleep, and rotates
 * through the dashboard tabs on a timer so the whole house cycles past on its
 * own. Nothing is stored; drop the parameter and it is an ordinary page again.
 */
export function KioskController({ tabs }: { tabs: string[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const kiosk = sp.get("kiosk") === "1";

  useEffect(() => {
    const root = document.documentElement;
    if (kiosk) root.setAttribute("data-kiosk", "1");
    else root.removeAttribute("data-kiosk");
    return () => root.removeAttribute("data-kiosk");
  }, [kiosk]);

  // Keep the screen awake, and re-acquire the lock after the tab is hidden and
  // shown again (the browser drops it on visibility change).
  useEffect(() => {
    if (!kiosk) return;
    let lock: { release: () => void } | null = null;
    const request = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lock = await (navigator as any).wakeLock?.request("screen");
      } catch {
        /* denied or unsupported — nothing to do */
      }
    };
    void request();
    const onVisible = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release();
    };
  }, [kiosk]);

  // Rotate through the tabs.
  useEffect(() => {
    if (!kiosk || tabs.length < 2) return;
    const seconds = Math.max(5, Number(sp.get("interval")) || 30);
    const id = setInterval(() => {
      const current = sp.get("tab") ?? tabs[0];
      const next = tabs[(Math.max(0, tabs.indexOf(current)) + 1) % tabs.length];
      const params = new URLSearchParams(sp.toString());
      params.set("tab", next);
      router.replace(`${pathname}?${params.toString()}`);
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [kiosk, tabs, sp, router, pathname]);

  return null;
}
