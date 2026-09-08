// tests/dbXpFallback.test.ts
// Migration 0005 added the `xp` column to game_saves with DEFAULT 0, so rows
// written BEFORE that migration carry a backfilled 0 in the column while the
// real XP lives inside player_data.xp. getGameSave must not let `0 ?? ...`
// swallow that XP.
import { describe, test, expect } from "vitest";
import { getGameSave } from "@/lib/db-core";

function fakeD1(row: Record<string, unknown>) {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => row,
      }),
    }),
  } as never;
}

const baseRow = {
  player_id: "p1",
  save_version: 1,
  level: 3,
  wave: 4,
  score: 0,
  money: 0,
  player_data: JSON.stringify({ x: 10, y: 20, hp: 80, xp: 120, skillPoints: 2 }),
  weapon_data: null,
  inventory_data: "{}",
  progression_data: "{}",
  world_data: "{}",
  created_at: 1,
  updated_at: 2,
};

describe("getGameSave D1 xp fallback", () => {
  test("backfilled column 0 + player_data.xp 120 -> restores 120", async () => {
    // Row saved before migration 0005: column is a backfilled 0.
    const save = await getGameSave(fakeD1({ ...baseRow, xp: 0, skill_points: 2 }), "p1");
    expect(save?.xp).toBe(120);
    expect(save?.level).toBe(3);
  });

  test("real column 120 + player_data.xp 120 -> restores 120", async () => {
    const save = await getGameSave(fakeD1({ ...baseRow, xp: 120, skill_points: 2 }), "p1");
    expect(save?.xp).toBe(120);
  });

  test("legit zero XP -> restores 0 (not a stale fallback)", async () => {
    const row = {
      ...baseRow,
      player_data: JSON.stringify({ x: 10, y: 20, hp: 80, xp: 0, skillPoints: 0 }),
      xp: 0,
      skill_points: 0,
    };
    const save = await getGameSave(fakeD1(row), "p1");
    expect(save?.xp).toBe(0);
  });

  test("column 0 with no xp in player_data -> falls back to 0", async () => {
    const row = {
      ...baseRow,
      player_data: JSON.stringify({ x: 10, y: 20, hp: 80, skillPoints: 0 }),
      xp: 0,
      skill_points: 0,
    };
    const save = await getGameSave(fakeD1(row), "p1");
    expect(save?.xp).toBe(0);
  });
});