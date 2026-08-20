/**
 * Line icons for the container row controls.
 *
 * The row used to carry a little crowd of emoji — 🪵 ▶️ ⏹️ 🔁 ↗ ＋ — each from a
 * different visual family and each a different weight, so the control strip
 * read as clutter. These are one hand: `currentColor`, a 1.7 stroke on a
 * 24-unit grid, sized 4×4, so they inherit the button's colour and sit evenly
 * next to each other.
 */
type IconProps = { className?: string };

function Svg({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-4 w-4"}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function LogsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 6h16M4 10h16M4 14h10M4 18h13" />
    </Svg>
  );
}

export function PlayIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M7 5.5 18.5 12 7 18.5z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function StopIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function RestartIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M20 11a8 8 0 1 0-.9 4.5" />
      <path d="M20 4.5V11h-6.5" />
    </Svg>
  );
}

export function OpenIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M14 5h5v5" />
      <path d="M19 5l-8 8" />
      <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </Svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function MonitorIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16l3.5-4.5 3 2.5L20 7" />
    </Svg>
  );
}

export function GroupIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5z" />
      <path d="M14 13.5h5M16.5 11v5" />
    </Svg>
  );
}
