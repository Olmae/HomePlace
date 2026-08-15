"use client";

import { useEffect } from "react";

/**
 * Registers the service worker, which is what makes the panel installable on a
 * phone's home screen.
 *
 * Only over HTTPS or on localhost — browsers refuse anywhere else, and a LAN
 * install on plain http simply stays a normal tab. That is a browser rule, not
 * something the panel can work around, so it fails quietly rather than logging
 * an error on every load.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
