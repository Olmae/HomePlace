import "server-only";
import { headers } from "next/headers";
import { appUrl } from "./config";

/**
 * The address this panel is actually being used at.
 *
 * `APP_URL` is what background jobs have to use — an alert is composed with
 * nobody's browser attached — but it is also the setting most likely to be left
 * at its default, and a wrong one is invisible until an OAuth round-trip sends
 * somebody to `localhost:3200` from their laptop.
 *
 * So: when there is a request, believe the request. `x-forwarded-*` is what a
 * reverse proxy sets, and `host` is what a direct connection gives.
 */
export function requestOrigin(): string | null {
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return null;

    const proto =
      h.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
      // A LAN panel is almost always plain HTTP; assuming HTTPS here would
      // produce a redirect URI nothing answers.
      (host.startsWith("localhost") || /^\d+\.\d+\.\d+\.\d+/.test(host) ? "http" : "https");

    return `${proto}://${host}`.replace(/\/+$/, "");
  } catch {
    // Called outside a request (a background job): there is no origin to read.
    return null;
  }
}

/**
 * Origin to build user-facing links with: the current request when there is
 * one, the configured APP_URL otherwise.
 */
export function effectiveOrigin(): string {
  return requestOrigin() ?? appUrl();
}
