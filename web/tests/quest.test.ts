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
});
