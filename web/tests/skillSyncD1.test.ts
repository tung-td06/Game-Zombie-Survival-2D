// tests/skillSyncD1.test.ts
// The game_saves row serves two roles: the Continue-run SNAPSHOT (level, xp,
// wave, player_data, ...) written ONLY by an explicit Save Game, and the
// account Skill Tree mirror (skill_points + skill_* columns) which level-ups
// sync immediately. A fire-and-forget level-up sync can carry a mid-level-up
// XP value and land AFTER a Save, so the sync must NEVER write level/xp — or
// the snapshot gets corrupted and Continue restores an XP that was never
// actually saved.
import { describe, test, expect } from "vitest";
import { syncSkillState, saveGameSave, getGameSave } from "@/lib/db-core";

interface CapturedCall {
  sql: string;
  values: unknown[];
}

function capturingD1() {
  const calls: CapturedCall[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          calls.push({ sql, values });
          return {
            run: async () => ({ meta: { changes: 1 } }),
            first: async () => null,
          };
        },
      };
    },
  } as never;
  return { db, calls };
}

describe("syncSkillState D1 — level/xp ownership", () => {
  test("the skill-state sync never writes level/xp columns", async () => {
    const { db, calls } = capturingD1();
    await syncSkillState(db, "p1", {
      level: 15,
      xp: 38,
      skill_points: 1,
      skills: { damage: 1 },
    });

    expect(calls.length).toBe(1);
    const { sql, values } = calls[0]!;
    // level/xp must not appear in the INSERT column list or the SET clauses.
    expect(sql).not.toMatch(/\blevel\b/);
    expect(sql).not.toMatch(/\bxp\b/);
    // skill_points + skills are still persisted.
    expect(sql).toContain("skill_points");
    expect(sql).toContain("skill_damage");
    // Bound values carry no level/xp (player_id, skill_points, skills, timestamps).
    expect(values[0]).toBe("p1");
    expect(values[1]).toBe(1); // skill_points
    expect(values[2]).toBe(1); // skill_damage
    // player_id + skill_points + 12 skill columns + created_at + updated_at
    expect(values.length).toBe(16);
  });

  test("save snapshot level/xp survives a later skill-state sync", async () => {
    // Save Game first: writes the snapshot.
    const { db, calls } = capturingD1();
    await saveGameSave(db, "p1", {
      save_version: 1,
      level: 14,
      wave: 7,
      score: 500,
      money: 900,
      player: { x: 100, y: 200, hp: 80, maxHp: 100, xp: 1238 },
    });
    // Level-up sync afterwards: must not touch level/xp columns.
    await syncSkillState(db, "p1", {
      level: 15,
      xp: 38,
      skill_points: 1,
      skills: { damage: 1 },
    });

    // Discriminate the two UPSERTs: the save payload carries player_data and
    // the full snapshot; the skill-state sync carries only skill columns.
    const saveCall = calls.find((c) => c.sql.includes("player_data"));
    const syncCall = calls.find(
      (c) => c.sql.includes("skill_points") && !c.sql.includes("player_data")
    );
    expect(saveCall).toBeDefined();
    expect(syncCall).toBeDefined();
    // The sync's columns/SET clauses exclude level and xp.
    expect(syncCall!.sql).not.toMatch(/\blevel\b/);
    expect(syncCall!.sql).not.toMatch(/\bxp\b/);
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