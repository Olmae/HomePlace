"use client";

import { Children, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { COLUMNS, clampBox, resolveCollisions, readingOrder, overlaps, swapInReadingOrder, type Box } from "@/lib/layout";
import { saveLayout, moveIntoFolder } from "@/actions/dashboard";
import { useEditMode } from "./EditMode";
import type { Dictionary } from "@/i18n";

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
  d,
  layout,
  children,
  folderIds = [],
  lockedIds = [],
}: {
  d: Dictionary;
  /** One entry per child, in the same order. */
  layout: Box[];
  children: ReactNode;
  /** Tiles that accept a drop — dragging onto one files the tile inside it. */
  folderIds?: string[];
  /** Tiles that cannot be dragged and are never pushed aside. */
  lockedIds?: string[];
}) {
  const { editing } = useEditMode();
  const [boxes, setBoxes] = useState<Box[]>(layout);
  const [drag, setDrag] = useState<Drag>(null);
  const ref = useRef<HTMLDivElement>(null);
  // Mirrors `boxes` for the pointer handlers. Reading state through a ref keeps
  // the save out of a setState updater: React may run an updater more than
  // once, and a server action fired from inside one re-renders on every run —
  // which is exactly the update loop React reports as error #185.
  const latest = useRef<Box[]>(layout);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  /**
   * Save shortly after the last change.
   *
   * Dragging saves on release, but a keyboard nudge has no release — holding an
   * arrow key would otherwise write the whole board on every repeat.
   */
  const saveSoon = useCallback((boxes: Box[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveLayout(boxes.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })));
    }, 500);
  }, []);

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

      // Only the dragged tile moves while the pointer is down; the rest of the
      // board holds still. Reflowing every tile on every pixel — the old
      // behaviour — meant a small nudge shoved the whole board around and it
      // was impossible to tell where anything would end up. The push-aside now
      // happens once, on release, so the drag reads as a preview of one tile
      // over a static board.
      latest.current = proposed;
      setBoxes(proposed);
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
      // Settle now: push aside whatever the dragged tile was dropped onto, in
      // one step, then save the result.
      const settled = resolveCollisions(latest.current, draggedId, locked);
      latest.current = settled;
      setBoxes(settled);
      void saveLayout(settled.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })));
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

  /**
   * Moving and resizing from the keyboard.
   *
   * Dragging needs a pointer and a screen wide enough to show the grid. This is
   * the same operation for everyone else: arrows move the focused tile, Shift
   * with arrows resizes it. Without it the board would be editable by mouse
   * only, which is exactly the hole that removing the old arrow buttons left.
   */
  const nudge = useCallback(
    (id: string, dx: number, dy: number, resize: boolean) => {
      if (locked.has(id)) return;
      const next = resolveCollisions(
        latest.current.map((b) =>
          b.id === id
            ? clampBox(resize ? { ...b, w: b.w + dx, h: b.h + dy } : { ...b, x: b.x + dx, y: b.y + dy })
            : b
        ),
        id,
        locked
      );
      latest.current = next;
      setBoxes(next);
      saveSoon(next);
    },
    [locked, saveSoon]
  );

  /**
   * Reordering without a pointer.
   *
   * On a phone the board is one column and dragging is off, which left edit mode
   * with nothing it could actually do there — tiles could be added and deleted
   * but never rearranged. These two buttons are that missing operation.
   */
  const shift = useCallback(
    (id: string, direction: -1 | 1) => {
      const next = swapInReadingOrder(latest.current, id, direction, locked);
      if (next === latest.current) return;
      latest.current = next;
      setBoxes(next);
      saveSoon(next);
    },
    [locked, saveSoon]
  );

  const order = useMemo(() => {
    const index = new Map(boxes.map((b, i) => [b.id, i]));
    return readingOrder(boxes).map((b) => index.get(b.id)!);
  }, [boxes]);

  /** Where the tile sits in the single-column order, for the arrow buttons. */
  const place = useMemo(() => {
    const sorted = readingOrder(boxes);
    return new Map(sorted.map((b, i) => [b.id, { at: i, last: sorted.length - 1 }]));
  }, [boxes]);

  return (
    <div
      ref={ref}
      className={`hp-board grid grid-cols-1 gap-3 md:grid-cols-12 ${editing ? "hp-editing" : ""}`}
      // The row height is a variable rather than an inline grid property: it
      // must apply from `md` up only, and inline styles cannot be conditional.
      style={{ ["--row-height" as string]: `${ROW_HEIGHT}px` }}
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
              ["--h" as string]: String(box.h),
            }}
            className={`hp-cell group/cell relative ${
              dragging ? "z-30 scale-[1.02] opacity-95 drop-shadow-2xl transition-transform" : ""
            } ${editing ? "touch-none select-none focus-within:z-10" : ""}`}
          >
            {/* Drag surface and keyboard handle, edit mode only — one element,
                not two. As two, the focusable layer covered the drag layer and
                swallowed every pointerdown meant for it: edit mode looked
                enabled and no tile could be moved with the mouse at all.

                The tile's own controls sit above this (z-20 in ItemActions) and
                re-enable pointer events for themselves, so edit and delete stay
                clickable while the rest of the tile is a handle. Focusable only
                while editing, so tabbing through the dashboard normally still
                lands on the links rather than on the layout. */}
            {editing && (
              <div
                tabIndex={0}
                role="application"
                aria-label={`${d.dashboard.editMode}: ${box.w}×${box.h}`}
                onKeyDown={(e) => {
                  const step: Record<string, [number, number]> = {
                    ArrowLeft: [-1, 0],
                    ArrowRight: [1, 0],
                    ArrowUp: [0, -1],
                    ArrowDown: [0, 1],
                  };
                  const delta = step[e.key];
                  if (!delta) return;
                  e.preventDefault();
                  nudge(box.id, delta[0], delta[1], e.shiftKey);
                }}
                className={`absolute inset-0 z-[5] rounded-card ring-1 ring-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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

            {/* Phones get arrows instead: one column has no second dimension to
                drag in, and a drag there would fight the scroll. Hidden from md
                up, where the pointer can do it directly. */}
            {editing && !locked.has(box.id) && (
              <div className="absolute bottom-1 left-1 z-10 flex gap-1 md:hidden">
                <button
                  type="button"
                  aria-label={d.dashboard.moveUp}
                  disabled={(place.get(box.id)?.at ?? 0) === 0}
                  onClick={() => shift(box.id, -1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface/90 text-xs text-muted disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={d.dashboard.moveDown}
                  disabled={(place.get(box.id)?.at ?? 0) === (place.get(box.id)?.last ?? 0)}
                  onClick={() => shift(box.id, 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface/90 text-xs text-muted disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
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
