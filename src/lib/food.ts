import "server-only";
import { fatSecretSearch, fatSecretBarcode, fatSecretConfig, type SearchResult } from "./fatsecret";
import { offSearch, offBarcode } from "./openfoodfacts";

/**
 * The diary's food lookup, over whatever source can answer.
 *
 * FatSecret is preferred when it is configured and reachable — that is where the
 * КБЖУ come from once its API allow-list has the server's IP. When it is not
 * configured, or refuses the IP, or simply has no match, the query falls through
 * to Open Food Facts, which needs no key and no whitelist. Callers get one
 * SearchResult and never have to care which database produced it.
 */

async function withFallback(fs: () => Promise<SearchResult>, off: () => Promise<SearchResult>): Promise<SearchResult> {
  if (await fatSecretConfig()) {
    const primary = await fs();
    if (primary.foods.length > 0) return primary; // FatSecret had it → its КБЖУ win
    const alt = await off();
    if (alt.foods.length > 0) return alt; // fill the gap (blocked IP, or no match there)
    // Nothing anywhere: prefer a clean "not found" over a stale API error.
    return alt.error ? primary : alt;
  }
  return off();
}

export function foodSearch(query: string): Promise<SearchResult> {
  return withFallback(() => fatSecretSearch(query), () => offSearch(query));
}

export async function foodByBarcode(barcode: string): Promise<SearchResult> {
  const res = await withFallback(() => fatSecretBarcode(barcode), () => offBarcode(barcode));

  // A barcode often resolves to a product that carries no nutrition — a regional
  // or limited edition (Red Bull's peach flavour, say) that nobody has filled in.
  // Rather than a dead "no КБЖУ", look the name up: the plain product almost
  // always exists with real numbers, and the caller can pick it.
  const hasMacros = res.foods.some((f) => f.per100);
  if (!hasMacros && res.foods[0]?.name) {
    const byName = await foodSearch(res.foods[0].name);
    if (byName.foods.some((f) => f.per100)) return byName;
  }
  return res;
}
