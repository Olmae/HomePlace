/**
 * Readable identifiers for dashboards.
 *
 * `/?tab=home` instead of `/?tab=cmsv141a90002hzpvzcf6vmz3`. The panel is
 * something people bookmark and set as a browser home page, and a URL you can
 * read is a URL you can retype, share and recognise in a list of tabs.
 *
 * Cyrillic is transliterated rather than percent-encoded: «Дом» should become
 * `dom`, not `%D0%94%D0%BE%D0%BC`.
 */

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function slugify(input: string): string {
  const lower = input.trim().toLowerCase();
  let out = "";
  for (const char of lower) {
    if (TRANSLIT[char] !== undefined) out += TRANSLIT[char];
    else if (/[a-z0-9]/.test(char)) out += char;
    else out += "-";
  }
  return out.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

/**
 * A slug not already taken. Falls back to a numeric suffix, and to the id when
 * the name produces nothing usable at all (a dashboard called "🎬").
 */
export function uniqueSlug(name: string, taken: string[], fallback: string): string {
  const base = slugify(name) || slugify(fallback) || "tab";
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
