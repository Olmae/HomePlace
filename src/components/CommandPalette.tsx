"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TileIcon } from "./TileIcon";
import type { SearchHit } from "@/app/api/search/route";
import type { Dictionary } from "@/i18n";

/**
 * Ctrl+K: type a few letters, hit Enter, be somewhere else.
 *
 * On a page kept open all day this beats every other navigation. The list is
 * fetched when the palette opens rather than kept in memory, so a container
 * started thirty seconds ago is already in it.
 */
export function CommandPalette({ d }: { d: Dictionary }) {
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    // A custom event lets the search button in the top bar open the same
    // palette without lifting its state into a context nothing else needs.
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("homeplace:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("homeplace:palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setCursor(0);
    inputRef.current?.focus();
    fetch("/api/search", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setHits(data.hits ?? []))
      .catch(() => setHits([]));
  }, [open]);

  /**
   * Subsequence matching, not substring: "jf" finds "jellyfin" and "prox sto"
   * finds "proxmox storage". It is what everyone now expects from a palette,
   * and it costs a dozen lines.
   */
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return hits.slice(0, 30);
    return hits
      .map((hit) => ({ hit, score: score(`${hit.title} ${hit.subtitle ?? ""}`.toLowerCase(), needle) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((r) => r.hit);
  }, [hits, q]);

  const go = useCallback(
    (hit: SearchHit) => {
      setOpen(false);
      if (hit.external) window.open(hit.href, "_blank", "noreferrer");
      else router.push(hit.href);
    },
    [router]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-card border border-line bg-surface shadow-pop">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(filtered.length - 1, c + 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            }
            if (e.key === "Enter" && filtered[cursor]) {
              e.preventDefault();
              go(filtered[cursor]);
            }
          }}
          placeholder={d.common.search}
          className="w-full border-b border-line bg-transparent px-4 py-3 text-sm outline-none placeholder:text-faint"
        />

        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {filtered.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">{d.widgets.noData}</li>}
          {filtered.map((hit, i) => (
            <li key={hit.id}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(hit)}
                className={`flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors ${
                  i === cursor ? "bg-raised" : ""
                }`}
              >
                <TileIcon icon={hit.icon} title={hit.title} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{hit.title}</span>
                  {hit.subtitle && <span className="block truncate text-[11px] text-faint">{hit.subtitle}</span>}
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-faint">{hit.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Rough relevance: characters of the query must appear in order. A match at a
 * word boundary counts for more, which is what makes "gr" rank Grafana above
 * "postgres".
 */
function score(haystack: string, needle: string): number {
  let index = 0;
  let points = 0;
  for (const char of needle) {
    if (char === " ") continue;
    const found = haystack.indexOf(char, index);
    if (found === -1) return 0;
    points += found === 0 || haystack[found - 1] === " " ? 3 : 1;
    index = found + 1;
  }
  // Shorter names win ties: "plex" should beat "plex-meta-manager".
  return points + Math.max(0, 20 - haystack.length) / 20;
}
