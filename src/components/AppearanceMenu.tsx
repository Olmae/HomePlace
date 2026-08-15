"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePreferences } from "@/actions/auth";
import { locales, localeNames, type Dictionary } from "@/i18n";

const themes = ["system", "light", "dark"] as const;
const accents = ["default", "green", "amber", "violet", "rose", "slate"] as const;

/**
 * Theme, accent and language.
 *
 * The choice is applied to <html> immediately and saved to the account in the
 * background: waiting for a round-trip before the colours change makes the
 * whole panel feel slow, and the server render on the next navigation produces
 * exactly the same attributes.
 */
export function AppearanceMenu({ d }: { d: Dictionary }) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function apply(next: { theme?: string; accent?: string; locale?: string }) {
    const root = document.documentElement;
    if (next.theme) {
      if (next.theme === "system") root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", next.theme);
    }
    if (next.accent) {
      if (next.accent === "default") root.removeAttribute("data-accent");
      else root.setAttribute("data-accent", next.accent);
    }

    const form = new FormData();
    for (const [k, v] of Object.entries(next)) if (v) form.set(k, v);
    startTransition(async () => {
      await updatePreferences(form);
      // Language lives in server-rendered strings, so it needs a refresh;
      // colours are already correct on the client.
      if (next.locale) router.refresh();
    });
  }

  const current = typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme") ?? "system" : "system";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-control px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-raised hover:text-text"
        title={d.nav.theme}
        aria-expanded={open}
      >
        {/* Half-filled circle: the same glyph reads correctly in both themes. */}
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="inline-block">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-1 w-60 rounded-card border border-line bg-surface p-3 shadow-pop">
            <p className="mb-1.5 text-xs font-medium text-muted">{d.nav.theme}</p>
            <div className="mb-3 flex gap-1">
              {themes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => apply({ theme: t })}
                  className={`flex-1 rounded-control border px-2 py-1.5 text-xs transition-colors ${
                    current === t ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:bg-raised"
                  }`}
                >
                  {d.theme[t]}
                </button>
              ))}
            </div>

            <p className="mb-1.5 text-xs font-medium text-muted">{d.theme.accent}</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {accents.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => apply({ accent: a })}
                  title={d.theme.accents[a]}
                  aria-label={d.theme.accents[a]}
                  className="h-6 w-6 rounded-full border border-line transition-transform hover:scale-110"
                  style={{ backgroundColor: accentSwatch[a] }}
                />
              ))}
            </div>

            <p className="mb-1.5 text-xs font-medium text-muted">{d.nav.language}</p>
            <div className="flex gap-1">
              {locales.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => apply({ locale: l })}
                  className="flex-1 rounded-control border border-line px-2 py-1.5 text-xs text-muted transition-colors hover:bg-raised"
                >
                  {localeNames[l]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Swatches for the picker only. The real accents are CSS variables in
// globals.css, which shift slightly between light and dark.
const accentSwatch: Record<string, string> = {
  default: "#326dff",
  green: "#1a9b64",
  amber: "#c2800e",
  violet: "#7c5cf5",
  rose: "#d63e6c",
  slate: "#525e70",
};
