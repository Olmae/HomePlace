"use client";

import { useMemo, useRef, useState } from "react";
import { bytes, percent } from "@/lib/format";
import type { Dictionary } from "@/i18n";

/**
 * The Sparkline, but it answers questions when you point at it.
 *
 * The server-rendered Sparkline draws the shape of a series and nothing else —
 * good enough for a tile, not enough for the monitoring page, where the value
 * under the cursor is the whole reason to look. This is a client component: it
 * keeps the same SVG the Sparkline draws, and adds a crosshair, a dot and a
 * tooltip that reads out the moment you are hovering, plus a one-line summary
 * of now / average / peak underneath so the important numbers are there before
 * you touch it.
 */
export type ChartUnit = "percent" | "bytes" | "number" | "bytesPerSecond";

function fmt(unit: ChartUnit, v: number): string {
  if (unit === "percent") return percent(v, 1);
  if (unit === "bytes") return bytes(v);
  if (unit === "bytesPerSecond") return `${bytes(v)}/s`;
  return v.toFixed(2);
}

const STROKE: Record<string, string> = {
  accent: "rgb(var(--accent))",
  ok: "rgb(var(--ok))",
  warn: "rgb(var(--warn))",
  danger: "rgb(var(--danger))",
};

export function HoverChart({
  d,
  points,
  unit = "number",
  tone = "accent",
  min,
  max,
  height = 96,
  summary = true,
}: {
  d: Dictionary;
  /** [timestamp(ms), value] pairs, oldest first. */
  points: [number, number][];
  unit?: ChartUnit;
  tone?: "accent" | "ok" | "warn" | "danger";
  min?: number;
  max?: number;
  height?: number;
  summary?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const clean = useMemo(() => points.filter(([, v]) => Number.isFinite(v)), [points]);

  const stats = useMemo(() => {
    if (clean.length === 0) return null;
    const values = clean.map(([, v]) => v);
    return {
      now: values[values.length - 1],
      avg: values.reduce((s, v) => s + v, 0) / values.length,
      peak: Math.max(...values),
    };
  }, [clean]);

  if (clean.length < 2) {
    return <div className="h-24 w-full rounded bg-raised" aria-hidden />;
  }

  const width = 100;
  const values = clean.map(([, v]) => v);
  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const span = hi - lo || 1;
  const step = width / (clean.length - 1);

  const coords = clean.map(([, v], i) => {
    const x = i * step;
    const y = height - ((v - lo) / span) * height;
    return [x, Number.isFinite(y) ? y : height] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const stroke = STROKE[tone];

  const active = hover !== null ? clean[hover] : null;
  const activeXY = hover !== null ? coords[hover] : null;
  // The tooltip is placed as a fraction of the box width, so it tracks the
  // point without the SVG's non-scaling coordinate system getting in the way.
  const leftPct = hover !== null ? (hover / (clean.length - 1)) * 100 : 0;
  // Where the point sits vertically, as a fraction of the box. When it is high
  // — a spike near the top — the tooltip would otherwise cover the very peak
  // being inspected, so it flips to sit below the point instead of above it.
  const pointTopPct = activeXY ? (activeXY[1] / height) * 100 : 0;
  const below = pointTopPct < 34;

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = box.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(ratio * (clean.length - 1)));
  }

  return (
    <div>
      <div
        ref={box}
        className="relative w-full touch-none"
        style={{ height }}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-hidden
        >
          <path d={area} fill={stroke} opacity="0.12" />
          <path
            d={line}
            fill="none"
            stroke={stroke}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
          {activeXY && (
            <>
              <line
                x1={activeXY[0]}
                y1={0}
                x2={activeXY[0]}
                y2={height}
                stroke="rgb(var(--line))"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={activeXY[0]} cy={activeXY[1]} r="2.5" fill={stroke} vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-control border border-line bg-surface px-2 py-1 text-[11px] shadow-pop"
            style={{
              left: `${Math.min(88, Math.max(12, leftPct))}%`,
              top: `${pointTopPct}%`,
              // Above the point by default; below it when the point is near the
              // top, so the readout never sits on top of the peak.
              transform: `translate(-50%, ${below ? "12px" : "calc(-100% - 12px)"})`,
            }}
          >
            <span className="font-mono tabular-nums">{fmt(unit, active[1])}</span>
            <span className="ml-1.5 text-faint">
              {new Date(active[0]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        )}
      </div>

      {summary && stats && (
        <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums text-faint">
          <span>
            {d.monitoring.now} <span className="text-muted">{fmt(unit, stats.now)}</span>
          </span>
          <span>
            {d.monitoring.avg} <span className="text-muted">{fmt(unit, stats.avg)}</span>
          </span>
          <span>
            {d.monitoring.peak} <span className="text-muted">{fmt(unit, stats.peak)}</span>
          </span>
        </div>
      )}
    </div>
  );
}
