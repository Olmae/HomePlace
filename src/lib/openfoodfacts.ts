import "server-only";
import type { FoodMatch, SearchResult } from "./fatsecret";

/**
 * Open Food Facts — a free, open food database.
 *
 * The reason it is here: FatSecret's search only answers from allow-listed IPs,
 * which a home server (often on a changing address) cannot reliably keep on the
 * list. Open Food Facts needs no key and no whitelist, and it is barcode-first —
 * exactly what a phone camera wants. So it is the fallback that makes scanning
 * work out of the box, and FatSecret is preferred when it is actually reachable.
 *
 * Everything is normalised to the same per-100g FoodMatch the rest of the diary
 * speaks, so neither the widget nor the bot has to know where a food came from.
 */

const UA = "HomePlace/1.0 (self-hosted home dashboard)";

/** One product by barcode (EAN/UPC/GTIN). */
export async function offBarcode(barcode: string): Promise<SearchResult> {
  const digits = barcode.replace(/\D/g, "");
  if (digits.length < 6) return { foods: [] };
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${digits}.json?fields=product_name,product_name_ru,brands,nutriments`;
    const res = await fetch(url, { headers: { "user-agent": UA }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { foods: [], error: "http" };
    const data = (await res.json()) as { status?: number; product?: OffProduct };
    if (data.status !== 1 || !data.product) return { foods: [] }; // no product for this code
    const match = toMatch(digits, data.product);
    return { foods: match ? [match] : [] };
  } catch {
    return { foods: [], error: "network" };
  }
}

/**
 * Free-text search. Looser than FatSecret's, but keyless and unrestricted.
 *
 * Uses the newer Search-a-licious service, not the legacy cgi/search.pl — the
 * old endpoint is frequently overloaded and answers with an HTML error page,
 * while this one is a proper JSON API with the same nutriment field names.
 */
export async function offSearch(query: string): Promise<SearchResult> {
  if (!query.trim()) return { foods: [] };
  try {
    const url =
      `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}` +
      `&page_size=15&fields=code,product_name,product_name_ru,brands,nutriments`;
    const res = await fetch(url, { headers: { "user-agent": UA }, cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!res.ok) return { foods: [], error: "http" };
    const data = (await res.json()) as { hits?: OffProduct[] };
    const products = Array.isArray(data.hits) ? data.hits : [];
    const foods: FoodMatch[] = [];
    for (const p of products) {
      const m = toMatch(String(p.code ?? ""), p);
      // A search result with no nutrition is noise here — the point is the KБЖУ.
      if (m && m.per100) foods.push(m);
      if (foods.length >= 12) break;
    }
    return { foods };
  } catch {
    return { foods: [], error: "network" };
  }
}

type OffNutriments = Record<string, number | string | undefined>;
// `brands` is a string from the product API and an array from the search
// service — accept either.
type OffProduct = { code?: string; product_name?: string; product_name_ru?: string; brands?: string | string[]; nutriments?: OffNutriments };

function toMatch(id: string, p: OffProduct): FoodMatch | null {
  const brand = (Array.isArray(p.brands) ? p.brands[0] : p.brands)?.trim();
  const name = (p.product_name_ru || p.product_name || brand || "").trim();
  if (!name) return null;
  const full = brand && !name.includes(brand) ? `${name} · ${brand}` : name;
  return { id: id || name, name: full.slice(0, 120), per100: per100(p.nutriments) };
}

function per100(n: OffNutriments | undefined): FoodMatch["per100"] {
  if (!n) return null;
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal == null) {
    const kj = num(n["energy_100g"]); // some products carry only kilojoules
    if (kj != null) kcal = Math.round(kj / 4.184);
  }
  if (kcal == null) return null;
  return {
    kcal: Math.round(kcal),
    protein: round1(num(n["proteins_100g"]) ?? 0),
    fat: round1(num(n["fat_100g"]) ?? 0),
    carbs: round1(num(n["carbohydrates_100g"]) ?? 0),
  };
}

function num(v: number | string | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
