import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import {
  hashPassword,
  verifyPassword,
  createPlayer,
  getPlayerByUsername,
  getPlayerById,
  saveGameSave,
  getGameSave,
  submitScore,
  getLeaderboardTop100,
  getPlayerStats,
  deleteGameSave,
  syncSkillState,
  getSkillState,
  upgradeSkill,
} from "../src/lib/db";
import {
  _resetCacheForTests,
  _flushNowForTests,
  _dataDir,
} from "../src/server/persistent-storage";

// These tests exercise the on-disk persistent store. They use a dedicated
// sub-directory so they never interfere with real dev data.

const TEST_DIR = path.join(process.cwd(), "data", "persistent-test");

beforeAll(async () => {
  // Redirect the persistent store to a sandboxed test directory.
  process.env.PERSISTENT_TEST_DIR = TEST_DIR;
  await fs.rm(TEST_DIR, { recursive: true, force: true });
  await fs.mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
});

beforeEach(() => {
  _resetCacheForTests();
});

describe("Persistent JSON storage (no D1 binding)", () => {
  it("persists a registered player across cache resets", async () => {
    const username = "alice";
    const password = "Password123!";
    const hash = await hashPassword(password);

    const created = await createPlayer(null, username, hash, "Alice");
    expect(created.username).toBe(username);
    expect(created.id).toBeDefined();

    // Force a re-read from disk by flushing pending writes, then clearing
    // the in-memory cache.
    await _flushNowForTests();
    _resetCacheForTests();
    const refetched = await getPlayerByUsername(null, username);
    expect(refetched).not.toBeNull();
    expect(refetched?.id).toBe(created.id);

    // And by id as well (cache was already reset above; no new writes since).
    _resetCacheForTests();
    const byId = await getPlayerById(null, created.id);
    expect(byId?.username).toBe(username);

    // Password still verifies after a "restart".
    const ok = await verifyPassword(password, refetched!.password_hash);
    expect(ok).toBe(true);
  });

  it("writes the on-disk JSON file under data/persistent", async () => {
    const username = "bob";
    const password = "Password123!";
    const hash = await hashPassword(password);
    await createPlayer(null, username, hash);

    // Allow the debounced flush to land.
    await new Promise((r) => setTimeout(r, 300));

    const playersFile = path.join(_dataDir(), "players.json");
    const stat = await fs.stat(playersFile).catch(() => null);
    expect(stat).not.toBeNull();
    const json = JSON.parse(await fs.readFile(playersFile, "utf8"));
    expect(json.bob).toBeDefined();
    expect(json.bob.username).toBe(username);
    expect(json.bob.password_hash).toMatch(/^\$pbkdf2\$/);
  });

  it("persists game saves and stats across reloads", async () => {
    const username = "carol";
    const password = "Password123!";
    const hash = await hashPassword(password);
    const created = await createPlayer(null, username, hash);

    await saveGameSave(null, created.id, {
      save_version: 1,
      level: 3,
      wave: 7,
      score: 1234,
      money: 200,
      player: { hp: 80, armor: 5 },
      weapons: { pistol: { ammo: 12 } },
      inventory: { coins: 50 },
      progression: {},
      world: {},
    });

    await _flushNowForTests();
    _resetCacheForTests();
    const save = await getGameSave(null, created.id);
    expect(save).not.toBeNull();
    expect(save?.wave).toBe(7);
    expect(save?.player_data?.hp).toBe(80);

    await submitScore(null, created.id, {
      score: 5000,
      wave: 9,
      zombies_killed: 80,
      survival_time: 240,
      shots_fired: 200,
      shots_hit: 150,
    });

    await _flushNowForTests();
    _resetCacheForTests();
    const stats = await getPlayerStats(null, created.id);
    expect(stats).not.toBeNull();
    expect(stats?.total_games).toBe(1);
    expect(stats?.best_score).toBe(5000);
    expect(stats?.best_wave).toBe(9);

    const leaderboard = await getLeaderboardTop100(null);
    const carolRow = leaderboard.find((r) => r.username.toLowerCase() === username);
    expect(carolRow).toBeDefined();
    expect(carolRow?.score).toBe(5000);

    await deleteGameSave(null, created.id);
    await _flushNowForTests();
    _resetCacheForTests();
    const afterDelete = await getGameSave(null, created.id);
    expect(afterDelete).toBeNull();
  });

  it("preserves wave 0 and sanitizes scalars on save (no wave skip on Continue)", async () => {
    const username = "wavez";
    const password = "Password123!";
    const hash = await hashPassword(password);
    const created = await createPlayer(null, username, hash);

    // A save taken during the opening intermission legitimately has wave 0.
    // It must be stored as 0 (never coerced to 1, which would silently skip
    // wave 1 after Continue) and negative/NaN scalars must be clamped.
    await saveGameSave(null, created.id, {
      save_version: 1,
      level: 4,
      wave: 0,
      score: -5,
      money: 999,
      player: {
        x: 100,
        y: 100,
        hp: 80,
        xp: 10,
        skillPoints: 2,
        upgradeLevels: {},
      },
      weapons: {},
      inventory: {},
      progression: {},
      world: {},
    });

    await _flushNowForTests();
    _resetCacheForTests();
    const save = await getGameSave(null, created.id);
    expect(save?.wave).toBe(0);
    expect(save?.level).toBe(4);
    expect(save?.money).toBe(999);
    expect(save?.score).toBe(0);
    expect(save?.player_data?.hp).toBe(80);

    await deleteGameSave(null, created.id);
    await _flushNowForTests();
  });

  it("skill-sync-only row carries no run snapshot (distinct from a real save)", async () => {
    const username = "skillstub";
    const password = "Password123!";
    const hash = await hashPassword(password);
    const created = await createPlayer(null, username, hash);

    // Level-ups sync immediately via skill-state, which upserts a game_saves
    // row that ONLY holds the Skill Tree columns (no player position). That
    // row must never be mistaken for a Continue save.
    await syncSkillState(null, created.id, {
      level: 5,
      xp: 120,
      skill_points: 2,
      skills: { damage: 2, max_hp: 1 },
    });
    await _flushNowForTests();
    _resetCacheForTests();

    const save = await getGameSave(null, created.id);
    expect(save).not.toBeNull();
    expect(save?.skills?.damage).toBe(2);
    expect(save?.player_data?.x).toBeUndefined();

    await deleteGameSave(null, created.id);
    await _flushNowForTests();
  });

  it("upserts one leaderboard row per run (save + game over of same run)", async () => {
    const username = "dave";
    const password = "Password123!";
    const hash = await hashPassword(password);
    const created = await createPlayer(null, username, hash);
    const runId = "run-0001";

    // Mid-run save, then a higher final score at game over for the SAME run.
    await submitScore(null, created.id, {
      score: 1000,
      wave: 4,
      zombies_killed: 20,
      survival_time: 120,
      shots_fired: 100,
      shots_hit: 60,
      run_id: runId,
      game_status: "saved",
    });
    await submitScore(null, created.id, {
      score: 8000,
      wave: 9,
      zombies_killed: 120,
      survival_time: 420,
      shots_fired: 500,
      shots_hit: 300,
      run_id: runId,
      game_status: "game_over",
    });

    await _flushNowForTests();
    _resetCacheForTests();

    const leaderboard = await getLeaderboardTop100(null);
    const daveRows = leaderboard.filter(
      (r) => r.username.toLowerCase() === username
    );
    // One row for the run, updated to the final game-over numbers.
    expect(daveRows).toHaveLength(1);
    expect(daveRows[0].score).toBe(8000);
    expect(daveRows[0].wave).toBe(9);
    expect(daveRows[0].zombies_killed).toBe(120);
    expect(daveRows[0].survival_time).toBe(420);

    // Stats count RUNS, not submissions: two upserts of the same run must
    // not inflate total_games or total kills.
    const stats = await getPlayerStats(null, created.id);
    expect(stats?.total_games).toBe(1);
    expect(stats?.total_zombies_killed).toBe(120);
    expect(stats?.best_score).toBe(8000);

    // A different run creates a separate, independent row.
    await submitScore(null, created.id, {
      score: 3000,
      wave: 6,
      zombies_killed: 50,
      survival_time: 200,
      shots_fired: 200,
      shots_hit: 120,
      run_id: "run-0002",
      game_status: "game_over",
    });
    await _flushNowForTests();
    _resetCacheForTests();
    const afterSecond = await getLeaderboardTop100(null);
    const daveRows2 = afterSecond.filter(
      (r) => r.username.toLowerCase() === username
    );
    expect(daveRows2).toHaveLength(2);
  });

  it("persists the Skill Tree state and clamps invalid input", async () => {
    const username = "erin";
    const password = "Password123!";
    const hash = await hashPassword(password);
    const created = await createPlayer(null, username, hash);

    // Level 6 -> 5 points earned. Attempt to store 99 points: the server must
    // clamp to the earned-points invariant
    // skill_points + sum(skills) <= level - 1.
    const synced = await syncSkillState(null, created.id, {
      level: 6,
      xp: 50,
      skill_points: 99,
      skills: { damage: 1, max_hp: 3, invalid_skill: 7 },
    });
    expect(synced.level).toBe(6);
    expect(synced.skill_points).toBe(1); // 5 earned - 1 damage - 3 max_hp = 1
    expect(synced.skills.damage).toBe(1);
    expect(synced.skills.max_hp).toBe(3); // under the 10 cap, stays
    expect(synced.skills.invalid_skill).toBeUndefined();

    await _flushNowForTests();
    _resetCacheForTests();
    const fetched = await getSkillState(null, created.id);
    expect(fetched).not.toBeNull();
    // level/xp are NOT persisted by the skill-state sync: they belong to the
    // Continue snapshot and only an explicit SAVE GAME may write them. The
    // row created by this sync therefore keeps the schema defaults.
    expect(fetched?.level).toBe(1);
    expect(fetched?.xp).toBe(0);
    // The Skill Tree columns (points + skills) ARE persisted by the sync, and
    // stored values are returned untouched (they were validated at write time).
    expect(fetched?.skills.damage).toBe(1);
    expect(fetched?.skill_points).toBe(1);
  });

  it("spends one skill point atomically via the server, then rejects when dry", async () => {
    const username = "frank";
    const password = "Password123!";
    const hash = await hashPassword(password);
    const created = await createPlayer(null, username, hash);

    // Level 3 -> 2 points.
    await syncSkillState(null, created.id, {
      level: 3,
      xp: 0,
      skill_points: 2,
      skills: {},
    });

    const first = await upgradeSkill(null, created.id, "damage");
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.state.skill_points).toBe(1);
      expect(first.state.skills.damage).toBe(1);
    }

    const second = await upgradeSkill(null, created.id, "damage");
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.state.skill_points).toBe(0);
      expect(second.state.skills.damage).toBe(2);
    }

    // No points left -> rejected, no state change.
    const third = await upgradeSkill(null, created.id, "damage");
    expect(third.ok).toBe(false);
    if (!third.ok) {
      expect(third.error).toMatch(/point/i);
      expect(third.state?.skills.damage).toBe(2);
      expect(third.state?.skill_points).toBe(0);
    }

    // Unknown skill id -> rejected before touching the row.
    const unknown = await upgradeSkill(null, created.id, "hack_skill");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error).toMatch(/unknown/i);

    // Persisted across a "reload".
    await _flushNowForTests();
    _resetCacheForTests();
    const fetched = await getSkillState(null, created.id);
    expect(fetched?.skills.damage).toBe(2);
    expect(fetched?.skill_points).toBe(0);
  });

  it("enforces the max level cap and isolates players from each other", async () => {
    const userA = "grace";
    const userB = "heidi";
    const hash = await hashPassword("Password123!");
    const a = await createPlayer(null, userA, hash);
    const b = await createPlayer(null, userB, hash);

    // User A: max out damage (5) and armor (10) — level 17 grants 16 points,
    // 15 spent, 1 left over.
    await syncSkillState(null, a.id, {
      level: 17,
      xp: 0,
      skill_points: 1,
      skills: { damage: 5, armor: 10 },
    });
    // Maxed skill -> rejected even with a point available.
    const maxed = await upgradeSkill(null, a.id, "damage");
    expect(maxed.ok).toBe(false);
    if (!maxed.ok) expect(maxed.error).toMatch(/max/i);
    // The remaining point can still be spent elsewhere.
    const ok = await upgradeSkill(null, a.id, "speed");
    expect(ok.ok).toBe(true);

    // User B's tree is untouched and independent.
    const bState = await getSkillState(null, b.id);
    expect(bState).toBeNull();

    // B starts their own tree; A's skills must not leak into it.
    await syncSkillState(null, b.id, { level: 2, xp: 10, skill_points: 1, skills: {} });
    const bAfter = await getSkillState(null, b.id);
    expect(bAfter?.skills.damage ?? 0).toBe(0);
    expect(bAfter?.skills.armor ?? 0).toBe(0);
    expect(bAfter?.skill_points).toBe(1);

    const aAfter = await getSkillState(null, a.id);
    expect(aAfter?.skills.damage).toBe(5);
  });

  it("level/xp columns are owned by SAVE GAME — skill-state syncs never overwrite them", async () => {
    const username = "xpowns";
    const password = "Password123!";
    const hash = await hashPassword(password);
    const created = await createPlayer(null, username, hash);

    // 1. Explicit Save Game writes the snapshot (level 14, XP 1238).
    await saveGameSave(null, created.id, {
      save_version: 1,
      level: 14,
      wave: 7,
      score: 500,
      money: 900,
      player: { x: 100, y: 200, hp: 80, maxHp: 100, xp: 1238 },
    });
    // 2. Player levels up afterwards: the skill-state sync must NOT touch
    //    level/xp (only the Skill Tree columns), or a fire-and-forget sync
    //    could corrupt the Continue snapshot with an XP that was never saved.
    await syncSkillState(null, created.id, {
      level: 15,
      xp: 38,
      skill_points: 1,
      skills: { damage: 1 },
    });
    await _flushNowForTests();
    _resetCacheForTests();

    const save = await getGameSave(null, created.id);
    expect(save).not.toBeNull();
    expect(save?.level).toBe(14); // snapshot, untouched by the sync
    expect(save?.xp).toBe(1238); // snapshot, untouched by the sync
    // The Skill Tree columns still received the fresh state.
    expect(save?.skill_points).toBe(1);
    expect(save?.skills?.damage).toBe(1);
  });

  it("an existing save survives unless explicitly overwritten (New Game never resets it)", async () => {
    const username = "james";
    const password = "Password123!";
    const hash = await hashPassword(password);
    const created = await createPlayer(null, username, hash, "James");

    // An advanced old save: high level, money, multiple weapons, drone,
    // weapon mods, and a spent skill tree.
    const oldSave = {
      save_version: 1,
      level: 25,
      wave: 12,
      score: 50000,
      money: 3500,
      player: {
        x: 100,
        y: 100,
        hp: 120,
        maxHp: 180,
        armor: 40,
        xp: 900,
        skillPoints: 1,
        upgradeLevels: { damage: 5, max_hp: 4, speed: 3 },
        hasDrone: true,
      },
      weapons: {
        currentId: "shotgun",
        unlocked: ["pistol", "shotgun", "rifle", "sniper"],
        ammo: {},
        mods: { shotgun: ["extended_mag"] },
      },
      inventory: {},
      progression: {},
      world: {},
    };
    await saveGameSave(null, created.id, oldSave);
    await _flushNowForTests();
    _resetCacheForTests();

    // New Game must NOT touch the save row: no reset function exists, and
    // merely starting a run changes nothing. The old save stays byte-for-byte
    // intact so Continue keeps loading it (Test 3: old save preserved).
    const before = await getGameSave(null, created.id);
    expect(before?.level).toBe(25);
    expect(before?.money).toBe(3500);
    expect(before?.weapon_data?.unlocked).toEqual(["pistol", "shotgun", "rifle", "sniper"]);
    expect(before?.player_data?.hasDrone).toBe(true);
    expect(before?.skills).toMatchObject({ damage: 5, max_hp: 4, speed: 3 });
    const updatedAt = before?.updated_at;

    // Simulate "start a new run, play, return to lobby without saving":
    // nothing is written, so the row and its updated_at are unchanged.
    await _flushNowForTests();
    _resetCacheForTests();
    const after = await getGameSave(null, created.id);
    expect(after?.level).toBe(25);
    expect(after?.updated_at).toBe(updatedAt);

    // Only an explicit Save Game overwrites the Continue slot.
    await saveGameSave(null, created.id, {
      ...oldSave,
      level: 4,
      money: 150,
      wave: 6,
    });
    await _flushNowForTests();
    _resetCacheForTests();
    const replaced = await getGameSave(null, created.id);
    expect(replaced?.level).toBe(4);
    expect(replaced?.money).toBe(150);
    expect(replaced?.wave).toBe(6);

    // The account itself is untouched throughout.
    const player = await getPlayerByUsername(null, username);
    expect(player).not.toBeNull();
    expect(player?.id).toBe(created.id);
    expect(player?.display_name).toBe("James");
    expect(await verifyPassword(password, player!.password_hash)).toBe(true);
  });

  it("round-trips the Skill Tree through SAVE GAME / LOAD GAME", async () => {
    const username = "ivan";
    const password = "Password123!";
    const hash = await hashPassword(password);
    const created = await createPlayer(null, username, hash);

    await saveGameSave(null, created.id, {
      save_version: 1,
      level: 7,
      wave: 5,
      score: 2500,
      money: 120,
      player: {
        x: 100,
        y: 100,
        hp: 90,
        maxHp: 140,
        armor: 20,
        xp: 300,
        skillPoints: 2,
        upgradeLevels: { damage: 2, max_hp: 2, speed: 1 },
      },
      weapons: {},
      inventory: {},
      progression: {},
      world: {},
    });

    await _flushNowForTests();
    _resetCacheForTests();
    const save = await getGameSave(null, created.id);
    expect(save).not.toBeNull();
    expect(save?.level).toBe(7);
    expect(save?.xp).toBe(300);
    expect(save?.skill_points).toBe(2);
    expect(save?.skills).toMatchObject({ damage: 2, max_hp: 2, speed: 1 });

    // The skill columns also drive getSkillState after the save.
    const state = await getSkillState(null, created.id);
    expect(state?.level).toBe(7);
    expect(state?.skill_points).toBe(2);
    expect(state?.skills.damage).toBe(2);
  });
});
