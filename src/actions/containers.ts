"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { controlContainer, type ContainerAction } from "@/lib/docker";
import { scanContainerUpdates, type UpdateStatus } from "@/lib/imageUpdates";

/**
 * Start, stop and restart, from the panel.
 *
 * Two gates stand in front of it: the admin role here, and
 * ALLOW_CONTAINER_CONTROL inside controlContainer(). The second one is what an
 * operator can rely on — turning it off makes the installation read-only no
 * matter who signs in or what the interface offers.
 */
export async function runContainerAction(
  hostKey: string,
  id: string,
  name: string,
  action: ContainerAction
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("admin");
  const result = await controlContainer(hostKey, id, action);

  // Recorded either way: a refused action is exactly what you want to find in
  // the feed when a service did not come back.
  await prisma.event.create({
    data: {
      type: "restart",
      severity: result.ok ? "info" : "error",
      title: `${name}: ${action}`,
      detail: result.error ?? null,
      actor: user.name,
    },
  });

  revalidatePath("/containers");
  revalidatePath("/");
  return result;
}

/**
 * Check every running container against its registry for a newer image.
 *
 * Manual, because it reaches the public internet — the panel is otherwise happy
 * on a LAN with no route out. Deduplicated by image so twenty containers off
 * one image cost one lookup, and capped so a host full of images does not fan
 * out into a hundred registry calls at once.
 */
export async function checkImageUpdates(): Promise<{ name: string; status: UpdateStatus }[]> {
  await requireRole("admin");
  // The scan lives in the lib now, so the daily background check and this button
  // share it — and a manual check is remembered too, showing on the next load.
  return (await scanContainerUpdates()).results;
}
