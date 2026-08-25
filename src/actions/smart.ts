"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { saveSmartConfig, type SmartConfig } from "@/lib/smart";

export async function saveSmart(input: SmartConfig): Promise<void> {
  await requireRole("admin");
  await saveSmartConfig(input);
  revalidatePath("/settings");
}
