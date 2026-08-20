"use client";

import { useMemo, useState } from "react";
import { bytes, percent } from "@/lib/format";

/**
 * Every container's consumption on one chart, the way Grafana shows it.
 *
 * A grid of small charts answers "how is this one container doing"; this
 * answers the question you actually arrive with — "what is eating the machine
 * right now, and what is under it" — by stacking every container into one band
 * and letting the eye read the total and the composition at once.
 *
 * Hovering drops a crosshair and lists every container at that instant, sorted
 * heaviest first with the top consumer picked out, and dims every band except
 * the one under the pointer so it can be traced through the stack. The colour of
 * each band is stable for the session, derived from the name, so a container
 * keeps its colour as the list re-sorts.
 */

export type LoadSeries = { name: string; points: [number, number][] };

const W = 1000; // viewBox width; the SVG scales to its box

export function ContainerLoadChart({
  series,
  unit,
  height = 220,
}: {
  series: LoadSeries[];
  unit: "percent" | "bytes";
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const format = (v: number) => (unit === "bytes" ? bytes(v) : percent(v, 1));

  const model = useMemo(() => build(series), [series]);
  if (!model) return null;

  const { axis, stacked, maxTotal, colours, order } = model;
  const n = axis.length;
  const x = (j: number) => (n <= 1 ? 0 : (j / (n - 1)) * W);
  const y = (v: number) => height - (maxTotal <= 0 ? 0 : (v / maxTotal) * height);

  // Values at the hovered instant, heaviest first — the readout.
  const at = hover !== null ? hover : n - 1;
  const readout = order
    .map((name) => ({ name, value: stacked.get(name)![at].value, colour: colours.get(name)! }))
    .filter((r) => r.value > 0.0001)
    .sort((a, b) => b.value - a.value);

  const hoverLeftPct = n <= 1 ? 0 : (at / (n - 1)) * 100;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height }}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const j = Math.round(((e.clientX - box.left) / box.width) * (n - 1));
          setHover(Math.max(0, Math.min(n - 1, j)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {/* Bottom-to-top: the biggest band is drawn first and sits under the
            rest, so the stack does not shuffle as smaller ones come and go. */}
        {order.map((name) => {
          const band = stacked.get(name)!;
          const top = band.map((p, j) => `${x(j).toFixed(1)},${y(p.top).toFixed(1)}`);
          const bottom = band.map((p, j) => `${x(j).toFixed(1)},${y(p.base).toFixed(1)}`).reverse();
          const d = `M${top.join(" L")} L${bottom.join(" L")} Z`;
          const dim = active !== null && active !== name;
          return (
            <path
              key={name}
              d={d}
              fill={colours.get(name)}
              opacity={dim ? 0.15 : active === name ? 0.95 : 0.72}
              stroke={colours.get(name)}
              strokeWidth={active === name ? 1.5 : 0.5}
              vectorEffect="non-scaling-stroke"
              onPointerEnter={() => setActive(name)}
              onPointerLeave={() => setActive(null)}
            />
          );
        })}

        {hover !== null && (
          <line
            x1={x(at)}
            x2={x(at)}
            y1={0}
            y2={height}
            stroke="rgb(var(--text) / 0.5)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* The Grafana-style readout: every container at this instant, heaviest
          first, the top one marked. Follows the crosshair and flips side near
          the right edge so it never runs off. */}
      {hover !== null && readout.length > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 max-h-full w-56 overflow-hidden rounded-control border border-line bg-surface/95 p-2 text-xs shadow-pop backdrop-blur"
          style={hoverLeftPct > 55 ? { right: `${100 - hoverLeftPct}%`, marginRight: 8 } : { left: `${hoverLeftPct}%`, marginLeft: 8 }}
        >
          <p className="mb-1 font-mono text-[10px] text-faint">
            {new Date(axis[at]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
          <ul className="space-y-0.5">
            {readout.slice(0, 12).map((r, i) => (
              <li
                key={r.name}
                className={`flex items-center gap-1.5 ${i === 0 ? "font-semibold" : ""} ${
                  active === r.name ? "text-accent" : ""
                }`}
              >
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: r.colour }} aria-hidden />
                <span className="truncate">{r.name}</span>
                <span className="ml-auto shrink-0 font-mono tabular-nums">{format(r.value)}</span>
              </li>
            ))}
            {readout.length > 12 && <li className="text-[10px] text-faint">+{readout.length - 12}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

type Model = {
  axis: number[];
  /** name → per-sample base/top of its band, and its value. */
  stacked: Map<string, { base: number; top: number; value: number }[]>;
  maxTotal: number;
  colours: Map<string, string>;
  /** Stacking order, largest total at the bottom. */
  order: string[];
};

function build(series: LoadSeries[]): Model | null {
  const withData = series.filter((s) => s.points.length > 1);
  if (withData.length === 0) return null;

  // A shared time axis: the longest series' timestamps. Others are read by
  // index, which is what queryRange's aligned samples make safe.
  const axis = withData.reduce((a, b) => (b.points.length > a.length ? b.points.map((p) => p[0]) : a), [] as number[]);
  const n = axis.length;

  const total = (s: LoadSeries) => s.points.reduce((sum, p) => sum + (p[1] || 0), 0);
  const order = [...withData].sort((a, b) => total(b) - total(a)).map((s) => s.name);
  const byName = new Map(withData.map((s) => [s.name, s]));

  const stacked = new Map<string, { base: number; top: number; value: number }[]>();
  let maxTotal = 0;

  for (let j = 0; j < n; j++) {
    let base = 0;
    for (const name of order) {
      const pts = byName.get(name)!.points;
      const value = Math.max(0, pts[j]?.[1] ?? pts[pts.length - 1]?.[1] ?? 0);
      const band = stacked.get(name) ?? [];
      band.push({ base, top: base + value, value });
      stacked.set(name, band);
      base += value;
    }
    if (base > maxTotal) maxTotal = base;
  }

  const colours = new Map(order.map((name) => [name, colourFor(name)]));
  return { axis, stacked, maxTotal, colours, order };
}

/** A stable colour per name — same hue every render, spread around the wheel. */
function colourFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  const hue = hash % 360;
  return `hsl(${hue} 65% 55%)`;
}
