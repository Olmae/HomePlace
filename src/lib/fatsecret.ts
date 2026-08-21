import "server-only";
import { getSetting, setSetting } from "./db";
import { encrypt, decrypt } from "./secretBox";

/**
 * FatSecret food search.
 *
 * The Platform API's public search needs only a client id and secret — a
 * server-to-server OAuth2 token, no per-person login — which is exactly what a
 * shared panel can hold. Each result already carries a per-serving nutrition
 * line, so a lookup is enough to log a food without a second call.
 *
 * The panel keeps its own diary (FoodLog); this only answers "what is in a
 * banana", so the operator's own FatSecret account is never touched.
 */
export type FatSecretSettings = { clientId: string; secret: string };
export type FoodMatch = { id: string; name: string; per100: { kcal: number; protein: number; fat: number; carbs: number } | null };
/** A search either returns matches or a reason it could not — an empty list and
 *  a failure are different answers, and the widget must not confuse them. */
export type SearchResult = { foods: FoodMatch[]; error?: string };

const KEY = "integration.fatsecret";

export async function fatSecretConfig(): Promise<FatSecretSettings | null> {
  const stored = await getSetting<FatSecretSettings | null>(KEY, null);
  if (!stored?.clientId) return null;
  return { clientId: stored.clientId, secret: stored.secret ? await decrypt(stored.secret) : "" };
}

export async function saveFatSecret(input: Partial<FatSecretSettings>): Promise<void> {
  const existing = await getSetting<FatSecretSettings | null>(KEY, null);
  await setSetting(KEY, {
    clientId: (input.clientId ?? existing?.clientId ?? "").trim(),
    secret: input.secret ? await encrypt(input.secret) : existing?.secret ?? "",
  });
}

let cached: { token: string; expires: number } | null = null;

async function token(cfg: FatSecretSettings): Promise<string | null> {
  if (cached && cached.expires > Date.now() + 30_000) return cached.token;
  try {
    const auth = Buffer.from(`${cfg.clientId}:${cfg.secret}`).toString("base64");
    const res = await fetch("https://oauth.fatsecret.com/connect/token", {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials&scope=basic",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) return null;
    cached = { token: j.access_token, expires: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return cached.token;
  } catch {
    return null;
  }
}

export async function fatSecretSearch(query: string): Promise<SearchResult> {
  const cfg = await fatSecretConfig();
  if (!cfg) return { foods: [], error: "not-configured" };
  if (!query.trim()) return { foods: [] };
  const t = await token(cfg);
  if (!t) return { foods: [], error: "auth" };

  try {
    const url = `https://platform.fatsecret.com/rest/server.api?method=foods.search&format=json&max_results=12&search_expression=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${t}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { foods: [], error: "http" };
    const data = (await res.json()) as { foods?: { food?: FsFood | FsFood[] }; error?: FsError };

    // FatSecret answers 200 with an `error` object rather than an HTTP status —
    // most often code 21, the caller's IP is not on the API allow-list.
    const apiErr = errorOf(data.error);
    if (apiErr) return { foods: [], error: apiErr };

    const list = data.foods?.food;
    const foods = Array.isArray(list) ? list : list ? [list] : [];
    return {
      foods: foods.map((f) => ({
        id: String(f.food_id),
        name: [f.food_name, f.brand_name].filter(Boolean).join(" · "),
        per100: parsePer100(String(f.food_description ?? "")),
      })),
    };
  } catch {
    return { foods: [], error: "network" };
  }
}

/**
 * Look a food up by barcode (EAN/UPC/GTIN).
 *
 * Two hops: the barcode resolves to a food id, then the id to its nutrition.
 * Shorter codes are padded to the 13-digit GTIN the API expects. Same
 * allow-list rules as search — a barcode from a blocked IP is refused too.
 */
export async function fatSecretBarcode(barcode: string): Promise<SearchResult> {
  const cfg = await fatSecretConfig();
  if (!cfg) return { foods: [], error: "not-configured" };
  const digits = barcode.replace(/\D/g, "");
  if (digits.length < 6) return { foods: [] };
  const t = await token(cfg);
  if (!t) return { foods: [], error: "auth" };

  try {
    const gtin = digits.padStart(13, "0");
    const idUrl = `https://platform.fatsecret.com/rest/server.api?method=food.find_id_for_barcode&format=json&barcode=${gtin}`;
    const idRes = await fetch(idUrl, { headers: { authorization: `Bearer ${t}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!idRes.ok) return { foods: [], error: "http" };
    const idData = (await idRes.json()) as { food_id?: { value?: string } | string; error?: FsError };
    const apiErr = errorOf(idData.error);
    if (apiErr) return { foods: [], error: apiErr };

    const foodId = typeof idData.food_id === "object" ? idData.food_id?.value : idData.food_id;
    if (!foodId || foodId === "0") return { foods: [] }; // no product for this code

    const food = await fetchFood(String(foodId), t);
    return { foods: food ? [food] : [] };
  } catch {
    return { foods: [], error: "network" };
  }
}

/** Full nutrition for one food id, reduced to per-100g like a search match. */
async function fetchFood(foodId: string, t: string): Promise<FoodMatch | null> {
  const url = `https://platform.fatsecret.com/rest/server.api?method=food.get.v2&format=json&food_id=${foodId}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${t}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { food?: FsFoodFull };
  const food = data.food;
  if (!food) return null;

  const servings = food.servings?.serving;
  const list = Array.isArray(servings) ? servings : servings ? [servings] : [];
  // Prefer a serving measured in grams, so it scales to 100 g cleanly.
  const gram = list.find((s) => s.metric_serving_unit === "g" && Number(s.metric_serving_amount) > 0);
  let per100: FoodMatch["per100"] = null;
  if (gram) {
    const f = 100 / Number(gram.metric_serving_amount);
    per100 = {
      kcal: Math.round(Number(gram.calories) * f),
      protein: round1(Number(gram.protein) * f),
      fat: round1(Number(gram.fat) * f),
      carbs: round1(Number(gram.carbohydrate) * f),
    };
  }
  return { id: String(food.food_id), name: [food.food_name, food.brand_name].filter(Boolean).join(" · "), per100 };
}

/** Pull the offending IP out of "Invalid IP address detected: '1.2.3.4'". */
function ipFromMessage(msg: string | undefined): string {
  const m = /(\d{1,3}(?:\.\d{1,3}){3})/.exec(msg ?? "");
  return m ? m[1] : "";
}

/** Map a FatSecret error object to our error code, or null for none. */
function errorOf(error: FsError | undefined): string | undefined {
  if (!error) return undefined;
  if (error.code === 21) return "ip:" + ipFromMessage(error.message);
  return error.message ?? "api";
}

type FsError = { code?: number; message?: string };
type FsFood = { food_id: string | number; food_name?: string; brand_name?: string; food_description?: string };
type FsServing = { metric_serving_amount?: string; metric_serving_unit?: string; calories?: string; protein?: string; fat?: string; carbohydrate?: string };
type FsFoodFull = { food_id: string | number; food_name?: string; brand_name?: string; servings?: { serving?: FsServing | FsServing[] } };

/** "Per 100g - Calories: 52kcal | Fat: 0.17g | Carbs: 13.81g | Protein: 0.26g" → per-100g macros. */
function parsePer100(desc: string): FoodMatch["per100"] {
  const amount = /Per\s+([\d.]+)\s*g\b/i.exec(desc);
  const kcal = num(desc, /Calories?:\s*([\d.]+)\s*kcal/i);
  const fat = num(desc, /Fat:\s*([\d.]+)\s*g/i);
  const carbs = num(desc, /Carbs?:\s*([\d.]+)\s*g/i);
  const protein = num(desc, /Protein:\s*([\d.]+)\s*g/i);
  if (kcal === null) return null;
  // Scale to 100 g when the amount is a gram figure; otherwise take it as given.
  const base = amount ? Number(amount[1]) : 100;
  const f = base > 0 ? 100 / base : 1;
  return {
    kcal: Math.round((kcal ?? 0) * f),
    protein: round1((protein ?? 0) * f),
    fat: round1((fat ?? 0) * f),
    carbs: round1((carbs ?? 0) * f),
  };
}

function num(s: string, re: RegExp): number | null {
  const m = re.exec(s);
  return m ? Number(m[1]) : null;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
