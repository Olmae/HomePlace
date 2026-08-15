"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the page on the server every so often, so status dots and metrics
 * stay current on a panel that is left open all day.
 *
 * router.refresh() re-runs the server components and patches the result in —
 * no full reload, so scroll position, open dialogs and focus survive it.
 */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      // Refreshing a hidden tab wakes the server for nobody. A dashboard on a
      // second monitor would otherwise poll all night.
      if (document.visibilityState === "visible") router.refresh();
    }, Math.max(5, seconds) * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return null;
}
