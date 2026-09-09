// tests/skillSyncD1.test.ts
// The game_saves row serves two roles: the Continue-run SNAPSHOT (level, xp,
// wave, player_data, ...) written ONLY by an explicit Save Game, and the
// account Skill Tree mirror (skill_points + skill_* columns) which level-ups
// sync immediately.
//
// xp is still owned exclusively by SAVE GAME: a fire-and-forget level-up sync
// can carry a mid-level-up XP value and land AFTER a Save, so the sync must
// never write xp — or the snapshot gets corrupted and Continue restores an XP
// that was never actually saved.
//
// level IS written by the sync, MAX-guarded (it may only move forward). If
// the stored level were allowed to lag behind the spent skills, the row would
// violate the earned-points invariant `skill_points + sum(skills) <= level-1`
// against the stored level, and after Continue every level-up point would be
// clamped to 0 — the skill pick would become unclickable.
import { describe, test, expect } from "vitest";
import { syncSkillState, saveGameSave, getGameSave } from "@/lib/db-core";

interface CapturedCall {
  sql: string;
  values: unknown[];
}

/**
 * A D1 fake that records prepared statements and serves a configurable row
 * for SELECT reads (used to simulate a pre-existing stored level).
 */
function capturingD1(storedRow: Record<string, any> | null = null) {
  const calls: CapturedCall[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          calls.push({ sql, values });
          return {
            run: async () => ({ meta: { changes: 1 } }),
            first: async () =>
              sql.trim().startsWith("SELECT") ? storedRow : null,
          };
        },
      };
    },
  } as never;
  return { db, calls };
}

/** The skill-state sync's upsert call (saveGameSave's insert also contains
 * skill_points, so discriminate on player_data which only the save carries). */
function syncWrite(calls: CapturedCall[]): CapturedCall | undefined {
  return calls.find(
    (c) => c.sql.includes("skill_points") && !c.sql.includes("player_data")
  );
}

describe("syncSkillState D1 — level/xp ownership", () => {
  test("the skill-state sync writes level (MAX-guarded) but never xp", async () => {
    const { db, calls } = capturingD1();
    await syncSkillState(db, "p1", {
      level: 15,
      xp: 38,
      skill_points: 1,
      skills: { damage: 1 },
    });

    // The upsert carries level + skill columns (the first call is the read).
    const write = syncWrite(calls);
    expect(write).toBeDefined();
    // xp must never appear in the write — SAVE GAME owns the snapshot.
    expect(write!.sql).not.toMatch(/\bxp\b/);
    // level IS part of the write so the stored invariant can't break.
    expect(write!.sql).toContain("level");
    // Bound values: player_id, level, skill_points, skills, timestamps.
    expect(write!.values[0]).toBe("p1");
    expect(write!.values[1]).toBe(15); // level
    expect(write!.values[2]).toBe(1); // skill_points
    expect(write!.values[3]).toBe(1); // skill_damage
    // player_id + level + skill_points + 12 skill columns + created_at + updated_at
    expect(write!.values.length).toBe(17);
  });

  test("a late sync never regresses the saved snapshot's level", async () => {
    // Save Game first: writes the snapshot (level 14).
    const { db, calls } = capturingD1({ level: 14 });
    await saveGameSave(db, "p1", {
      save_version: 1,
      level: 14,
      wave: 7,
      score: 500,
      money: 900,
      player: { x: 100, y: 200, hp: 80, maxHp: 100, xp: 1238 },
    });
    // A stale sync from BEFORE the save (lower level) landing after it must
    // not drag the stored level below the snapshot.
    const result = await syncSkillState(db, "p1", {
      level: 13,
      xp: 5,
      skill_points: 1,
      skills: { damage: 1 },
    });
    expect(result.level).toBe(14);
    expect(syncWrite(calls)!.values[1]).toBe(14); // level = MAX(14, 13)
  });

  test("a sync from a real level-up after the save raises the stored level", async () => {
    const { db, calls } = capturingD1({ level: 14 });
    const result = await syncSkillState(db, "p1", {
      level: 15,
      xp: 38,
      skill_points: 1,
      skills: { damage: 1 },
    });
    expect(result.level).toBe(15);
    expect(syncWrite(calls)!.values[1]).toBe(15);
  });

  test("getGameSave (D1) still reads the snapshot xp column", async () => {
    let row: Record<string, unknown> = {
      player_id: "p1",
      save_version: 1,
      level: 14,
      wave: 7,
      score: 500,
      money: 900,
      player_data: JSON.stringify({ x: 100, y: 200, hp: 80, xp: 1238 }),
      weapon_data: null,
      inventory_data: "{}",
      progression_data: "{}",
      world_data: "{}",
      created_at: 1,
      updated_at: 2,
      xp: 1238,
      skill_points: 1,
      skill_damage: 1,
    };
    const db = {
      prepare: () => ({
        bind: () => ({
          first: async () => row,
        }),
      }),
    } as never;
    const save = await getGameSave(db, "p1");
    expect(save?.level).toBe(14);
    expect(save?.xp).toBe(1238);
    expect(save?.skill_points).toBe(1);
    expect(save?.skills?.damage).toBe(1);
  });
});