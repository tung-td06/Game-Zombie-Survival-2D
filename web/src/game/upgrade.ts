// src/game/upgrade.ts
// UpgradeSystem: 3 choices per level-up, applied to player.

import type { UpgradeCatalog } from "./data";
import type { IGame } from "./types";

export class UpgradeSystem {
  catalog: UpgradeCatalog;

  constructor(catalog: UpgradeCatalog) {
    this.catalog = catalog;
  }

  rollChoices(player: { upgradeLevels: Record<string, number> }): string[] {
    const pool: string[] = [];
    for (const u of this.catalog.upgrades) {
      const limit = this.catalog.limits[u.id];
      if (limit != null && (player.upgradeLevels[u.id] ?? 0) >= limit) continue;
      pool.push(u.id);
    }
    const out: string[] = [];
    while (out.length < Math.min(3, pool.length)) {
      const pick = pool[Math.floor(Math.random() * pool.length)]!;
      if (!out.includes(pick)) out.push(pick);
    }
    return out;
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
    }
  }
}
