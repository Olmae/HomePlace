"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { controlContainer, listContainers, type ContainerAction } from "@/lib/docker";
import { imageUpdate, type UpdateStatus } from "@/lib/imageUpdates";

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
  const running = (await listContainers()).filter((c) => c.state === "running");

  // One lookup per distinct image+digest; the result is mapped back to names.
  const byImage = new Map<string, { image: string; imageId?: string }>();
  for (const c of running) byImage.set(`${c.image}|${c.imageId ?? ""}`, { image: c.image, imageId: c.imageId });

  const uniques = [...byImage.entries()].slice(0, 60);
  const statuses = new Map<string, UpdateStatus>();
  await Promise.all(
    uniques.map(async ([key, { image, imageId }]) => {
      statuses.set(key, await imageUpdate(image, imageId));
    })
  );

  return running.map((c) => ({ name: c.name, status: statuses.get(`${c.image}|${c.imageId ?? ""}`) ?? "unknown" }));
}
