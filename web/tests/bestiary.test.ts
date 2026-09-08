// tests/bestiary.test.ts
// Guards the lobby BESTIARY against drift: the UI data must always match the
// real spawn gates (spawner.waveWeights / waveManager boss rule) and the
// actual /data/zombies.json catalog used by gameplay.
import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { waveWeights } from "@/game/spawner";
import {
  BOSS_KIND,
  ELITE_KIND,
  ELITE_MODIFIER,
  FIRST_MODIFIER_WAVE,
  KIND_FIRST_WAVE,
  NECROMANCER_BOSS_KIND,
  bossKindForWave,
  firstWaveForKind,
  isBossWave,
} from "@/game/enemyGates";
import { BOSS_ALT_START_WAVE, FIRST_BOSS_WAVE } from "@/game/settings";
import { buildBestiary } from "@/components/bestiary/bestiaryData";
import type { ZombieData } from "@/game/data";

const zombiesJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../public/data/zombies.json"), "utf8"),
) as Record<string, ZombieData>;

/** First wave (1..60) at which `kind` appears in the real weighted pool. */
function firstPooledWave(kind: string, modifier: string): number {
  for (let w = 1; w <= 60; w++) {
    if (kind in waveWeights(w, modifier)) return w;
  }
  return Infinity;
}

describe("bestiary vs spawn pool gates", () => {
  test("regular kinds enter the pool exactly on KIND_FIRST_WAVE", () => {
    for (const [kind, gate] of Object.entries(KIND_FIRST_WAVE)) {
      expect(firstPooledWave(kind, "none")).toBe(gate);
      expect(firstWaveForKind(kind)).toBe(gate);
    }
  });

  test("elite only ever spawns under blood_moon, from the first modifier wave", () => {
    // Never in any other modifier / plain pool.
    for (const mod of ["none", "swarm", "frenzy", "fog"]) {
      expect(firstPooledWave(ELITE_KIND, mod)).toBe(Infinity);
    }
    expect(firstPooledWave(ELITE_KIND, ELITE_MODIFIER)).toBe(1); // pool accepts it
    expect(firstWaveForKind(ELITE_KIND)).toBe(FIRST_MODIFIER_WAVE); // first rollable wave
  });

  test("bosses are never in the weighted pool", () => {
    for (const mod of ["none", "blood_moon", "swarm", "frenzy", "fog"]) {
      for (let w = 1; w <= 40; w++) {
        const pool = waveWeights(w, mod);
        expect(BOSS_KIND in pool).toBe(false);
        expect(NECROMANCER_BOSS_KIND in pool).toBe(false);
      }
    }
  });
});

describe("bestiary vs waveManager boss rule", () => {
  test("every wave from FIRST_BOSS_WAVE is a boss wave", () => {
    for (let w = 1; w <= 25; w++) {
      expect(isBossWave(w)).toBe(w >= FIRST_BOSS_WAVE);
    }
  });

  test("bosses alternate from BOSS_ALT_START_WAVE: odd = necromancer king", () => {
    for (let w = 1; w <= 25; w++) {
      const expected =
        w >= BOSS_ALT_START_WAVE && w % 2 === 1 ? NECROMANCER_BOSS_KIND : BOSS_KIND;
      expect(bossKindForWave(w)).toBe(expected);
    }
    expect(firstWaveForKind(BOSS_KIND)).toBe(FIRST_BOSS_WAVE);
    expect(firstWaveForKind(NECROMANCER_BOSS_KIND)).toBe(BOSS_ALT_START_WAVE);
  });
});

describe("bestiary adapter parity", () => {
  test("covers every kind in zombies.json with identical names", () => {
    const entries = buildBestiary(zombiesJson);
    const kinds = Object.keys(zombiesJson).sort();
    expect(entries.map((e) => e.kind).sort()).toEqual(kinds);
    for (const e of entries) {
      expect(e.name).toBe(zombiesJson[e.kind]!.name);
      expect(e.radius).toBe(zombiesJson[e.kind]!.radius);
    }
  });

  test("every entry has sane derived fields", () => {
    const entries = buildBestiary(zombiesJson);
    for (const e of entries) {
      expect(e.threat).toBeGreaterThanOrEqual(1);
      expect(e.threat).toBeLessThanOrEqual(5);
      expect(e.appears).toMatch(/^WAVE \d+\+$/);
      if (e.kind === BOSS_KIND || e.kind === NECROMANCER_BOSS_KIND) {
        expect(e.isBoss).toBe(true);
      }
      if (e.kind === ELITE_KIND) expect(e.isElite).toBe(true);
    }
  });
});
