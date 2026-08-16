"use client";

import { useState, useTransition } from "react";
import { toggleEntity } from "@/actions/services";
import type { Dictionary } from "@/i18n";

export type Entity = { id: string; name: string; state: string; unit?: string; domain: string; toggleable: boolean };

/**
 * Home Assistant entities, switchable from the board.
 *
 * The state shown flips as soon as the request goes out rather than waiting for
 * the next page refresh — a light switch that takes thirty seconds to admit it
 * was pressed feels broken even when it worked. If the call fails, the optimism
 * is undone and the error is shown.
 */
export function HaControls({ d, entities }: { d: Dictionary; entities: Entity[] }) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function flip(entity: Entity) {
    if (!entity.toggleable) return;
    const before = overrides[entity.id] ?? entity.state;
    const after = before === "on" ? "off" : "on";
    setOverrides((prev) => ({ ...prev, [entity.id]: after }));
    setError(null);

    startTransition(async () => {
      const result = await toggleEntity(entity.id);
      if (!result.ok) {
        setOverrides((prev) => ({ ...prev, [entity.id]: before }));
        setError(result.error ?? d.common.error);
      }
    });
  }

  return (
    <div className="space-y-1">
      {error && <p className="px-2 text-xs text-danger">{error}</p>}

      {entities.map((entity) => {
        const state = overrides[entity.id] ?? entity.state;
        const on = state === "on" || state === "home" || state === "open";

        return (
          <div key={entity.id} className="flex items-center gap-2 rounded-control px-2 py-1.5 hover:bg-raised">
            <span className="min-w-0 flex-1 truncate text-sm">{entity.name}</span>

            {entity.toggleable ? (
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={entity.name}
                disabled={pending}
                onClick={() => flip(entity)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                  on ? "bg-accent" : "bg-line"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface transition-transform ${
                    on ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
            ) : (
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                {state}
                {entity.unit ? ` ${entity.unit}` : ""}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
