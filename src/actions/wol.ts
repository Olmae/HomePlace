"use server";

import { requireRole } from "@/lib/auth";
import { sendWol } from "@/lib/wol";

/** Send a Wake-on-LAN magic packet to a machine on the LAN. */
export async function wakeMachine(mac: string, broadcast?: string): Promise<{ ok: boolean; error?: string }> {
  await requireRole("admin");
  return sendWol(mac, broadcast?.trim() || undefined);
}
