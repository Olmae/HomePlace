import { test } from "node:test";
import assert from "node:assert/strict";
import {
  overlaps,
  clampBox,
  resolveCollisions,
  compactVertically,
  readingOrder,
  nextFreeSlot,
  COLUMNS,
  type Box,
} from "../src/lib/layout";

/**
 * The grid arithmetic behind dragging tiles.
 *
 * This is the part of the board that is easy to get subtly wrong and hard to
 * notice: a collision rule that works for the case you tried by hand and puts
 * two tiles on top of each other for the one you did not.
 */

const box = (id: string, x: number, y: number, w = 3, h = 1): Box => ({ id, x, y, w, h });

test("overlaps: touching edges do not count as overlapping", () => {
  assert.equal(overlaps(box("a", 0, 0, 3, 1), box("b", 3, 0, 3, 1)), false);
  assert.equal(overlaps(box("a", 0, 0, 3, 1), box("b", 0, 1, 3, 1)), false);
  assert.equal(overlaps(box("a", 0, 0, 3, 2), box("b", 2, 1, 3, 1)), true);
});

test("clampBox: a tile cannot hang off the right edge", () => {
  const clamped = clampBox(box("a", 11, 0, 4, 1));
  assert.equal(clamped.x + clamped.w <= COLUMNS, true);
  assert.equal(clampBox(box("a", -5, -3)).x, 0);
  assert.equal(clampBox(box("a", -5, -3)).y, 0);
  assert.equal(clampBox({ ...box("a", 0, 0), w: 0, h: 0 }).w, 1);
});

test("resolveCollisions: what the moved tile lands on is pushed down", () => {
  const result = resolveCollisions([box("moved", 0, 0), box("other", 0, 0)], "moved");
  const other = result.find((b) => b.id === "other")!;
  assert.equal(other.y, 1);
  assert.equal(result.find((b) => b.id === "moved")!.y, 0);
});

test("resolveCollisions: the push cascades", () => {
  const result = resolveCollisions([box("moved", 0, 0), box("a", 0, 0), box("b", 0, 1)], "moved");
  const a = result.find((b) => b.id === "a")!;
  const b = result.find((x) => x.id === "b")!;
  assert.equal(a.y, 1);
  assert.equal(b.y >= a.y + a.h, true, "b must end up clear of a");
});

test("resolveCollisions: a pinned tile stays, the dragged one gives way", () => {
  const result = resolveCollisions([box("moved", 0, 0), box("pinned", 0, 0, 3, 2)], "moved", new Set(["pinned"]));
  assert.equal(result.find((b) => b.id === "pinned")!.y, 0, "the pin must not move");
  assert.equal(result.find((b) => b.id === "moved")!.y, 2, "the moved tile lands below it");
});

test("resolveCollisions: leaves a layout that already fits alone", () => {
  const before = [box("a", 0, 0), box("b", 3, 0), box("c", 0, 3)];
  const after = resolveCollisions(before, "a");
  assert.deepEqual(after, before);
});

test("compactVertically: gaps left by a departure are closed", () => {
  const result = compactVertically([box("a", 0, 4), box("b", 3, 7)]);
  assert.equal(result.find((b) => b.id === "a")!.y, 0);
  assert.equal(result.find((b) => b.id === "b")!.y, 0);
});

test("compactVertically: pinned tiles keep their row", () => {
  const result = compactVertically([box("pinned", 0, 5)], new Set(["pinned"]));
  assert.equal(result[0].y, 5);
});

test("readingOrder: top to bottom, then left to right", () => {
  const order = readingOrder([box("c", 6, 1), box("a", 0, 0), box("b", 3, 0)]).map((b) => b.id);
  assert.deepEqual(order, ["a", "b", "c"]);
});

test("nextFreeSlot: fills the gap beside an existing tile", () => {
  const slot = nextFreeSlot([box("a", 0, 0, 6, 1)], 6, 1);
  assert.deepEqual(slot, { x: 6, y: 0 });
});

test("nextFreeSlot: a full row pushes the next tile down", () => {
  const slot = nextFreeSlot([box("a", 0, 0, 12, 1)], 6, 1);
  assert.deepEqual(slot, { x: 0, y: 1 });
});

test("nextFreeSlot: never returns a position that overlaps", () => {
  const boxes = [box("a", 0, 0, 4, 2), box("b", 4, 0, 4, 1), box("c", 8, 0, 4, 3)];
  const slot = nextFreeSlot(boxes, 4, 1);
  const candidate = { id: "new", ...slot, w: 4, h: 1 };
  assert.equal(
    boxes.some((b) => overlaps(b, candidate)),
    false
  );
});
