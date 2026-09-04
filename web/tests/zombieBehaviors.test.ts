// tests/zombieBehaviors.test.ts
import { describe, test, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { Zombie, FastZombie, TankZombie, EliteZombie } from "@/game/zombie";
import type { IGame } from "@/game/types";
import type { ZombieData } from "@/game/data";
import type { Vec } from "@/game/vec";

function readJSON(p: string) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "public", p), "utf8"));
}

const zombiesData = readJSON("data/zombies.json") as Record<string, ZombieData>;

function makeGame(playerPos: Vec) {
  const takeDamage = vi.fn();
  const knockbackFrom = vi.fn();
  const toast = vi.fn();
  const game = {
    map: { getNear: () => [], blocked: () => false },
    player: { pos: { ...playerPos }, radius: 9, takeDamage, stunTimer: 0, knockbackFrom },
    zgrid: undefined,
    audio: { playSFX: vi.fn() },
    camera: { shake: vi.fn() },
    toast,
    particles: { blood: vi.fn(), damageNumber: vi.fn() },
    save: { settings: { hit_effects: false, damage_numbers: false } },
    nightFactor: () => 0,
  } as unknown as IGame;
  return { game, takeDamage, knockbackFrom, toast };
}

function run(zombie: Zombie, game: IGame, seconds: number, dt = 1 / 60) {
  for (let i = 0; i < seconds / dt; i++) zombie.update(dt, game);
}

describe("FastZombie lunge", () => {
  test("bursts to a much higher speed once it lunges", () => {
    const { game } = makeGame({ x: 230, y: 500 }); // dist 80: within lunge_range(90), beyond attack_range(36)
    const z = new FastZombie({ x: 150, y: 500 }, { data: zombiesData });
    const dt = 1 / 60;

    let sawLunge = false;
    let wasLunging = false;
    for (let i = 0; i < 180; i++) {
      const before = { ...z.pos };
      z.update(dt, game);
      const lunging = (z as unknown as { lunging: boolean }).lunging;
      // Skip the transition frame (windup -> dash): its move was already
      // zeroed by the windup branch before `lunging` flipped true.
      if (lunging && wasLunging) {
        const moved = Math.hypot(z.pos.x - before.x, z.pos.y - before.y);
        // Base speed alone would cover speed*dt; the dash multiplies that by
        // lunge_speed_mult (2.6x), so a clearly larger step confirms the burst.
        expect(moved).toBeGreaterThan(z.speed * dt * 1.8);
        sawLunge = true;
        break;
      }
      wasLunging = lunging;
    }
    expect(sawLunge).toBe(true);
  });
});

describe("TankZombie charge", () => {
  test("charges faster then stuns + knocks back the player on hit", () => {
    const { game, knockbackFrom, toast } = makeGame({ x: 270, y: 500 }); // dist 120: within charge_trigger_range(220)
    const z = new TankZombie({ x: 150, y: 500 }, { data: zombiesData });
    const dt = 1 / 60;

    let sawCharge = false;
    let wasCharging = false;
    for (let i = 0; i < 600; i++) {
      const before = { ...z.pos };
      z.update(dt, game);
      const charging = (z as unknown as { charging: boolean }).charging;
      // Skip the frame the charge is triggered on: the boosted movement only
      // gets added starting the next frame.
      if (charging && wasCharging && !sawCharge) {
        const moved = Math.hypot(z.pos.x - before.x, z.pos.y - before.y);
        expect(moved).toBeGreaterThan(z.speed * dt * 2);
        sawCharge = true;
      }
      wasCharging = charging;
      if ((game.player as unknown as { stunTimer: number }).stunTimer > 0) break;
    }
    expect(sawCharge).toBe(true);
    expect((game.player as unknown as { stunTimer: number }).stunTimer).toBeGreaterThan(0);
    expect(knockbackFrom).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("STUNNED!");
  });
});

describe("EliteZombie elemental resist", () => {
  test("takes reduced damage only from its resisted element", () => {
    const { game } = makeGame({ x: 5000, y: 5000 }); // far away, irrelevant to this test
    const z = new EliteZombie({ x: 0, y: 0 }, { data: zombiesData });
    z.resistElem = "fire";

    z.takeDamage(100, false, game, "fire");
    expect(z.maxHp - z.hp).toBeCloseTo(100 * (zombiesData.elite!.resist_mult ?? 1));

    const z2 = new EliteZombie({ x: 0, y: 0 }, { data: zombiesData });
    z2.resistElem = "fire";
    z2.takeDamage(100, false, game, "plasma");
    expect(z2.maxHp - z2.hp).toBeCloseTo(100);
  });
});
