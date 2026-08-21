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

export async function fatSecretSearch(query: string): Promise<FoodMatch[]> {
  const cfg = await fatSecretConfig();
  if (!cfg || !query.trim()) return [];
  const t = await token(cfg);
  if (!t) return [];

  try {
    const url = `https://platform.fatsecret.com/rest/server.api?method=foods.search&format=json&max_results=12&search_expression=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${t}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { foods?: { food?: FsFood | FsFood[] } };
    const list = data.foods?.food;
    const foods = Array.isArray(list) ? list : list ? [list] : [];
    return foods.map((f) => ({
      id: String(f.food_id),
      name: [f.food_name, f.brand_name].filter(Boolean).join(" · "),
      per100: parsePer100(String(f.food_description ?? "")),
    }));
  } catch {
    return [];
  }
}

type FsFood = { food_id: string | number; food_name?: string; brand_name?: string; food_description?: string };

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
