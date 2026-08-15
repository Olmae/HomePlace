import { en, type Dictionary } from "./en";
import { ru } from "./ru";

export const locales = ["en", "ru"] as const;
export type Locale = (typeof locales)[number];

export const localeNames: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
};

const dictionaries: Record<Locale, Dictionary> = { en, ru };

export function isLocale(v: string | undefined | null): v is Locale {
  return v === "en" || v === "ru";
}

/**
 * The whole dictionary for a locale. Components receive it as a prop, which
 * keeps translation out of the client bundle boundary problem: server and
 * client components read the same plain object.
 */
export function dict(locale: string | undefined | null): Dictionary {
  return dictionaries[isLocale(locale) ? locale : "en"];
}

/** Fill {placeholders} in a translated string. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}

/**
 * Resolve a dotted key ("setup.passwordTooShort") against a dictionary.
 *
 * Server actions return keys rather than sentences: the action does not know
 * which language the browser is showing, and a key survives being passed
 * through a form state where a translated string would freeze the wrong locale.
 */
export function lookup(d: Dictionary, key: string | undefined): string | undefined {
  if (!key) return undefined;
  let node: unknown = d;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return key;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : key;
}

export type { Dictionary };
