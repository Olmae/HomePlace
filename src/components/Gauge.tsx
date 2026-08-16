/**
 * A dial for a single number.
 *
 * A bar answers "how full"; a dial answers it at a glance from across the room,
 * which is what a wall-mounted or always-open dashboard is for. Drawn as an SVG
 * arc on the server, like the sparkline — no library, no hydration.
 */
export function Gauge({
  value,
  min = 0,
  max = 100,
  label,
  caption,
  thresholds = { warn: 75, danger: 90 },
}: {
  value: number | null;
  min?: number;
  max?: number;
  /** Big text in the middle. */
  label: string;
  /** Small text under it. */
  caption?: string;
  /** Where the arc turns amber and red, in the same units as `value`. */
  thresholds?: { warn: number; danger: number };
}) {
  const span = max - min || 1;
  const ratio = value === null ? 0 : Math.max(0, Math.min(1, (value - min) / span));

  // A 240° arc, opening downwards: the gap at the bottom is what makes it read
  // as a gauge rather than a pie chart.
  const START = 150;
  const SWEEP = 240;
  const radius = 42;
  const centre = 50;

  const point = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    return [centre + radius * Math.cos(rad), centre + radius * Math.sin(rad)] as const;
  };

  const [x0, y0] = point(START);
  const [x1, y1] = point(START + SWEEP);
  const [xv, yv] = point(START + SWEEP * ratio);

  const tone =
    value === null
      ? "rgb(var(--faint))"
      : value >= thresholds.danger
        ? "rgb(var(--danger))"
        : value >= thresholds.warn
          ? "rgb(var(--warn))"
          : "rgb(var(--accent))";

  return (
    <div className="relative flex items-center justify-center">
      <svg viewBox="0 0 100 78" className="w-full max-w-[10rem]" role="img" aria-hidden>
        <path
          d={`M${x0},${y0} A${radius},${radius} 0 1 1 ${x1},${y1}`}
          fill="none"
          stroke="rgb(var(--line))"
          strokeWidth="8"
          strokeLinecap="round"
        />
        {value !== null && ratio > 0 && (
          <path
            d={`M${x0},${y0} A${radius},${radius} 0 ${SWEEP * ratio > 180 ? 1 : 0} 1 ${xv},${yv}`}
            fill="none"
            stroke={tone}
            strokeWidth="8"
            strokeLinecap="round"
          />
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center pt-2 text-center">
        <span className="font-mono text-xl tabular-nums">{label}</span>
        {caption && <span className="text-[11px] text-muted">{caption}</span>}
      </div>
    </div>
  );
}
