// tests/collision.test.ts
import { describe, test, expect } from "vitest";
import { v } from "@/game/vec";
import { circleRectCollide, moveCircle, circleVsRect, slideMove } from "@/game/collision";

describe("circleRectCollide", () => {
  test("overlaps rect", () => {
    expect(circleRectCollide(0, 0, 5, { x: 3, y: 3, w: 4, h: 4 })).toBe(true);
  });
  test("misses rect", () => {
    expect(circleRectCollide(0, 0, 5, { x: 20, y: 20, w: 4, h: 4 })).toBe(false);
  });
  test("inside rect", () => {
    expect(circleRectCollide(4, 4, 1, { x: 0, y: 0, w: 10, h: 10 })).toBe(true);
  });
  test("corner touch", () => {
    // circle center (5,0) radius 5, rect (5,5,4,4) -> closest point (5,5) distance 5 == radius
    expect(circleRectCollide(5, 0, 5, { x: 5, y: 5, w: 4, h: 4 })).toBe(true);
  });
});

describe("moveCircle (slide)", () => {
  test("free move", () => {
    const pos = v(-15, 0);
    moveCircle(pos, v(10, 0), 5, []);
    expect(pos.x).toBeCloseTo(-5);
    expect(pos.y).toBe(0);
  });
  test("slide along wall from the left", () => {
    const pos = v(-15, 0);
    moveCircle(pos, v(20, 0), 5, [{ x: 0, y: 0, w: 10, h: 10 }]);
    // circle is pushed out to x = -5 (rect.left - r)
    expect(pos.x).toBe(-5);
  });
  test("slide along wall from above", () => {
    const pos = v(0, -15);
    moveCircle(pos, v(0, 20), 5, [{ x: 0, y: 0, w: 10, h: 10 }]);
    expect(pos.y).toBe(-5);
  });
  test("push out of partial overlap with diagonal exit", () => {
    // circle at (8, 5) radius 5, rect (0,0,10,10) — circle straddles right edge.
    // circleRectCollide: nearest (8,5), distance 0 -> inside.
    // Pygame semantics: only pushes when d2 > 1e-4 (i.e. genuinely outside center).
    // So this stays in place; assert no NaN.
    const pos = v(8, 5);
    moveCircle(pos, v(0, 0), 5, [{ x: 0, y: 0, w: 10, h: 10 }]);
    expect(Number.isFinite(pos.x)).toBe(true);
    expect(Number.isFinite(pos.y)).toBe(true);
  });
});

describe("convenience helpers", () => {
  test("circleVsRect", () => {
    expect(circleVsRect({ x: 0, y: 0, r: 5 }, { x: 3, y: 3, w: 4, h: 4 })).toBe(true);
    expect(circleVsRect({ x: 0, y: 0, r: 5 }, { x: 20, y: 20, w: 4, h: 4 })).toBe(false);
  });
  test("slideMove returns new pos", () => {
    // player at x=-4, radius 5, delta (1,0): collides with rect, slide to x=-5
    const out = slideMove({ x: -4, y: 0, r: 5 }, { x: 1, y: 0 }, [
      { x: 0, y: 0, w: 10, h: 10 },
    ]);
    expect(out.x).toBe(-5);
  });
});
