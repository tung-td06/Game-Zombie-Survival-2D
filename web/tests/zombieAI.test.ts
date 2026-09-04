// tests/zombieAI.test.ts
import { describe, test, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { Zombie } from "@/game/zombie";
import { circleRectCollide } from "@/game/collision";
import type { IGame } from "@/game/types";
import type { ZombieData } from "@/game/data";
import type { Vec } from "@/game/vec";

function readJSON(p: string) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "public", p), "utf8"));
}

const zombiesData = readJSON("data/zombies.json") as Record<string, ZombieData>;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Minimal map stub mirroring GameMap.getNear/blocked semantics over walls. */
function stubMap(walls: Rect[]) {
  return {
    getNear: (): Rect[] => walls,
    blocked: (pos: Vec, radius: number): boolean =>
      walls.some((w) => circleRectCollide(pos.x, pos.y, radius, w)),
  };
}

function makeGame(walls: Rect[] | null, playerPos: Vec): { game: IGame; takeDamage: ReturnType<typeof vi.fn> } {
  const takeDamage = vi.fn();
  const game = {
    map: stubMap(walls ?? []),
    player: { pos: { ...playerPos }, radius: 9, takeDamage },
    zgrid: undefined,
    audio: { playSFX: vi.fn() },
    nightFactor: () => 0,
  } as unknown as IGame;
  return { game, takeDamage };
}

function run(zombie: Zombie, game: IGame, seconds: number, dt = 1 / 30) {
  for (let i = 0; i < seconds / dt; i++) zombie.update(dt, game);
}

function reachable(z: Zombie, p: Vec): boolean {
  return Math.hypot(z.pos.x - p.x, z.pos.y - p.y) < 45;
}

describe("Zombie obstacle navigation", () => {
  test("steers around a wall to reach the player", () => {
    // Vertical wall between the zombie (west) and the player (east).
    const wall: Rect = { x: 295, y: 250, w: 50, h: 500 };
    const { game, takeDamage } = makeGame([wall], { x: 490, y: 500 });
    const z = new Zombie({ x: 150, y: 500 }, { data: zombiesData });

    run(z, game, 4);
    // While the wall separates them, melee must never connect through it.
    expect(takeDamage).not.toHaveBeenCalled();

    run(z, game, 20);
    expect(reachable(z, { x: 490, y: 500 })).toBe(true);
  });

  test("rounds whichever corner is nearer when approaching diagonally", () => {
    // Player sits north-east, in detection range, so the sightline crosses
    // the wall's top end: the zombie must round the top-left corner.
    const wall: Rect = { x: 295, y: 250, w: 50, h: 500 };
    const p = { x: 510, y: 120 };
    for (const bias of [-1, 1]) {
      const { game } = makeGame([wall], p);
      const z = new Zombie({ x: 150, y: 340 }, { data: zombiesData });
      z.steerBias = bias;
      run(z, game, 20);
      expect(reachable(z, p), `bias ${bias} should reach the player`).toBe(true);
    }
  });

  test("walks corner to corner around two stacked obstacles", () => {
    // Two buildings side by side form an L-shape barrier: rounding the first
    // still leaves the second blocking, so the zombie must hand off corners.
    const walls: Rect[] = [
      { x: 300, y: 250, w: 60, h: 300 },
      { x: 360, y: 250, w: 60, h: 150 }, // juts out north of the first
    ];
    const p = { x: 520, y: 420 };
    for (const bias of [-1, 1]) {
      const { game } = makeGame(walls, p);
      const z = new Zombie({ x: 120, y: 380 }, { data: zombiesData });
      z.steerBias = bias;
      run(z, game, 30);
      expect(reachable(z, p), `bias ${bias} should reach the player`).toBe(true);
    }
  });

  test("keeps moving along a wall when the path is fully blocked (stuck escape)", () => {
    // Wall spans the whole map vertically: the zombie can never get around,
    // but it must slide along the wall instead of freezing in place, and it
    // must not attack through the wall.
    const wall: Rect = { x: 295, y: -200, w: 50, h: 8000 };
    const { game, takeDamage } = makeGame([wall], { x: 500, y: 500 });
    const z = new Zombie({ x: 150, y: 500 }, { data: zombiesData });

    run(z, game, 10);
    expect(takeDamage).not.toHaveBeenCalled();
    expect(z.pos.x).toBeLessThan(295); // never crossed the wall
    // Made real progress along the wall (either direction), not stuck at spawn.
    expect(Math.abs(z.pos.y - 500)).toBeGreaterThan(150);
  });

  test("closes in directly when no obstacle blocks the path", () => {
    const { game, takeDamage } = makeGame(null, { x: 490, y: 500 });
    const z = new Zombie({ x: 150, y: 500 }, { data: zombiesData });

    run(z, game, 20);
    expect(reachable(z, { x: 490, y: 500 })).toBe(true);
    expect(takeDamage).toHaveBeenCalled();
  });
});
