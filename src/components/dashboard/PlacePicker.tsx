"use client";

import { useState, useTransition } from "react";
import { Input, Button } from "@/components/form";
import { searchPlace } from "@/actions/weather";
import type { Dictionary } from "@/i18n";

/**
 * Find a city by name for the weather widget.
 *
 * Nobody knows their own coordinates, and asking for them would make the widget
 * something only a certain kind of person configures. The lookup runs on the
 * server so the browser never talks to the geocoder directly.
 */
export function PlacePicker({
  d,
  value,
  onPick,
}: {
  d: Dictionary;
  value: string;
  onPick: (place: { name: string; latitude: number; longitude: number }) => void;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<{ name: string; latitude: number; longitude: number; country: string }[]>([]);
  const [pending, startTransition] = useTransition();

  function search() {
    startTransition(async () => setResults(await searchPlace(query)));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder={d.widgets.searchPlace}
          className="flex-1"
        />
        <Button disabled={pending || !query.trim()} onClick={search}>
          {d.common.search}
        </Button>
      </div>

      {results.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-control border border-line">
          {results.map((r) => (
            <li key={`${r.latitude},${r.longitude}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(r);
                  setQuery(r.name);
                  setResults([]);
                }}
                className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-raised"
              >
                <span>{r.name}</span>
                <span className="text-xs text-faint">{r.country}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
