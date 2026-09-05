// src/game/upgrade.ts
// UpgradeSystem: skill catalog + skill tree branches. Mirrors desktop
// upgrade.py: every level grants a skill point, spent in the SKILL TREE
// (Combat / Survival / Utility branches) instead of a random 3-card pick.

import type { UpgradeCatalog } from "./data";
import type { IGame } from "./types";

/** Skill-tree branch definition: name, accent colour, skill ids. */
export const SKILL_BRANCHES: ReadonlyArray<{
  name: string;
  color: string;
  skills: readonly string[];
}> = [
  {
    name: "Combat",
    color: "#FFC850",
    skills: ["damage", "fire_rate", "reload", "crit_ch", "crit_dmg"],
  },
  {
    name: "Survival",
    color: "#6EDC82",
    skills: ["max_hp", "armor", "regen", "vampire"],
  },
  {
    name: "Utility",
    color: "#6EC8FF",
    skills: ["speed", "magnet", "pierce"],
  },
];

/**
 * Seconds the level-up card overlay ignores clicks after it opens. The player
 * is usually mid-firefight (mouse button held down) when a level lands, so the
 * first moments of the overlay must swallow those clicks instead of picking a
 * skill by accident. After it elapses the overlay waits indefinitely.
 */
export const LEVELUP_PICK_LOCK = 3;

/** Max levels for skills that have no explicit catalog limit. */
export const DEFAULT_SKILL_LIMIT = 5;

export class UpgradeSystem {
  catalog: UpgradeCatalog;

  constructor(catalog: UpgradeCatalog) {
    this.catalog = catalog;
  }

  limitFor(uid: string): number {
    return this.catalog.limits[uid] ?? DEFAULT_SKILL_LIMIT;
  }

  textFor(uid: string): string {
    return this.catalog.upgrades.find((u) => u.id === uid)?.text ?? uid;
  }

  descFor(uid: string): string {
    return this.catalog.upgrades.find((u) => u.id === uid)?.desc ?? "";
  }

  apply(uid: string, player: {
    upgradeLevels: Record<string, number>;
    maxHp: number;
    heal: (n: number) => void;
    addArmor: (n: number) => void;
    damageMult: number;
    speedMult: number;
    fireRateMult: number;
    reloadMult: number;
    critBonus: number;
    critMultBonus: number;
    regen: number;
    magnetMult: number;
    lifeSteal: number;
    pierceBonus: number;
  }, _game?: IGame): void {
    player.upgradeLevels[uid] = (player.upgradeLevels[uid] ?? 0) + 1;
    switch (uid) {
      case "max_hp":
        player.maxHp += 20;
        player.heal(20);
        break;
      case "damage":
        player.damageMult *= 1.1;
        break;
      case "speed":
        player.speedMult *= 1.08;
        break;
      case "fire_rate":
        player.fireRateMult *= 1.08;
        break;
      case "reload":
        player.reloadMult *= 0.9;
        break;
      case "armor":
        player.addArmor(10);
        break;
      case "crit_ch":
        player.critBonus += 0.05;
        break;
      case "crit_dmg":
        player.critMultBonus += 0.25;
        break;
      case "regen":
        player.regen += 1;
        break;
      case "magnet":
        player.magnetMult *= 1.3;
        break;
      case "vampire":
        player.lifeSteal += 0.02;
        break;
      case "pierce":
        player.pierceBonus += 1;
        break;
    }
  }
}

/** Branch that owns a skill id (used to colour the level-up cards). */
export function branchForSkill(uid: string):
  | (typeof SKILL_BRANCHES)[number]
  | undefined {
  return SKILL_BRANCHES.find((b) => b.skills.includes(uid));
}

/**
 * Roll the level-up offer: ONE random skill per skill-tree branch, so the
 * player always sees three cards (Combat / Survival / Utility). Skills already
 * at their level cap are excluded; if a whole branch is capped out, the slot is
 * back-filled from the remaining skills of the other branches so the offer
 * still has three cards while anything is left to learn.
 */
export function rollLevelUpChoices(
  levels: Record<string, number>,
  limitFor: (uid: string) => number,
  rand: () => number = Math.random,
): string[] {
  const pick = (pool: readonly string[]): string =>
    pool[Math.floor(rand() * pool.length) % pool.length]!;

  const chosen: string[] = [];
  const spare: string[] = [];
  for (const branch of SKILL_BRANCHES) {
    const pool = branch.skills.filter((uid) => (levels[uid] ?? 0) < limitFor(uid));
    if (pool.length === 0) continue;
    const uid = pick(pool);
    chosen.push(uid);
    for (const other of pool) if (other !== uid) spare.push(other);
  }
  while (chosen.length < SKILL_BRANCHES.length && spare.length > 0) {
    const i = Math.floor(rand() * spare.length) % spare.length;
    chosen.push(spare.splice(i, 1)[0]!);
  }
  return chosen;
}
