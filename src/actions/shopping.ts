"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { setShopping, type ShoppingItem } from "@/lib/shopping";

export async function saveShopping(items: ShoppingItem[]): Promise<void> {
  await requireRole("admin");
  await setShopping(items);
  revalidatePath("/");
}
