"use client";

import { Children, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { COLUMNS, clampBox, resolveCollisions, readingOrder, overlaps, type Box } from "@/lib/layout";
import { saveLayout, moveIntoFolder } from "@/actions/dashboard";

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
  folderIds = [],
  lockedIds = [],
}: {
  /** One entry per child, in the same order. */
  layout: Box[];
  editing: boolean;
  children: ReactNode;
  /** Tiles that accept a drop — dragging onto one files the tile inside it. */
  folderIds?: string[];
  /** Tiles that cannot be dragged and are never pushed aside. */
  lockedIds?: string[];
}) {
  const [boxes, setBoxes] = useState<Box[]>(layout);
  const [drag, setDrag] = useState<Drag>(null);
  const ref = useRef<HTMLDivElement>(null);
  // Mirrors `boxes` for the pointer handlers. Reading state through a ref keeps
  // the save out of a setState updater: React may run an updater more than
  // once, and a server action fired from inside one re-renders on every run —
  // which is exactly the update loop React reports as error #185.
  const latest = useRef<Box[]>(layout);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const locked = useMemo(() => new Set(lockedIds), [lockedIds]);
  const folders = useMemo(() => new Set(folderIds), [folderIds]);

  // Server state wins whenever it changes: another tab, a deletion, a new tile.
  // Compared by value, not identity: the prop is a fresh array on every render,
  // and assigning it back unconditionally would be a render loop of its own.
  const signature = layout.map((b) => `${b.id}:${b.x},${b.y},${b.w},${b.h}`).join("|");
  useEffect(() => {
    setBoxes(layout);
    latest.current = layout;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const childArray = Children.toArray(children);

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

      const proposed = latest.current.map((b) => {
        if (b.id !== drag!.id) return b;
        return drag!.kind === "move"
          ? clampBox({ ...b, x: drag!.origin.x + cols, y: drag!.origin.y + rows })
          : clampBox({ ...b, w: drag!.origin.w + cols, h: drag!.origin.h + rows });
      });

      // Dropping a tile onto a folder files it inside instead of moving it.
      // Detected from the dragged tile's own top-left cell rather than the
      // pointer, so the highlight matches what is actually being placed.
      const dragged = proposed.find((b) => b.id === drag!.id)!;
      const target =
        drag!.kind === "move"
          ? proposed.find((b) => b.id !== drag!.id && folders.has(b.id) && overlaps(b, { ...dragged, w: 1, h: 1 }))
          : undefined;
      setDropTarget(target?.id ?? null);

      const next = resolveCollisions(proposed, drag!.id, locked);
      latest.current = next;
      setBoxes(next);
    }

    function onUp() {
      const filing = dropTarget;
      const draggedId = drag!.id;
      setDrag(null);
      setDropTarget(null);

      if (filing) {
        // Into the folder: the board layout of the tile stops mattering, so
        // there is nothing to save for it.
        void moveIntoFolder(draggedId, filing);
        return;
      }
      // Save what is on screen. Plain call, no setState updater: the ref
      // already holds the final positions.
      void saveLayout(latest.current.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })));
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, cellWidth, dropTarget, folders, locked]);

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
            {/* Drag surface, edit mode only. The tile's own controls sit above
                it (z-20 in ItemActions) and re-enable pointer events for
                themselves, so edit and delete stay clickable while the rest of
                the tile is a drag handle. */}
            {editing && (
              <div
                className={`absolute inset-0 z-[5] rounded-card ring-1 ring-inset ${
                  locked.has(box.id)
                    ? "cursor-not-allowed ring-warn/40"
                    : "cursor-grab ring-accent/30 active:cursor-grabbing"
                } ${dropTarget === box.id ? "bg-accent/20 ring-2 ring-accent" : ""}`}
                onPointerDown={(e) => {
                  if (e.button !== 0 || locked.has(box.id)) return;
                  e.preventDefault();
                  setDrag({ kind: "move", id: box.id, startX: e.clientX, startY: e.clientY, origin: box });
                }}
              />
            )}

            {/* No `pointer-events-none` here. The drag surface above already
                swallows clicks meant for the tile's links, and disabling
                pointer events on this wrapper also disabled everything it
                contains — including the edit dialog, which is rendered from
                inside the tile and became impossible to type into. */}
            <div className="h-full">{child}</div>

            {editing && !locked.has(box.id) && (
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
