"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProfile, setProfile, computeTargets, type NutritionProfile, type Targets } from "@/lib/nutrition";
import { foodSearch, foodByBarcode } from "@/lib/food";
import type { SearchResult } from "@/lib/fatsecret";

/**
 * The food diary.
 *
 * Personal, like reminders: the numbers on this screen are about one body, so
 * each account keeps its own profile and its own day. The targets are pure
 * arithmetic on the profile; the diary is a plain table summed for the day.
 */

export type FoodEntry = { id: string; name: string; kcal: number; protein: number; fat: number; carbs: number; grams: number | null };
export type DayTotals = { kcal: number; protein: number; fat: number; carbs: number };
/** One past day, for the little week strip: its date and calories eaten. */
export type DayKcal = { label: string; kcal: number };
export type NutritionState = {
  profile: NutritionProfile | null;
  targets: Targets | null;
  entries: FoodEntry[];
  totals: DayTotals;
  /** The last seven days (oldest → today), calories per day. */
  week: DayKcal[];
  // Whether online food lookup is available. Always true now — Open Food Facts
  // is keyless, so search and barcode work even without FatSecret configured.
  lookup: boolean;
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getNutrition(): Promise<NutritionState> {
  const user = await requireUser();
  const weekStart = new Date(startOfToday());
  weekStart.setDate(weekStart.getDate() - 6); // seven days including today

  const [profile, rows, weekRows] = await Promise.all([
    getProfile(user.id),
    prisma.foodLog.findMany({ where: { userId: user.id, at: { gte: startOfToday() } }, orderBy: { at: "asc" } }),
    prisma.foodLog.findMany({ where: { userId: user.id, at: { gte: weekStart } }, select: { at: true, kcal: true } }),
  ]);
  const entries: FoodEntry[] = rows.map((r) => ({ id: r.id, name: r.name, kcal: r.kcal, protein: r.protein, fat: r.fat, carbs: r.carbs, grams: r.grams }));
  const totals = entries.reduce(
    (t, e) => ({ kcal: t.kcal + e.kcal, protein: t.protein + e.protein, fat: t.fat + e.fat, carbs: t.carbs + e.carbs }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  );

  // Bucket the week's rows into seven day totals, oldest first.
  const week: DayKcal[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(startOfToday());
    day.setDate(day.getDate() - i);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const kcal = weekRows.filter((r) => r.at >= day && r.at < next).reduce((s, r) => s + r.kcal, 0);
    week.push({ label: day.toLocaleDateString(undefined, { weekday: "short" }), kcal: Math.round(kcal) });
  }

  return {
    profile,
    targets: profile ? computeTargets(profile) : null,
    entries,
    totals: { kcal: Math.round(totals.kcal), protein: Math.round(totals.protein), fat: Math.round(totals.fat), carbs: Math.round(totals.carbs) },
    week,
    lookup: true,
  };
}

export async function saveNutritionProfile(input: NutritionProfile): Promise<void> {
  const user = await requireUser();
  await setProfile(user.id, {
    weight: clamp(input.weight, 0, 400),
    height: clamp(input.height, 0, 260),
    age: clamp(input.age, 0, 130),
    sex: input.sex === "female" ? "female" : "male",
    activity: ["sedentary", "light", "moderate", "active", "very"].includes(input.activity) ? input.activity : "moderate",
    goal: ["lose", "maintain", "gain"].includes(input.goal) ? input.goal : "maintain",
  });
  revalidatePath("/");
}

export async function searchFood(query: string): Promise<SearchResult> {
  await requireUser();
  return foodSearch(query);
}

export async function searchBarcode(barcode: string): Promise<SearchResult> {
  await requireUser();
  return foodByBarcode(barcode);
}

/**
 * Decode a barcode from an uploaded photo, then look it up.
 *
 * The browser hands over a JPEG (it normalises whatever the phone took), the
 * server reads the bars — at any rotation — and the found number goes through
 * the same lookup as a typed one. `code` is echoed back so the UI can show what
 * it read, or say it read nothing.
 */
export async function scanFoodPhoto(jpegBase64: string): Promise<{ code: string | null; result: SearchResult }> {
  await requireUser();
  const { decodeBarcodeFromJpeg } = await import("@/lib/barcodeDecode");
  const base64 = jpegBase64.includes(",") ? jpegBase64.slice(jpegBase64.indexOf(",") + 1) : jpegBase64;
  const code = decodeBarcodeFromJpeg(Buffer.from(base64, "base64"));
  if (!code) return { code: null, result: { foods: [] } };
  return { code, result: await foodByBarcode(code) };
}

export async function logFood(input: { name: string; kcal: number; protein: number; fat: number; carbs: number; grams?: number | null }): Promise<void> {
  const user = await requireUser();
  const name = input.name.trim().slice(0, 120);
  if (!name || !(input.kcal >= 0)) return;
  await prisma.foodLog.create({
    data: {
      userId: user.id,
      name,
      kcal: r0(input.kcal),
      protein: r1(input.protein),
      fat: r1(input.fat),
      carbs: r1(input.carbs),
      grams: input.grams != null ? r0(input.grams) : null,
    },
  });
  revalidatePath("/");
}

export async function deleteFood(id: string): Promise<void> {
  const user = await requireUser();
  await prisma.foodLog.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/");
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number(n) || 0));
}
function r0(n: number): number {
  return Math.max(0, Math.round(Number(n) || 0));
}
function r1(n: number): number {
  return Math.max(0, Math.round((Number(n) || 0) * 10) / 10);
}
