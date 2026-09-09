// tests/quest.test.ts
import { describe, test, expect, vi } from "vitest";
import { QuestSystem } from "@/game/quest";

function makeGame(stats: Record<string, number> = {}, shots: Record<string, number> = {}) {
  return {
    stats: { ...stats, shots_by_weapon: shots },
    player: { coins: 0, addXp: vi.fn() },
    audio: { play: vi.fn(), playSFX: vi.fn(), playMusic: vi.fn() },
    toast: vi.fn(),
  } as unknown as Parameters<QuestSystem["update"]>[0];
}

describe("QuestSystem", () => {
  test("kill quest progresses and completes", () => {
    const g = makeGame();
    const q = new QuestSystem();
    q.bind(g);
    expect(q.active.length).toBe(5);
    (g.stats as unknown as Record<string, number>).kills = 50;
    q.update(g);
    expect(q.active.find((x) => x.id === "kill_50")).toBeUndefined();
    expect(q.completedCount).toBeGreaterThan(0);
  });

  test("boss kill completes boss quest", () => {
    const g = makeGame();
    const q = new QuestSystem();
    q.bind(g);
    (g.stats as unknown as Record<string, number>).boss_kills = 1;
    q.update(g);
    expect(q.active.find((x) => x.id === "boss_1")).toBeUndefined();
  });

  test("restored completed quests stay done and are never re-rewarded", () => {
    // Simulate a run that completed + rewarded kill_50 and boss_1, then was
    // saved. On Continue the board is rebuilt from the SAME restored stats
    // (kills=50, boss_kills=1) — without the persisted completed ids every
    // quest would re-complete on the first update and re-grant XP/coins.
    const g = makeGame({ kills: 50, boss_kills: 1 });
    const q = new QuestSystem();
    q.bind(g, ["kill_50", "boss_1"]);
    expect(q.all.find((x) => x.id === "kill_50")!.done).toBe(true);
    expect(q.all.find((x) => x.id === "boss_1")!.done).toBe(true);
    // update() must not grant anything: no quest completes, coins/xp untouched.
    q.update(g);
    expect(g.player!.coins).toBe(0);
    expect(g.player!.addXp).not.toHaveBeenCalled();
    expect(q.completedCount).toBe(2);
    expect(q.active.length).toBe(3);
  });

  test("quests not in the completed list still complete normally after restore", () => {
    // survive_5min was NOT done at save time; the restored survival_time
    // (already over target) must complete it exactly once after Continue.
    const g = makeGame({ kills: 50, survival_time: 400 });
    const q = new QuestSystem();
    q.bind(g, ["kill_50"]);
    q.update(g);
    expect(q.all.find((x) => x.id === "kill_50")!.done).toBe(true);
    expect(q.all.find((x) => x.id === "survive_5min")!.done).toBe(true);
    expect(g.player!.addXp).toHaveBeenCalledTimes(1);
    // A second update re-runs with the same stats: still nothing new to grant.
    q.update(g);
    expect(g.player!.addXp).toHaveBeenCalledTimes(1);
  });
});
