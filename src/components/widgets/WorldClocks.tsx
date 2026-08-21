"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui";

/**
 * Several time zones at once.
 *
 * Client-side for the same reason the single clock is: a server render is wrong
 * the instant it arrives. Each zone shows its time and how far ahead or behind
 * the viewer it is, which is the thing you actually want to know before you call
 * someone in another country.
 */
export function WorldClocks({ title, zones }: { title: string; zones: string[] }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader title={title} icon="🕐" />
      <div className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
        {zones.length === 0 && <p className="p-4 text-sm text-muted">—</p>}
        {zones.map((zone) => (
          <div key={zone} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{label(zone)}</p>
              <p className="text-[11px] text-faint">{now ? offset(zone, now) : " "}</p>
            </div>
            <p className="shrink-0 font-mono text-lg tabular-nums">
              {now ? now.toLocaleTimeString(undefined, { timeZone: zone, hour: "2-digit", minute: "2-digit" }) : "--:--"}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** "Europe/Moscow" → "Moscow". */
function label(zone: string): string {
  const city = zone.split("/").pop() ?? zone;
  return city.replace(/_/g, " ");
}

/** How far ahead/behind the viewer this zone is, as "+3h" / "-5h" / "same". */
function offset(zone: string, now: Date): string {
  try {
    const there = Number(now.toLocaleString("en-US", { timeZone: zone, hour: "numeric", hour12: false, minute: "2-digit" }).split(":")[0]);
    const here = now.getHours();
    let diff = there - here;
    if (diff > 12) diff -= 24;
    if (diff < -12) diff += 24;
    if (diff === 0) return "same time";
    return `${diff > 0 ? "+" : ""}${diff}h`;
  } catch {
    return "";
  }
}
