import "server-only";
import { getSetting, setSetting } from "./db";

/**
 * How much to eat, from a few numbers about a person.
 *
 * The target is Mifflin–St Jeor for the resting burn, times an activity factor
 * for the day's, nudged for the goal — the same arithmetic a fitness site does
 * behind its calculator, kept here so it needs no account and no round trip.
 * Macros then split the calories: protein by body weight, fat a quarter of the
 * energy, carbohydrate whatever is left.
 *
 * The profile is per person; the diary that fills against it lives in FoodLog.
 */
export type NutritionProfile = {
  weight: number; // kg
  height: number; // cm
  age: number;
  sex: "male" | "female";
  activity: "sedentary" | "light" | "moderate" | "active" | "very";
  goal: "lose" | "maintain" | "gain";
};

export type Targets = { kcal: number; protein: number; fat: number; carbs: number };

const ACTIVITY: Record<NutritionProfile["activity"], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very: 1.9,
};

export function computeTargets(p: NutritionProfile): Targets | null {
  if (!(p.weight > 0 && p.height > 0 && p.age > 0)) return null;

  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === "female" ? -161 : 5);
  const tdee = bmr * (ACTIVITY[p.activity] ?? 1.2);
  const kcal = Math.round(p.goal === "lose" ? tdee - 500 : p.goal === "gain" ? tdee + 300 : tdee);

  // Protein by weight (a touch higher when cutting), fat a quarter of energy,
  // carbohydrate the remainder.
  const protein = Math.round(p.weight * (p.goal === "lose" ? 2.0 : 1.8));
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));

  return { kcal, protein, fat, carbs };
}

function key(userId: string): string {
  return `nutrition.profile:${userId}`;
}

export async function getProfile(userId: string): Promise<NutritionProfile | null> {
  const p = await getSetting<NutritionProfile | null>(key(userId), null);
  return p && typeof p.weight === "number" ? p : null;
}

export async function setProfile(userId: string, p: NutritionProfile): Promise<void> {
  await setSetting(key(userId), p);
}
