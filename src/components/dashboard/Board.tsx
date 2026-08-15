"use client";

import { Children, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { COLUMNS, clampBox, resolveCollisions, readingOrder, type Box } from "@/lib/layout";
import { saveLayout } from "@/actions/dashboard";

/**
 * The board: tiles placed on a 12-column grid, dragged and resized directly.
 *
 * The tiles themselves are rendered on the server and handed in as children —
 * this component only positions them. That is what lets a widget stay an async
 * server component that talks to Prometheus while still being draggable.
 *
 * Below `md` the grid collapses to one column in reading order (top-to-bottom,
 * then left-to-right) and dragging is off. A layout with deliberate gaps is
 * meaningless on a 380px screen, and dragging fights with scrolling on a touch
 * device.
 */

const ROW_HEIGHT = 84; // px — one cell of height
const GAP = 12; // px, matches the gap class below

type Drag =
  | { kind: "move"; id: string; startX: number; startY: number; origin: Box }
  | { kind: "resize"; id: string; startX: number; startY: number; origin: Box }
  | null;

export function Board({
  layout,
  editing,
  children,
}: {
  /** One entry per child, in the same order. */
  layout: Box[];
  editing: boolean;
  children: ReactNode;
}) {
  const [boxes, setBoxes] = useState<Box[]>(layout);
  const [drag, setDrag] = useState<Drag>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Server state wins whenever it changes: another tab, a deletion, a new tile.
  useEffect(() => setBoxes(layout), [layout]);

  const childArray = Children.toArray(children);
  const byId = useMemo(() => new Map(boxes.map((b) => [b.id, b])), [boxes]);

  /** Width of one column in pixels, measured rather than assumed. */
  const cellWidth = useCallback(() => {
    const width = ref.current?.clientWidth ?? 0;
    return (width - GAP * (COLUMNS - 1)) / COLUMNS;
  }, []);

  useEffect(() => {
    if (!drag) return;

    function onMove(e: PointerEvent) {
      const dx = e.clientX - drag!.startX;
      const dy = e.clientY - drag!.startY;
      const cols = Math.round(dx / (cellWidth() + GAP));
      const rows = Math.round(dy / (ROW_HEIGHT + GAP));

      setBoxes((prev) => {
        const next = prev.map((b) => {
          if (b.id !== drag!.id) return b;
          return drag!.kind === "move"
            ? clampBox({ ...b, x: drag!.origin.x + cols, y: drag!.origin.y + rows })
            : clampBox({ ...b, w: drag!.origin.w + cols, h: drag!.origin.h + rows });
        });
        return resolveCollisions(next, drag!.id);
      });
    }

    function onUp() {
      setDrag(null);
      // Persist what is on screen. Read from the state setter rather than a
      // captured value so the final pointer position is not lost to a stale
      // closure.
      setBoxes((prev) => {
        void saveLayout(prev.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })));
        return prev;
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, cellWidth]);

  const order = useMemo(() => {
    const index = new Map(boxes.map((b, i) => [b.id, i]));
    return readingOrder(boxes).map((b) => index.get(b.id)!);
  }, [boxes]);

  return (
    <div
      ref={ref}
      className="grid grid-cols-1 gap-3 md:grid-cols-12"
      style={{ gridAutoRows: `${ROW_HEIGHT}px` }}
    >
      {childArray.map((child, i) => {
        const box = boxes[i];
        if (!box) return null;
        const dragging = drag?.id === box.id;

        return (
          <div
            key={box.id}
            // Phones get the reading order and one column; the grid placement
            // below only applies from md up.
            style={{
              order: order.indexOf(i),
              // Custom properties consumed by the md-and-up rules in globals.css:
              // inline grid placement cannot be made conditional on a breakpoint.
              ["--col" as string]: `${box.x + 1} / span ${box.w}`,
              ["--row" as string]: `${box.y + 1} / span ${box.h}`,
            }}
            className={`hp-cell relative ${dragging ? "z-20 opacity-90" : ""} ${
              editing ? "touch-none select-none" : ""
            }`}
          >
            {/* Drag surface. Only present in edit mode, and it sits *under* the
                tile's own controls so the edit and delete buttons stay
                clickable. */}
            {editing && (
              <div
                className="absolute inset-0 z-[5] cursor-grab rounded-card ring-1 ring-inset ring-accent/30 active:cursor-grabbing"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  setDrag({ kind: "move", id: box.id, startX: e.clientX, startY: e.clientY, origin: box });
                }}
              />
            )}

            <div className={`h-full ${editing ? "pointer-events-none" : ""}`}>{child}</div>

            {editing && (
              <button
                type="button"
                aria-label="Resize"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setDrag({ kind: "resize", id: box.id, startX: e.clientX, startY: e.clientY, origin: box });
                }}
                className="absolute bottom-0 right-0 z-10 flex h-5 w-5 cursor-se-resize items-center justify-center rounded-br-card text-faint hover:text-accent"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                  <path d="M9 1v8H1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
