import type { ReactNode } from "react";

/**
 * The shared shapes of the interface.
 *
 * Small on purpose: a dashboard is mostly one card repeated, so the value is in
 * having exactly one definition of what a card, a status dot and a button look
 * like. Every colour here goes through a theme variable (see globals.css).
 */

export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  return (
    <Tag
      className={`rounded-card border border-line bg-surface shadow-card transition-colors ${className}`}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

export type StatusKind = "up" | "down" | "unknown" | "warn";

const dotColor: Record<StatusKind, string> = {
  up: "bg-ok",
  down: "bg-danger",
  warn: "bg-warn",
  unknown: "bg-faint",
};

/** The status dot. Shape carries no meaning — the label next to it does. */
export function StatusDot({ kind, label, pulse = false }: { kind: StatusKind; label: string; pulse?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${dotColor[kind]} ${
          pulse && kind === "down" ? "animate-pulse" : ""
        }`}
        aria-hidden
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "danger" | "accent" }) {
  const tones = {
    neutral: "border-line bg-raised text-muted",
    ok: "border-ok/30 bg-ok/10 text-ok",
    warn: "border-warn/30 bg-warn/10 text-warn",
    danger: "border-danger/30 bg-danger/10 text-danger",
    accent: "border-accent/30 bg-accent/10 text-accent",
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** A horizontal meter. `value` is a percentage. */
export function Meter({ value, tone }: { value: number; tone?: "ok" | "warn" | "danger" }) {
  const clamped = Math.max(0, Math.min(100, value));
  // Thresholds are the same everywhere so a full bar always means the same
  // thing, whether it is a disk, memory or CPU.
  const auto = clamped >= 90 ? "danger" : clamped >= 75 ? "warn" : "ok";
  const chosen = tone ?? auto;
  const fill = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger" }[chosen];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised" role="presentation">
      <div className={`h-full rounded-full ${fill} transition-[width] duration-500`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-md text-sm text-muted">{hint}</p>}
      {action}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold tracking-tight">{children}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
    </div>
  );
}

// The tile icon lives in its own file because it needs a load handler to fall
// back when a favicon does not resolve — re-exported here so components keep
// importing their building blocks from one place.
export { TileIcon } from "./TileIcon";
