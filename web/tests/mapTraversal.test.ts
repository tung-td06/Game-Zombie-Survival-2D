// Traversability regression for the generated city.
//
// The map is easy to make subtly unplayable: one frontage roll can seal a
// block, and a sprite whose hitbox is bigger than its art surrounds itself
// with invisible wall the player bumps into. These checks pin down both.
import { describe, expect, test } from "vitest";
import { GameMap } from "@/game/map";
import { moveCircle } from "@/game/collision";
import { PLAYER_RADIUS } from "@/game/settings";
import type { Vec } from "@/game/vec";

function makeCtx(): any {
  return new Proxy(
    {},
    {
      get(_t, p) {
        if (p === "canvas") return { width: 160, height: 160 };
        return () => undefined;
      },
      set() {
        return true;
      },
    },
  );
}
(globalThis as any).document = {
  createElement: (t: string) =>
    t === "canvas" ? { width: 0, height: 0, getContext: () => makeCtx() } : {},
};

const R = PLAYER_RADIUS;
const STEP = 230 / 60; // one frame at base walking speed

describe("map traversability", () => {
  test("no free spot wedges the player", () => {
    const map = new GameMap(20260823);
    let free = 0;
    let wedged = 0;
    const examples: string[] = [];
    for (let x = 140; x < 3860; x += 37) {
      for (let y = 140; y < 3860; y += 37) {
        const p: Vec = { x, y };
        if (map.blocked(p, R)) continue;
        free++;
        const rects = map.getNear(p, R + 8);
        let escapes = 0;
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          const q: Vec = { x, y };
          moveCircle(q, { x: Math.cos(ang) * STEP, y: Math.sin(ang) * STEP }, R, rects);
          if (Math.hypot(q.x - x, q.y - y) > STEP * 0.3) escapes++;
        }
        if (escapes === 0) {
          wedged++;
          if (examples.length < 6) examples.push(`(${x},${y})`);
        }
      }
    }
    expect(free).toBeGreaterThan(5000);
    expect(wedged, `wedged at ${examples.join(" ")}`).toBe(0);
  }, 60000);

  test("the whole map is reachable from the spawn point", () => {
    const map = new GameMap(20260823);
    const G = 24;
    const W = Math.floor(4000 / G);
    const walk = new Uint8Array(W * W);
    let total = 0;
    for (let gx = 0; gx < W; gx++) {
      for (let gy = 0; gy < W; gy++) {
        const p = { x: gx * G + G / 2, y: gy * G + G / 2 };
        if (!map.blocked(p, R)) {
          walk[gy * W + gx] = 1;
          total++;
        }
      }
    }
    const seen = new Uint8Array(W * W);
    const start = Math.floor(2000 / G) * W + Math.floor(2000 / G);
    expect(walk[start]).toBe(1); // the spawn point itself must be walkable
    const stack = [start];
    seen[start] = 1;
    let reached = 0;
    while (stack.length) {
      const c = stack.pop()!;
      reached++;
      const cx = c % W;
      const cy = (c / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
        const n = ny * W + nx;
        if (seen[n] || !walk[n]) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    // A handful of isolated cells (inside a fenced yard, say) is fine; a
    // sealed district is not.
    expect(total - reached).toBeLessThan(total * 0.005);
  }, 60000);

  test("round sprites do not block more ground than they cover", () => {
    const map = new GameMap(20260823);
    let checked = 0;
    for (const o of map.obstacles) {
      if (o.hit === o.rect) continue;
      checked++;
      // The hitbox must sit inside the drawn bounds, centred on them.
      expect(o.hit.w).toBeLessThan(o.rect.w);
      expect(o.hit.h).toBeLessThan(o.rect.h);
      expect(o.hit.x).toBeGreaterThanOrEqual(o.rect.x);
      expect(o.hit.y).toBeGreaterThanOrEqual(o.rect.y);
      expect(o.hit.x + o.hit.w).toBeLessThanOrEqual(o.rect.x + o.rect.w + 1e-6);
      expect(o.hit.y + o.hit.h).toBeLessThanOrEqual(o.rect.y + o.rect.h + 1e-6);
    }
    expect(checked).toBeGreaterThan(20);
  });

  test("lake collision stays inside the water it draws", () => {
    const map = new GameMap(20260823);
    expect(map.ponds.length).toBeGreaterThan(0);
    const water = map.obstacles.filter((o) => o.kind === "water");
    expect(water.length).toBeGreaterThan(0);
    for (const w of water) {
      // Every collision band belongs to a lake and stays within its ellipse.
      const pond = map.ponds.find(
        (p) => w.rect.x >= p.x && w.rect.y >= p.y && w.rect.x + w.rect.w <= p.x + p.w && w.rect.y + w.rect.h <= p.y + p.h,
      );
      expect(pond, `stray water band at ${w.rect.x},${w.rect.y}`).toBeTruthy();
      const cx = pond!.x + pond!.w / 2;
      const cy = pond!.y + pond!.h / 2;
      const a = pond!.w / 2;
      const b = pond!.h / 2;
      for (const [px, py] of [
        [w.rect.x, w.rect.y],
        [w.rect.x + w.rect.w, w.rect.y],
        [w.rect.x, w.rect.y + w.rect.h],
        [w.rect.x + w.rect.w, w.rect.y + w.rect.h],
      ] as const) {
        const nx = (px - cx) / a;
        const ny = (py - cy) / b;
        expect(nx * nx + ny * ny).toBeLessThanOrEqual(1);
      }
    }
    // And the shore is walkable: a point just outside the deep water but
    // well inside the drawn lake bounds must be free.
    const p = map.ponds[0]!;
    const shore = { x: p.x + p.w / 2, y: p.y + 6 };
    expect(map.blocked(shore, R)).toBe(false);
  });
});
