"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui";
import type { HaCamera } from "@/lib/services";
import type { Dictionary } from "@/i18n";

/**
 * Home Assistant cameras on the board.
 *
 * A grid of snapshots, refreshed on a timer — a still every few seconds is
 * enough to glance at the door or the yard, and far lighter than a live stream.
 * The image URL is cache-busted each tick so the browser fetches a fresh frame
 * rather than the one it already has.
 */
export function Cameras({ d, title, cameras, refreshSeconds }: { d: Dictionary; title: string; cameras: HaCamera[]; refreshSeconds: number }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const every = Math.max(2, refreshSeconds || 10) * 1000;
    const id = setInterval(() => setTick((t) => t + 1), every);
    return () => clearInterval(id);
  }, [refreshSeconds]);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader title={title} icon="📷" />
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {cameras.length === 0 ? (
          <p className="p-2 text-sm text-muted">{d.widgets.noData}</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {cameras.map((c) => (
              <div key={c.id} className="overflow-hidden rounded-control border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${c.url}${c.url.includes("?") ? "&" : "?"}_=${tick}`}
                  alt={c.name}
                  className="aspect-video w-full bg-raised object-cover"
                  loading="lazy"
                />
                <div className="truncate px-2 py-1 text-[11px] text-muted">{c.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
