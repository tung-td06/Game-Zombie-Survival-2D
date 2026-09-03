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

describe("Persistent JSON storage", () => {
  it("persists a registered player across cache resets", async () => {
    const username = "alice";
    const password = "Password123!";
    const hash = await hashPassword(password);

    const created = await createPlayer(username, hash, "Alice");
    expect(created.username).toBe(username);
    expect(created.id).toBeDefined();

    // Force a re-read from disk by flushing pending writes, then clearing
    // the in-memory cache.
    await _flushNowForTests();
    _resetCacheForTests();
    const refetched = await getPlayerByUsername(username);
    expect(refetched).not.toBeNull();
    expect(refetched?.id).toBe(created.id);

    // And by id as well (cache was already reset above; no new writes since).
    _resetCacheForTests();
    const byId = await getPlayerById(created.id);
    expect(byId?.username).toBe(username);

    // Password still verifies after a "restart".
    const ok = await verifyPassword(password, refetched!.password_hash);
    expect(ok).toBe(true);
  });

  it("writes the on-disk JSON file under data/persistent", async () => {
    const username = "bob";
    const password = "Password123!";
    const hash = await hashPassword(password);
    await createPlayer(username, hash);

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
    const created = await createPlayer(username, hash);

    await saveGameSave(created.id, {
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
    const save = await getGameSave(created.id);
    expect(save).not.toBeNull();
    expect(save?.wave).toBe(7);
    expect(save?.player_data?.hp).toBe(80);

    await submitScore(created.id, {
      score: 5000,
      wave: 9,
      zombies_killed: 80,
      survival_time: 240,
      shots_fired: 200,
      shots_hit: 150,
    });

    await _flushNowForTests();
    _resetCacheForTests();
    const stats = await getPlayerStats(created.id);
    expect(stats).not.toBeNull();
    expect(stats?.total_games).toBe(1);
    expect(stats?.best_score).toBe(5000);
    expect(stats?.best_wave).toBe(9);

    const leaderboard = await getLeaderboardTop100();
    const carolRow = leaderboard.find((r) => r.username.toLowerCase() === username);
    expect(carolRow).toBeDefined();
    expect(carolRow?.score).toBe(5000);

    await deleteGameSave(created.id);
    await _flushNowForTests();
    _resetCacheForTests();
    const afterDelete = await getGameSave(created.id);
    expect(afterDelete).toBeNull();
  });
});
