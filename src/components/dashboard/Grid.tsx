import type { ReactNode } from "react";

/**
 * The dashboard grid.
 *
 * Twelve columns on a wide screen, two on a phone. Widths are stored as a
 * number 1–12, and the mapping below is written out in full because Tailwind
 * only ships classes it can see in the source — a template string like
 * `md:col-span-${w}` compiles to nothing at all.
 */
const spanClass: Record<number, string> = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
  5: "md:col-span-5",
  6: "md:col-span-6",
  7: "md:col-span-7",
  8: "md:col-span-8",
  9: "md:col-span-9",
  10: "md:col-span-10",
  11: "md:col-span-11",
  12: "md:col-span-12",
};

export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-12">{children}</div>;
}

export function GridCell({ w, children }: { w: number; children: ReactNode }) {
  const width = Math.max(1, Math.min(12, w));
  // Anything half the grid or wider also goes full width on a phone; a
  // two-column layout for a chart is unreadable at that size.
  const smallSpan = width >= 6 ? "col-span-2" : "col-span-1";
  return <div className={`${smallSpan} ${spanClass[width]}`}>{children}</div>;
}
