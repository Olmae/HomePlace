"use server";

import { requireRole } from "@/lib/auth";
import { geocode } from "@/lib/weather";

/**
 * City lookup for the weather widget.
 *
 * A server action rather than a fetch from the browser: the geocoder is an
 * outside service, and a panel that is deliberately usable on a closed network
 * should keep every outbound request on the server side, where it can be seen
 * and, if need be, blocked in one place.
 */
export async function searchPlace(name: string) {
  await requireRole("admin");
  return geocode(name);
}
