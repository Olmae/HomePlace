/**
 * A line chart with more than one line.
 *
 * Still SVG rendered on the server, still no charting library — but where the
 * sparkline draws one anonymous line, this one draws several and says which is
 * which. That distinction is what makes "network in and out" or "CPU per core"
 * readable rather than a pile of wiggles.
 */

/** Series colours. Distinguishable in both themes and to the common forms of
 *  colour blindness; the legend carries the meaning either way. */
const COLOURS = [
  "rgb(var(--accent))",
  "rgb(var(--ok))",
  "rgb(var(--warn))",
  "rgb(var(--danger))",
  "rgb(var(--muted))",
];

export type ChartSeries = { label: string; points: [number, number][] };

export function Chart({
  series,
  height = 90,
  min,
  max,
  format = (v) => v.toFixed(1),
  legend = true,
}: {
  series: ChartSeries[];
  height?: number;
  min?: number;
  max?: number;
  format?: (value: number) => string;
  legend?: boolean;
}) {
  const usable = series.filter((s) => s.points.filter(([, v]) => Number.isFinite(v)).length > 1).slice(0, COLOURS.length);
  if (usable.length === 0) {
    return <div className="h-20 w-full rounded bg-raised" aria-hidden />;
  }

  const all = usable.flatMap((s) => s.points.map(([, v]) => v)).filter(Number.isFinite);
  const lo = min ?? Math.min(...all);
  const hi = max ?? Math.max(...all);
  const span = hi - lo || 1;
  const width = 100;

  // Every series is drawn on the same time axis, taken from the widest one, so
  // two metrics with different sample counts still line up.
  const start = Math.min(...usable.map((s) => s.points[0][0]));
  const end = Math.max(...usable.map((s) => s.points.at(-1)![0]));
  const timeSpan = end - start || 1;

  const path = (points: [number, number][]) =>
    points
      .filter(([, v]) => Number.isFinite(v))
      .map(([t, v], i) => {
        const x = ((t - start) / timeSpan) * width;
        const y = height - ((v - lo) / span) * height;
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-24 w-full" role="img" aria-hidden>
        {/* Two faint guides at a third and two thirds: enough to judge a slope,
            not enough to become graph paper. */}
        {[0.33, 0.66].map((f) => (
          <line
            key={f}
            x1="0"
            x2={width}
            y1={height * f}
            y2={height * f}
            stroke="rgb(var(--line))"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {usable.length === 1 && (
          <path d={`${path(usable[0].points)} L${width},${height} L0,${height} Z`} fill={COLOURS[0]} opacity="0.12" />
        )}

        {usable.map((s, i) => (
          <path
            key={s.label}
            d={path(s.points)}
            fill="none"
            stroke={COLOURS[i]}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      {legend && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {usable.map((s, i) => {
            const last = s.points.filter(([, v]) => Number.isFinite(v)).at(-1)?.[1];
            return (
              <span key={s.label} className="flex items-center gap-1.5 text-[11px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COLOURS[i] }} aria-hidden />
                <span className="max-w-[10rem] truncate text-muted">{s.label}</span>
                {last !== undefined && <span className="font-mono tabular-nums">{format(last)}</span>}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
