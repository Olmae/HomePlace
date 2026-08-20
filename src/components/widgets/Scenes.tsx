"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ui";
import { toggleEntity } from "@/actions/services";
import { prettyName } from "@/lib/haFormat";
import type { Dictionary } from "@/i18n";

export type SceneItem = { id: string; name: string; domain: string };

/**
 * Scenes and scripts as buttons.
 *
 * A scene or a script is not a thing with a state to read — it is a thing you
 * run: "movie night", "everything off", "good morning". So this is a grid of
 * buttons, and pressing one fires it and flashes to say it went, rather than a
 * row of switches pretending they can be turned back off.
 */
export function Scenes({
  d,
  title,
  items,
  canControl,
}: {
  d: Dictionary;
  title: string;
  items: SceneItem[];
  canControl: boolean;
}) {
  const [ran, setRan] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(id: string) {
    if (!canControl) return;
    setRan(id);
    setTimeout(() => setRan((cur) => (cur === id ? null : cur)), 1200);
    startTransition(() => void toggleEntity(id));
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader title={title} icon="🎬" />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted">{d.widgets.noScenes}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={!canControl}
                onClick={() => run(item.id)}
                className={`flex items-center gap-2 rounded-control border px-2.5 py-2 text-left transition-colors disabled:cursor-default ${
                  ran === item.id ? "border-accent bg-accent/10 text-accent" : "border-line hover:border-accent hover:bg-raised"
                }`}
              >
                <span className="text-base leading-none" aria-hidden>
                  {item.domain === "script" ? "📜" : "🎬"}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{prettyName(item.id, item.name)}</span>
                {ran === item.id && <span className="shrink-0 text-accent">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
