// src/game/quest.ts
// Per-run quest board. Mirrors quest.py.

import type { IGame } from "./types";

interface Quest {
  id: string;
  text: string;
  target: number;
  rewardCoins: number;
  rewardXp: number;
  fn: () => number;
  done: boolean;
}

export class QuestSystem {
  quests: Quest[] = [];
  private game: IGame | null = null;

  bind(game: IGame): void {
    this.game = game;
    const stats = (k: string) => () =>
      (game.stats as unknown as Record<string, number>)[k] ?? 0;
    const byType = (k: string) => () => {
      const s = (game.stats as unknown as { kills_by_type: Record<string, number> })
        .kills_by_type;
      return s?.[k] ?? 0;
    };
    const shots = (wid: string) => () => {
      const s = (game.stats as unknown as { shots_by_weapon: Record<string, number> })
        .shots_by_weapon;
      return s?.[wid] ?? 0;
    };
    this.quests = [
      {
        id: "kill_50",
        text: "Kill 50 Zombies",
        target: 50,
        rewardCoins: 300,
        rewardXp: 150,
        fn: stats("kills"),
        done: false,
      },
      {
        id: "kill_fast_10",
        text: "Kill 10 Fast Zombies",
        target: 10,
        rewardCoins: 250,
        rewardXp: 120,
        fn: byType("fast"),
        done: false,
      },
      {
        id: "survive_5min",
        text: "Survive 5 Minutes",
        target: 300,
        rewardCoins: 400,
        rewardXp: 200,
        fn: stats("survival_time"),
        done: false,
      },
      {
        id: "boss_1",
        text: "Kill 1 Boss",
        target: 1,
        rewardCoins: 800,
        rewardXp: 400,
        fn: stats("boss_kills"),
        done: false,
      },
      {
        id: "shotgun_20",
        text: "Fire Shotgun 20 times",
        target: 20,
        rewardCoins: 350,
        rewardXp: 150,
        fn: shots("shotgun"),
        done: false,
      },
    ];
  }

  update(_game: IGame): void {
    for (const q of this.quests) {
      if (q.done) continue;
      if (q.fn() >= q.target) {
        q.done = true;
        _game.player!.coins += q.rewardCoins;
        _game.player!.addXp(q.rewardXp, _game);
        _game.toast(
          `QUEST COMPLETE: ${q.text}  (+$${q.rewardCoins} +${q.rewardXp}XP)`,
        );
        _game.audio.playSFX("player.levelup", _game.player!.pos);
      }
    }
  }

  get active(): Quest[] {
    return this.quests.filter((q) => !q.done);
  }

  get completedCount(): number {
    return this.quests.filter((q) => q.done).length;
  }

  get all(): Quest[] {
    return this.quests;
  }
}
