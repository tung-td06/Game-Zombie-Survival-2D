// tests/zombieMotion.test.ts
// Integration-level movement-safety checks driven through the REAL zombie AI
// (Zombie.update + steerMove + jam-escape), not just raw moveCircle:
//
//   • a body is never allowed inside an obstacle (penetration = 0 frames)
//   • a single frame never moves more than a sane step (no snap/teleport)
//   • while a wall fully separates the zombie from the player, the zombie
//     presses/slides on the near face and never crosses to the far side
//     unless it has legitimately navigated around the obstacle's end.
import { describe, test, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { Zombie, FastZombie } from "@/game/zombie";
import { circleRectCollide, type Rect } from "@/game/collision";
import type { ZombieData } from "@/game/data";
import type { IGame } from "@/game/types";
import type { Vec } from "@/game/vec";

const zombiesData = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "public", "data", "zombies.json"), "utf8"),
) as Record<string, ZombieData>;

function stubMap(walls: Rect[]) {
  return {
    getNear: (): Rect[] => walls,
    blocked: (pos: Vec, radius: number) => walls.some((w) => circleRectCollide(pos.x, pos.y, radius, w)),
  };
}

function makeGame(walls: Rect[], playerPos: Vec): IGame {
  return {
    map: stubMap(walls) as any,
    player: { pos: { ...playerPos }, radius: 9, takeDamage: vi.fn() } as any,
    zgrid: undefined,
    enemyBullets: [] as any[],
    audio: { playSFX: vi.fn() } as any,
    nightFactor: () => 0,
  } as unknown as IGame;
}

interface TraceResult {
  maxJump: number;
  inWallFrames: number;
  end: Vec;
}

function trace(z: Zombie, game: IGame, seconds: number, dt = 1 / 60, walls: Rect[]): TraceResult {
  let prev = { x: z.pos.x, y: z.pos.y };
  let maxJump = 0;
  let inWallFrames = 0;
  for (let f = 0; f < seconds / dt; f++) {
    z.update(dt, game);
    const d = Math.hypot(z.pos.x - prev.x, z.pos.y - prev.y);
    if (d > maxJump) maxJump = d;
    // Shrunk probe: tangency is the resting pose; anything deeper is a real
    // penetration.
    for (const w of walls) {
      if (circleRectCollide(z.pos.x, z.pos.y, z.radius - 0.01, w)) inWallFrames++;
    }
    prev = { x: z.pos.x, y: z.pos.y };
  }
  return { maxJump, inWallFrames, end: { ...z.pos } };
}

// Chase is guaranteed when the zombie has taken damage (hp < maxHp), even if
// the player sits far outside the detection radius — mirrors game behaviour.
function damage(z: Zombie) {
  z.hp = z.maxHp - 1;
}

describe("zombie motion collision safety (real AI)", () => {
  test("runs straight into a wall: never penetrates, never snaps", () => {
    const wall: Rect = { x: 400, y: 200, w: 40, h: 600 };
    // Player 260px away on the far side of the wall → guaranteed chase.
    const game = makeGame([wall], { x: 460, y: 500 });
    const z = new Zombie({ x: 200, y: 500 }, { data: zombiesData });
    const r = trace(z, game, 5, 1 / 60, [wall]);
    expect(r.inWallFrames).toBe(0);
    expect(r.maxJump).toBeLessThan(12);
  });

  test("slides along a long wall face without crossing or jitter", () => {
    // Wall longer than the whole run; the only legal motion is sliding along
    // its near face. Player far right, zombie damaged → permanent chase.
    const wall: Rect = { x: 400, y: 0, w: 40, h: 4000 };
    const game = makeGame([wall], { x: 5000, y: 900 });
    const z = new Zombie({ x: 300, y: 1600 }, { data: zombiesData });
    damage(z);
    const r = trace(z, game, 8, 1 / 60, [wall]);
    expect(r.inWallFrames).toBe(0);
    expect(r.maxJump).toBeLessThan(12);
    // Never crossed to the far side of the wall (centre + radius must stay
    // left of the near face; the wall has no end to navigate around).
    expect(z.pos.x).toBeLessThanOrEqual(400 - z.radius + 0.01);
  });

  test("high-speed frenzy runner cannot tunnel even at a large dt", () => {
    // dt = 1/30 (~33ms frames, low FPS) with the fast zombie under the
    // frenzy speed multiplier — the classic tunnelling case.
    const wall: Rect = { x: 400, y: 0, w: 40, h: 4000 };
    const game = makeGame([wall], { x: 5000, y: 500 });
    const z = new FastZombie({ x: 200, y: 500 }, { data: zombiesData, speedMult: 1.35 });
    damage(z);
    const r = trace(z, game, 6, 1 / 30, [wall]);
    expect(r.inWallFrames).toBe(0);
    expect(r.maxJump).toBeLessThan(12);
    expect(z.pos.x).toBeLessThanOrEqual(400 - z.radius + 0.01);
  });

  test("navigates out of an inner-corner pocket without teleporting", () => {
    // L-shaped pocket open to the south; player waits inside it.
    const walls: Rect[] = [
      { x: 300, y: 300, w: 300, h: 40 },
      { x: 540, y: 340, w: 40, h: 300 },
    ];
    const game = makeGame(walls, { x: 480, y: 420 });
    const z = new Zombie({ x: 700, y: 700 }, { data: zombiesData });
    const r = trace(z, game, 10, 1 / 60, walls);
    expect(r.inWallFrames).toBe(0);
    expect(r.maxJump).toBeLessThan(12);
    // It made real progress toward the player (closer than it started).
    const startDist = Math.hypot(700 - 480, 700 - 420);
    const endDist = Math.hypot(z.pos.x - 480, z.pos.y - 420);
    expect(endDist).toBeLessThan(startDist * 0.85);
  });
});
