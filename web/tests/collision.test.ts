// tests/collision.test.ts
import { describe, test, expect } from "vitest";
import { v } from "@/game/vec";
import {
  circleRectCollide,
  moveCircle,
  circleVsRect,
  slideMove,
  type Rect,
} from "@/game/collision";

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

describe("moveCircle robustness (no tunnel / no side-flip / no jitter)", () => {
  test("a single huge step cannot tunnel through a thin wall", () => {
    // 12px-thick vertical wall. A naive one-shot resolver would let a
    // 60px step jump straight over it (old code did: x=143).
    const wall: Rect = { x: 100, y: 0, w: 12, h: 300 };
    const pos = v(60, 150);
    moveCircle(pos, v(60, 0), 16, [wall]);
    expect(pos.x).toBeCloseTo(84); // 100 - radius: stopped at the near face
    expect(pos.y).toBe(150);
  });

  test("huge step from the right also stops at the near face", () => {
    const wall: Rect = { x: 100, y: 0, w: 12, h: 300 };
    const pos = v(140, 150);
    moveCircle(pos, v(-60, 0), 16, [wall]);
    expect(pos.x).toBeCloseTo(128); // 112 + radius
  });

  test("knockback-scale diagonal into a thin wall slides, never crosses", () => {
    const wall: Rect = { x: 100, y: 0, w: 12, h: 600 };
    const pos = v(70, 300);
    // Big diagonal push (e.g. grenade knockback at a clamped dt).
    moveCircle(pos, v(45, 35), 16, [wall]);
    expect(pos.x).toBeLessThanOrEqual(100); // still left of the wall
    // Tangency (distance == radius) is the resting pose; a shrunk probe
    // asserts there is no real penetration.
    expect(circleRectCollide(pos.x, pos.y, 16 - 0.5, wall)).toBe(false);
    // Y component kept moving (slid down along the face).
    expect(pos.y).toBeCloseTo(335);
  });

  test("spawn embed resolves out the near side, never the far side", () => {
    const wall: Rect = { x: 100, y: 0, w: 12, h: 300 };
    const pos = v(105, 150); // centre strictly inside the wall
    moveCircle(pos, v(0, 0), 16, [wall]);
    expect(pos.x).toBeCloseTo(84); // pushed out the LEFT (near) face
    expect(pos.x).not.toBeGreaterThan(100);
    // Resting exactly tangent to the left face (no penetration).
    expect(circleRectCollide(pos.x, pos.y, 16 - 0.5, wall)).toBe(false);
  });

  test("sliding past a convex corner is stable and stays outside", () => {
    // Horizontal wall bottom face at y = -20 + a long vertical wall whose
    // left face is at x = 300, forming a convex outer corner. The circle
    // runs right then must slide DOWN the vertical wall's left face — the
    // wall is 2000px tall so it can never round past its bottom end.
    const walls: Rect[] = [
      { x: 0, y: -60, w: 400, h: 40 }, // bottom face at y = -20
      { x: 300, y: -20, w: 30, h: 2000 }, // left face at x = 300, y -20..1980
    ];
    // Start under the top wall (tangent below y=-20), left of the corner.
    const pos = v(150, -4);
    let maxJump = 0;
    let embedded = false;
    const frames = 260;
    for (let i = 0; i < frames; i++) {
      const before = { x: pos.x, y: pos.y };
      // diagonal pressure: 3px right, 4px down per frame
      moveCircle(pos, v(3, 4), 16, walls);
      const jump = Math.hypot(pos.x - before.x, pos.y - before.y);
      if (jump > maxJump) maxJump = jump;
      // No real penetration (tangency at exactly `radius` is allowed; a
      // shrunk probe catches actual embedding).
      for (const w of walls) {
        if (circleRectCollide(pos.x, pos.y, 16 - 0.5, w)) embedded = true;
      }
    }
    expect(embedded).toBe(false);
    // After rounding the corner it must be sliding DOWN along x = 284 and
    // never cross to the right of the wall.
    expect(pos.x).toBeCloseTo(284);
    expect(pos.y).toBeCloseTo(-4 + frames * 4);
    expect(pos.x).toBeLessThanOrEqual(300);
    // No single-frame teleport while hugging the corner (max pressure 5px).
    expect(maxJump).toBeLessThan(16);
  });

  test("body pressed into two touching walls settles (no face shuttle)", () => {
    // Two walls meeting at a 90° inner corner opening south-east: a vertical
    // wall with right face at x = 0 and a horizontal wall with bottom face at
    // y = 0. Pressing up-left into the corner must settle tangent to both
    // faces at (16, 16) and never oscillate or pop to the far side.
    const walls: Rect[] = [
      { x: -30, y: 0, w: 30, h: 400 }, // right face at x = 0
      { x: 0, y: -30, w: 400, h: 30 }, // bottom face at y = 0
    ];
    const pos = v(60, 60);
    // Drive up-left into the inner corner at (0, 0).
    let embedded = false;
    let maxJump = 0;
    for (let i = 0; i < 400; i++) {
      const before = { x: pos.x, y: pos.y };
      moveCircle(pos, v(-2.5, -2.5), 16, walls);
      const jump = Math.hypot(pos.x - before.x, pos.y - before.y);
      if (jump > maxJump) maxJump = jump;
      for (const w of walls) {
        if (circleRectCollide(pos.x, pos.y, 16 - 0.5, w)) embedded = true;
      }
    }
    expect(embedded).toBe(false);
    // Settled tangent to the vertical right face (x=16) and the horizontal
    // bottom face (y=16), never on the far side of either wall.
    expect(pos.x).toBeCloseTo(16);
    expect(pos.y).toBeCloseTo(16);
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeGreaterThanOrEqual(0);
    // No teleport-style jumps during the whole push.
    expect(maxJump).toBeLessThan(16);
    // Continuing to press the wedge produces no back-and-forth hops.
    const p2 = { ...pos };
    let maxLate = 0;
    for (let i = 0; i < 120; i++) {
      const before = { ...p2 };
      moveCircle(p2, v(-2.5, -2.5), 16, walls);
      maxLate = Math.max(maxLate, Math.hypot(p2.x - before.x, p2.y - before.y));
    }
    expect(maxLate).toBeLessThan(0.01);
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
