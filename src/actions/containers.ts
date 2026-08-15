"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { controlContainer, type ContainerAction } from "@/lib/docker";

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
