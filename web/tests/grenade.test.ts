// tests/grenade.test.ts
import { describe, test, expect, vi } from "vitest";
import {
  Grenade,
  BLAST_RADIUS,
  BLAST_DAMAGE,
  BOMB_MAX,
  BOMB_START_COUNT,
} from "@/game/grenade";
import type { IGame } from "@/game/types";

function makeZombie(x: number, y: number) {
  return {
    pos: { x, y },
    radius: 14,
    dying: false,
    knockback: { x: 0, y: 0 },
    takeDamage: vi.fn(),
  };
}

function makeGame(zombies: ReturnType<typeof makeZombie>[], playerPos = { x: 5000, y: 5000 }) {
  return {
    map: { getNear: () => [] },
    zombies,
    grenades: [],
    player: { pos: playerPos, dead: false, takeDamage: vi.fn(), knockbackFrom: vi.fn() },
    particles: { explosion: vi.fn() },
    camera: { shake: vi.fn() },
    audio: { playSFX: vi.fn() },
  } as unknown as IGame;
}

describe("Grenade", () => {
  test("carries the documented starting stock, capped by BOMB_MAX", () => {
    expect(BOMB_START_COUNT).toBeGreaterThan(0);
    expect(BOMB_START_COUNT).toBeLessThanOrEqual(BOMB_MAX);
  });

  test("throw speed scales with aim distance so the bomb lands near the crosshair", () => {
    const from = { x: 100, y: 100 };
    const near = Grenade.toward(from, { x: 200, y: 100 });
    const far = Grenade.toward(from, { x: 500, y: 100 });
    expect(Math.hypot(far.vel.x, far.vel.y)).toBeGreaterThan(
      Math.hypot(near.vel.x, near.vel.y),
    );
  });

  test("detonates when the fuse runs out and damages zombies in the blast", () => {
    const close = makeZombie(210, 100);
    const g = makeGame([close]);
    const bomb = Grenade.toward({ x: 100, y: 100 }, { x: 200, y: 100 });

    for (let i = 0; i < 200 && !bomb.dead; i++) bomb.update(1 / 60, g);

    expect(bomb.dead).toBe(true);
    expect(close.takeDamage).toHaveBeenCalled();
    expect(g.particles.explosion).toHaveBeenCalled();
  });

  test("damage falls off with distance and spares zombies outside the radius", () => {
    const centre = makeZombie(100, 100);
    const edge = makeZombie(100, 100 + BLAST_RADIUS - 10);
    const outside = makeZombie(100, 100 + BLAST_RADIUS + 200);
    const g = makeGame([centre, edge, outside]);

    new Grenade({ x: 100, y: 100 }, 0, 0).explode(g);

    const centreDmg = centre.takeDamage.mock.calls[0]![0] as number;
    const edgeDmg = edge.takeDamage.mock.calls[0]![0] as number;
    expect(centreDmg).toBeCloseTo(BLAST_DAMAGE, 5);
    expect(edgeDmg).toBeLessThan(centreDmg);
    expect(edgeDmg).toBeGreaterThan(0);
    expect(outside.takeDamage).not.toHaveBeenCalled();
  });

  test("knocks surviving zombies away from the blast", () => {
    const z = makeZombie(160, 100);
    const g = makeGame([z]);
    new Grenade({ x: 100, y: 100 }, 0, 0).explode(g);
    expect(z.knockback.x).toBeGreaterThan(0);
  });

  test("hurts the thrower for less than a zombie takes at the same range", () => {
    const z = makeZombie(140, 100);
    const g = makeGame([z], { x: 140, y: 100 });
    new Grenade({ x: 100, y: 100 }, 0, 0).explode(g);

    const zombieDmg = z.takeDamage.mock.calls[0]![0] as number;
    const selfDmg = (g.player!.takeDamage as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0] as number;
    expect(selfDmg).toBeGreaterThan(0);
    expect(selfDmg).toBeLessThan(zombieDmg);
  });

  test("explode() is idempotent — a bomb never double-damages", () => {
    const z = makeZombie(120, 100);
    const g = makeGame([z]);
    const bomb = new Grenade({ x: 100, y: 100 }, 0, 0);
    bomb.explode(g);
    bomb.explode(g);
    expect(z.takeDamage).toHaveBeenCalledTimes(1);
  });
});
