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
});
