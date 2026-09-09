// Ground shading has to be CONTINUOUS.
//
// The open ground of the map used to come out as a checkerboard of
// hard-edged dark rectangles, and both halves of that had the same cause:
// a decision taken once per cell and flooded over the whole cell.
//
//   • the wash was `hash(128px cell) % 10 < 4` → a 13%-black flood, so the
//     brightness stepped by ~8 levels across one pixel at every 128px cell
//     boundary;
//   • the base tone was `hash(64px tile) % 4` picking one of four authored
//     colours in the order they happen to be written in district.ts, which
//     is not brightness order — so neighbouring tiles could differ by
//     fourteen levels, in a random 64px grid.
//
// Both are now sampled from `smoothNoise`, and this pins the property that
// makes that work: the field is a continuous function of world position, so
// it cannot put a step anywhere — least of all on a cell boundary, which is
// where a step becomes a straight line the eye reads as a rectangle. It is
// asserted here rather than on rendered pixels because this is where the
// artifact was caused; a screenshot only shows where it came out.

import { describe, expect, test } from "vitest";
import { smoothNoise } from "@/game/pixelArt";
import { ramp, washAt } from "@/game/terrainArt";
import { GROUND, type District } from "@/game/district";

const SEED = 20260823;

const luma = (c: string) => {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(c)!;
  return +m[1]! * 0.299 + +m[2]! * 0.587 + +m[3]! * 0.114;
};

describe("smooth world noise", () => {
  test("is a pure function of world position", () => {
    expect(smoothNoise(SEED, 1234, 5678, 128)).toBe(smoothNoise(SEED, 1234, 5678, 128));
    expect(smoothNoise(SEED, 1234.5, 5678.25, 128)).toBe(
      smoothNoise(SEED, 1234.5, 5678.25, 128),
    );
  });

  test("stays inside [0, 1)", () => {
    for (let x = -500; x < 4500; x += 7) {
      for (let y = -300; y < 4300; y += 313) {
        const n = smoothNoise(SEED, x, y, 176);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(1);
      }
    }
  });

  test("never steps at a lattice boundary", () => {
    // Smoothstep's slope peaks at 1.5, so one world pixel can move the field
    // by at most 1.5/period. A hashed-per-cell value jumps by up to 1.0 here.
    const P = 128;
    const limit = 1.5 / P + 1e-9;
    let worst = 0;
    for (let k = -4; k <= 32; k++) {
      const bx = k * P;
      for (let y = 0; y < 4000; y += 97) {
        for (const x of [bx - 1, bx, bx + 1]) {
          const d = Math.abs(smoothNoise(SEED, x + 1, y, P) - smoothNoise(SEED, x, y, P));
          worst = Math.max(worst, d);
        }
        const d = Math.abs(smoothNoise(SEED, 0, bx + 1, P) - smoothNoise(SEED, 0, bx, P));
        worst = Math.max(worst, d);
      }
    }
    expect(worst).toBeLessThanOrEqual(limit);
  });
});

describe("ground wash", () => {
  test("has no step anywhere on the map, at cell boundaries or between", () => {
    // The wash is two octaves (352px and 160px) put through a ramp that
    // divides by 0.34, so the tightest bound is 1.5/160/0.34 per pixel.
    const limit = 0.26 * (1.5 / 160) / 0.34 + 0.74 * (1.5 / 352) / 0.34 + 1e-9;
    let worst = 0;
    let worstAt = "";
    for (let y = 0; y < 4000; y += 53) {
      for (let x = 0; x < 4000; x += 1) {
        const d = Math.abs(washAt(SEED, x + 1, y) - washAt(SEED, x, y));
        if (d > worst) {
          worst = d;
          worstAt = `${x},${y}`;
        }
      }
    }
    expect(worst, `worst per-pixel wash step (at ${worstAt})`).toBeLessThanOrEqual(limit);
  });

  test("leaves a good share of the ground on plain base tone", () => {
    // A dead band in the middle of the field: the wash is meant to be soft
    // regional shading, not a tint over the whole map.
    let plain = 0;
    let n = 0;
    for (let y = 0; y < 4000; y += 41) {
      for (let x = 0; x < 4000; x += 41) {
        n++;
        if (washAt(SEED, x, y) === 0) plain++;
      }
    }
    expect(plain / n).toBeGreaterThan(0.1);
    expect(plain / n).toBeLessThan(0.6);
  });
});

describe("district ground ramps", () => {
  const districts: District[] = ["core", "downtown", "industrial", "suburb", "park", "ruins"];

  test("run dark to light with no jump between neighbouring steps", () => {
    for (const d of districts) {
      const r = ramp(d);
      const span = luma(r[r.length - 1]!) - luma(r[0]!);
      expect(span, `${d} ramp is not flat`).toBeGreaterThan(2);
      for (let i = 1; i < r.length; i++) {
        const step = luma(r[i]!) - luma(r[i - 1]!);
        expect(step, `${d} ramp step ${i} goes backwards`).toBeGreaterThanOrEqual(-0.5);
        // One step of the ramp moves the ground by at most one 8-bit
        // level — the finest a step can be, and invisible. This number used
        // to be the whole span of the ramp, up to fourteen levels, because
        // the tone was one of four authored colours picked per 64px tile.
        expect(step, `${d} ramp step ${i} is a visible jump`).toBeLessThanOrEqual(1.001);
      }
    }
  });

  test("uses only the district's own authored colours as its end points", () => {
    for (const d of districts) {
      const r = ramp(d);
      const authored = GROUND[d].base.map((c) => {
        const n = parseInt(c.slice(1), 16);
        return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
      });
      expect(authored, `${d} ramp starts outside its palette`).toContain(r[0]);
      expect(authored, `${d} ramp ends outside its palette`).toContain(r[r.length - 1]);
    }
  });
});
