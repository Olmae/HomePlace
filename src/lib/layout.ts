/**
 * Grid arithmetic for the dashboard.
 *
 * Pure functions, no React and no database: the tricky part of a draggable
 * board is deciding where things end up, and that is much easier to reason
 * about — and to fix — when it is separated from pointer events.
 *
 * The board is 12 columns wide and unbounded downwards. A tile owns the
 * rectangle (x, y, w, h) in cells. Gaps are allowed: a tile dragged to the
 * right-hand side stays there instead of being pulled back against its
 * neighbours.
 */

export const COLUMNS = 12;

export type Box = { id: string; x: number; y: number; w: number; h: number };

export function clampBox(box: Box): Box {
  const w = Math.max(1, Math.min(COLUMNS, Math.round(box.w)));
  const h = Math.max(1, Math.min(12, Math.round(box.h)));
  return {
    ...box,
    w,
    h,
    x: Math.max(0, Math.min(COLUMNS - w, Math.round(box.x))),
    y: Math.max(0, Math.round(box.y)),
  };
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Make room for a tile that was just moved or resized.
 *
 * Anything it lands on is pushed straight down, and anything that then collides
 * with those is pushed down in turn. Downwards only, because the board grows
 * that way — pushing sideways would need a bin-packing decision, and pushing up
 * could shove a tile off the top edge.
 *
 * The iteration cap is a safety net, not a limit anyone reaches: each pass
 * strictly increases the y of at least one tile, so it terminates on its own.
 */
export function resolveCollisions(boxes: Box[], movedId: string, locked: Set<string> = new Set()): Box[] {
  const result = boxes.map((b) => ({ ...b }));
  const moved = result.find((b) => b.id === movedId);
  if (!moved) return result;

  // A pinned tile stays where it is, so the tile being dragged is what gives
  // way. Without this the pin would be advisory — the first neighbour dropped
  // on top of it would shove it down the board.
  for (let guard = 0; guard < 50; guard++) {
    const blocker = result.find((b) => b.id !== movedId && locked.has(b.id) && overlaps(b, moved));
    if (!blocker) break;
    moved.y = blocker.y + blocker.h;
  }

  const settled = new Set([movedId]);

  for (let pass = 0; pass < 100; pass++) {
    let touched = false;

    for (const anchor of result.filter((b) => settled.has(b.id))) {
      for (const other of result) {
        if (other.id === anchor.id || settled.has(other.id) || locked.has(other.id)) continue;
        if (!overlaps(anchor, other)) continue;
        other.y = anchor.y + anchor.h;
        settled.add(other.id);
        touched = true;
      }
    }

    if (!touched) break;
  }

  return result;
}

/**
 * Pull everything up into the gaps above it, without changing left/right
 * position. Run after a tile is deleted or moved away, so the board does not
 * slowly accumulate empty bands nobody asked for.
 *
 * Deliberately *not* run while dragging: a gap the user made on purpose has to
 * survive, and only gaps left behind by a departure get closed.
 */
export function compactVertically(boxes: Box[], locked: Set<string> = new Set()): Box[] {
  const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x).map((b) => ({ ...b }));
  const placed: Box[] = [];

  for (const box of sorted) {
    if (locked.has(box.id)) {
      placed.push(box);
      continue;
    }
    let y = box.y;
    while (y > 0) {
      const candidate = { ...box, y: y - 1 };
      if (placed.some((p) => overlaps(p, candidate))) break;
      y -= 1;
    }
    box.y = y;
    placed.push(box);
  }
  return placed;
}

/**
 * Reading order for narrow screens.
 *
 * A phone cannot show a two-dimensional board, so the tiles become one column.
 * Top-to-bottom then left-to-right is how the eye already scans the wide
 * layout, which makes the two views feel like the same dashboard.
 */
export function readingOrder<T extends Box>(boxes: T[]): T[] {
  return [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** First free row for a new tile of the given width. */
export function nextFreeSlot(boxes: Box[], w: number, h: number): { x: number; y: number } {
  const width = Math.max(1, Math.min(COLUMNS, w));
  const maxY = boxes.reduce((m, b) => Math.max(m, b.y + b.h), 0);

  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x + width <= COLUMNS; x++) {
      const candidate = { id: "__probe", x, y, w: width, h };
      if (!boxes.some((b) => overlaps(b, candidate))) return { x, y };
    }
  }
  return { x: 0, y: maxY };
}
