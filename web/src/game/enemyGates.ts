// src/game/enemyGates.ts
// Single source of truth for WHICH wave each enemy kind can first appear and
// how the two bosses alternate. The spawner (waveWeights in spawner.ts), the
// WaveManager (boss spawn rule) and the lobby BESTIARY all read from here so
// the UI can never drift from actual gameplay.
//
// Do NOT add per-kind numbers to the Bestiary directly — go through these
// helpers (or spawner.waveWeights) so the lobby mirrors the real game.
import {
  BOSS_ALT_START_WAVE,
  FIRST_BOSS_WAVE,
  MODIFIER_PER_WAVE,
} from "./settings";

/** Kinds that only ever appear through the boss / modifier systems. */
export const BOSS_KIND = "boss";
export const NECROMANCER_BOSS_KIND = "necromancer_boss";
export const ELITE_KIND = "elite";

/** The only wave modifier that can spawn elite (Mutant) zombies. */
export const ELITE_MODIFIER = "blood_moon";

/**
 * First wave at which each regularly-spawned kind enters the weighted pool
 * (spawner.waveWeights mirrors this table exactly).
 */
export const KIND_FIRST_WAVE: Readonly<Record<string, number>> = {
  normal: 1,
  fast: 2,
  tank: 3,
  exploder: 4,
  ranged: 4,
  crawler: 5,
  necromancer: 7,
};

/** Wave modifiers are first rolled at this wave (wave % MODIFIER_PER_WAVE === 0, wave > 1). */
export const FIRST_MODIFIER_WAVE = MODIFIER_PER_WAVE;

/** Every wave from FIRST_BOSS_WAVE onward includes a boss (waveManager.isBossWave). */
export function isBossWave(wave: number): boolean {
  return wave >= FIRST_BOSS_WAVE;
}

/**
 * Which boss spawns on a boss wave (WaveManager.startNext): from
 * FIRST_BOSS_WAVE every boss wave is the ABOMINATION until BOSS_ALT_START_WAVE,
 * from which the two bosses alternate — odd waves summon the NECROMANCER KING,
 * even waves the ABOMINATION.
 */
export function bossKindForWave(wave: number): string {
  return wave >= BOSS_ALT_START_WAVE && wave % 2 === 1
    ? NECROMANCER_BOSS_KIND
    : BOSS_KIND;
}

/**
 * Earliest wave at which the given kind can appear at all (any mode/modifier).
 * Mirrors spawner gating + waveManager boss rule. Unknown kinds fall back to 1.
 */
export function firstWaveForKind(kind: string): number {
  switch (kind) {
    case BOSS_KIND:
      return FIRST_BOSS_WAVE;
    case NECROMANCER_BOSS_KIND:
      return BOSS_ALT_START_WAVE;
    case ELITE_KIND:
      return FIRST_MODIFIER_WAVE;
    default:
      return KIND_FIRST_WAVE[kind] ?? 1;
  }
}
