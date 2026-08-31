// src/game/achievement.ts
// 7 unlockable achievements. Mirrors achievement.py.

import type { IGame } from "./types";

interface Def {
  id: string;
  name: string;
  desc: string;
}

const DEFS: Def[] = [
  { id: "first_blood", name: "First Blood", desc: "Kill your first zombie" },
  { id: "kill_100", name: "Centurion", desc: "100 total kills" },
  { id: "kill_1000", name: "Zombie Slayer", desc: "1000 total kills" },
  { id: "survive_10min", name: "Endurance", desc: "Survive 10 minutes in one run" },
  { id: "boss_slayer", name: "Giant Slayer", desc: "Kill a Boss" },
  { id: "master_shooter", name: "Master Shooter", desc: "Reach wave 10" },
  { id: "rich", name: "Scavenger King", desc: "Hold $5000 at once" },
];

export class AchievementSystem {
  unlocked: Set<string>;
  static DEFINITIONS = DEFS;

  constructor(unlockedIds: string[] = []) {
    this.unlocked = new Set(unlockedIds);
  }

  update(game: IGame): void {
    const stats = game.stats;
    const totalKills = game.save.total_kills + (stats.kills ?? 0);
    const checks: Record<string, boolean> = {
      first_blood: (stats.kills ?? 0) >= 1,
      kill_100: totalKills >= 100,
      kill_1000: totalKills >= 1000,
      survive_10min: (stats.survival_time ?? 0) >= 600,
      boss_slayer: (stats.boss_kills ?? 0) >= 1,
      master_shooter: game.waveManager.wave >= 10,
      rich: game.player!.coins >= 5000,
    };
    for (const [id, ok] of Object.entries(checks)) {
      if (ok && !this.unlocked.has(id)) this.unlock(id, game);
    }
  }

  unlock(id: string, game: IGame): void {
    this.unlocked.add(id);
    const meta = DEFS.find((d) => d.id === id);
    const name = meta?.name ?? id;
    game.toast(`ACHIEVEMENT UNLOCKED: ${name}`);
    game.audio.playSFX("player.levelup", game.player!.pos);
    const list = game.save.achievements;
    if (!list.includes(id)) list.push(id);
    game.save.save();
  }

  get count(): [number, number] {
    return [this.unlocked.size, DEFS.length];
  }

  nameOf(id: string): string {
    return DEFS.find((d) => d.id === id)?.name ?? id;
  }

  static definitions(): Def[] {
    return DEFS;
  }
}
