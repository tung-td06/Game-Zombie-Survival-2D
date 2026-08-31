// src/game/spawner.ts
// ZombieSpawner: positions + weighted type selection.

import { SPAWN_MAX_DIST, SPAWN_MIN_DIST, WORLD_HEIGHT, WORLD_WIDTH } from "./settings";
import { mulberry32, type Rng } from "../lib/rng";
import { createZombie, type Zombie } from "./zombie";
import type { ZombieData } from "./data";
import type { GameMap } from "./map";
import type { Vec } from "./vec";

export class ZombieSpawner {
  rng: Rng = mulberry32(Math.floor(Math.random() * 2 ** 31));

  pickType(wave: number): string {
    const weights: Record<string, number> = { normal: 10 };
    if (wave >= 2) weights.fast = Math.min(6, 2 + wave * 0.5);
    if (wave >= 3) weights.tank = Math.min(5, 1 + (wave - 2) * 0.4);
    if (wave >= 4) {
      weights.exploder = Math.min(4, 1 + (wave - 3) * 0.35);
      weights.ranged = Math.min(4, 1 + (wave - 3) * 0.35);
    }
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let roll = this.rng.next() * total;
    for (const [k, w] of Object.entries(weights)) {
      roll -= w;
      if (roll <= 0) return k;
    }
    return "normal";
  }

  spawnPosition(playerPos: Vec, world: GameMap, radius = 24): Vec | null {
    for (let i = 0; i < 40; i++) {
      const ang = this.rng.next() * Math.PI * 2;
      const dist = SPAWN_MIN_DIST + this.rng.next() * (SPAWN_MAX_DIST - SPAWN_MIN_DIST);
      const pos: Vec = {
        x: Math.max(60, Math.min(WORLD_WIDTH - 60, playerPos.x + Math.cos(ang) * dist)),
        y: Math.max(60, Math.min(WORLD_HEIGHT - 60, playerPos.y + Math.sin(ang) * dist)),
      };
      if (!world.blocked(pos, radius)) return pos;
    }
    return null;
  }

  makeZombie(
    kind: string,
    pos: Vec,
    data: Record<string, ZombieData>,
    wave: number,
    night: number,
  ): Zombie {
    // wave scaling matches game.py: hp_growth, speed_growth, damage_growth
    const waveIdx = Math.max(0, wave - 1);
    const hpMult = 1 + 0.08 * waveIdx;
    const speedMult = (1 + 0.02 * waveIdx) * (1 + 0.3 * night);
    const dmgMult = (1 + 0.04 * waveIdx) * (1 + 0.25 * night);
    return createZombie(kind, pos, data, hpMult, speedMult, dmgMult);
  }
}
