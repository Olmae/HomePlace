"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { toggleHabitFor } from "@/lib/habits";

export async function toggleHabit(name: string): Promise<void> {
  const user = await requireUser();
  await toggleHabitFor(user.id, name.trim());
  revalidatePath("/");
}
