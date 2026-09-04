// ---------------------------------------------------------------------------
// db.ts — Compatibility shim for API routes
// ---------------------------------------------------------------------------
// This module is the public entry point used by every route in
// `src/app/api/**/route.ts`. To stay Edge-compatible it MUST NOT
// statically import any Node.js-only module (node:fs, node:path, ...).
//
// The Edge-safe surface (D1 binding lookup, types, Web Crypto,
// validation, D1 CRUD) is implemented in `./db-core.ts` and re-exported
// here as-is.
//
// The Node-only persistent JSON fallback used by `npm run dev` lives in
// `../server/persistent-storage.ts`. It is loaded lazily through a
// dynamic `import()` whose path is built at runtime, so the Cloudflare
// Pages / Edge bundler never sees the `node:fs` / `node:path` imports
// in the route's dependency graph.
//
// Every data operation below follows one rule: when `db` (the D1
// binding) is available it writes to D1; otherwise it falls back to the
// persistent JSON store so local dev and tests keep working even though
// the `[[d1_databases]]` binding does not exist on a plain Node server.
// On the Edge runtime `loadPersistent()` always resolves to null, so
// the fallback branch simply no-ops — exactly the D1-only behaviour.
//
// Public surface:
//   getD1Database, getPlayerByUsername, getPlayerById, createPlayer,
//   hashPassword, verifyPassword, createSessionToken, verifySessionToken,
//   getProfile, saveProfile,
//   getLeaderboardTop100, getPlayerStats, submitScore, getGameSave,
//   saveGameSave, deleteGameSave,
//   validateScoreInput, SubmitScoreInput,
//   PlayerRecord, PlayerStats, GameSaveRecord, LeaderboardEntry,
//   PersistentScoreEntry.
//
// Additional helpers (Node-only persistent store access):
//   psGetPlayer, psGetPlayerById, psUpsertPlayer, psListPlayers,
//   psGetStats, psUpsertStats,
//   psGetSave, psUpsertSave, psDeleteSave,
//   psAddScore, psListScores.
// ---------------------------------------------------------------------------

import * as core from "./db-core";

export const getD1Database = core.getD1Database;
export const hashPassword = core.hashPassword;
export const verifyPassword = core.verifyPassword;
export const createSessionToken = core.createSessionToken;
export const verifySessionToken = core.verifySessionToken;
export const getProfile = core.getProfile;
export const saveProfile = core.saveProfile;
export const validateScoreInput = core.validateScoreInput;

export type {
  PlayerRecord,
  PlayerStats,
  GameSaveRecord,
  LeaderboardEntry,
  SubmitScoreInput,
  PersistentScoreEntry,
} from "./db-core";

// ---------------------------------------------------------------------------
// Lazy Node-only persistent fallback
// ---------------------------------------------------------------------------
// On Cloudflare Edge the dynamic import below never resolves to a real
// module (the path is built so that webpack/next cannot statically
// resolve it), so the Edge bundle stays free of `node:fs` / `node:path`.
// On the Node dev server (npm run dev) the resolve succeeds and the
// helpers become usable as an in-process JSON store.

type PersistentModule = typeof import("../server/persistent-storage");

let persistentModulePromise: Promise<PersistentModule | null> | null = null;

function isNodeRuntime(): boolean {
  try {
    return typeof process !== "undefined" && !!(process as any).versions?.node;
  } catch {
    return false;
  }
}

async function loadPersistent(): Promise<PersistentModule | null> {
  if (!isNodeRuntime()) return null;
  if (persistentModulePromise) return persistentModulePromise;
  // Build the specifier at runtime so static analysis cannot trace the
  // `node:fs`/`node:path` import graph into the Edge bundle. The `@`
  // alias (`` in vitest/next) points at `src`, so this resolves to
  // `src/server/persistent-storage`.
  const segments = ["server", "persistent-storage"];
  const dynamicPath = ["@", ...segments].join("/");
  persistentModulePromise = (async () => {
    try {
      const mod = (await import(/* @vite-ignore */ dynamicPath)) as PersistentModule;
      return mod;
    } catch {
      return null;
    }
  })();
  return persistentModulePromise;
}

/** Run `fn` against the persistent store when it is available. */
async function withPersistent<T>(
  fallback: T,
  fn: (m: PersistentModule) => Promise<T>
): Promise<T> {
  const m = await loadPersistent();
  if (!m) return fallback;
  return fn(m);
}

// ---------------------------------------------------------------------------
// Player & auth helpers (D1 first, persistent JSON fallback)
// ---------------------------------------------------------------------------

export async function createPlayer(
  db: D1Database | null | undefined,
  username: string,
  passwordHash: string,
  displayName?: string
): Promise<core.PlayerRecord> {
  const player = await core.createPlayer(db, username, passwordHash, displayName);
  if (!db) {
    // Local dev / tests: persist to on-disk JSON so the account survives
    // process restarts and hot reloads.
    await withPersistent(undefined, async (m) => {
      await m.psUpsertPlayer(player);
      await m.psUpsertStats({
        player_id: player.id,
        total_games: 0,
        best_score: 0,
        best_wave: 0,
        total_zombies_killed: 0,
        best_survival_time: 0,
        updated_at: player.created_at,
      });
    });
  }
  return player;
}

export async function getPlayerByUsername(
  db: D1Database | null | undefined,
  username: string
): Promise<core.PlayerRecord | null> {
  if (db) return core.getPlayerByUsername(db, username);
  const clean = username.trim().toLowerCase();
  return withPersistent(null, async (m) => m.psGetPlayer(clean));
}

export async function getPlayerById(
  db: D1Database | null | undefined,
  playerId: string
): Promise<core.PlayerRecord | null> {
  if (db) return core.getPlayerById(db, playerId);
  return withPersistent(null, async (m) => m.psGetPlayerById(playerId));
}

// ---------------------------------------------------------------------------
// Score helpers (D1 first, persistent JSON fallback)
// ---------------------------------------------------------------------------

export async function submitScore(
  db: D1Database | null | undefined,
  playerId: string,
  input: core.SubmitScoreInput
): Promise<void> {
  if (db) {
    await core.submitScore(db, playerId, input);
    return;
  }
  const now = Date.now();
  const player = await getPlayerById(db, playerId);
  const username = player?.display_name || player?.username || "Survivor";
  await withPersistent(undefined, async (m) => {
    await m.psAddScore({
      id: crypto.randomUUID(),
      player_id: playerId,
      username,
      score: input.score,
      wave: input.wave,
      zombies_killed: input.zombies_killed,
      survival_time: input.survival_time,
      created_at: now,
    });
    // Mirror the D1 stats update.
    const prev = (await m.psGetStats(playerId)) || {
      player_id: playerId,
      total_games: 0,
      best_score: 0,
      best_wave: 0,
      total_zombies_killed: 0,
      best_survival_time: 0,
      updated_at: now,
    };
    await m.psUpsertStats({
      player_id: playerId,
      total_games: prev.total_games + 1,
      best_score: Math.max(prev.best_score, input.score),
      best_wave: Math.max(prev.best_wave, input.wave),
      total_zombies_killed: prev.total_zombies_killed + input.zombies_killed,
      best_survival_time: Math.max(prev.best_survival_time, input.survival_time),
      updated_at: now,
    });
  });
}

export async function getPlayerStats(
  db: D1Database | null | undefined,
  playerId: string
): Promise<core.PlayerStats | null> {
  if (db) return core.getPlayerStats(db, playerId);
  return withPersistent(null, async (m) => m.psGetStats(playerId));
}

export async function getLeaderboardTop100(
  db: D1Database | null | undefined
): Promise<core.LeaderboardEntry[]> {
  if (db) return core.getLeaderboardTop100(db);
  return withPersistent([], async (m) => {
    const scores = await m.psListScores();
    const withUsernames = scores.map((s) => ({
      ...s,
      username: s.username || "Survivor",
    }));
    const sorted = withUsernames.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.wave !== a.wave) return b.wave - a.wave;
      return b.survival_time - a.survival_time;
    });
    return sorted.slice(0, 100).map((item, idx) => ({
      rank: idx + 1,
      username: item.username,
      score: item.score,
      wave: item.wave,
      zombies_killed: item.zombies_killed,
      survival_time: item.survival_time,
    }));
  });
}

// ---------------------------------------------------------------------------
// Game-save helpers (D1 first, persistent JSON fallback)
// ---------------------------------------------------------------------------

export async function getGameSave(
  db: D1Database | null | undefined,
  playerId: string
): Promise<core.GameSaveRecord | null> {
  if (db) return core.getGameSave(db, playerId);
  return withPersistent(null, async (m) => m.psGetSave(playerId));
}

export async function saveGameSave(
  db: D1Database | null | undefined,
  playerId: string,
  savePayload: any
): Promise<void> {
  const now = Date.now();

  const saveRec: core.GameSaveRecord = {
    player_id: playerId,
    save_version: savePayload.save_version || 1,
    level: savePayload.level || 1,
    wave: savePayload.wave || 1,
    score: savePayload.score || 0,
    money: savePayload.money || 0,
    player_data: savePayload.player || {},
    weapon_data: savePayload.weapons || null,
    inventory_data: savePayload.inventory || {},
    progression_data: savePayload.progression || {},
    world_data: savePayload.world || {},
    created_at: now,
    updated_at: now,
  };

  if (db) {
    await core.saveGameSave(db, playerId, savePayload);
    return;
  }
  // Preserve the original created_at when the save already exists.
  await withPersistent(undefined, async (m) => {
    const existing = await m.psGetSave(playerId);
    if (existing && typeof existing.created_at === "number") {
      saveRec.created_at = existing.created_at;
    }
    await m.psUpsertSave(saveRec);
  });
}

export async function deleteGameSave(
  db: D1Database | null | undefined,
  playerId: string
): Promise<void> {
  if (db) {
    await core.deleteGameSave(db, playerId);
    return;
  }
  await withPersistent(undefined, async (m) => m.psDeleteSave(playerId));
}

// ---------------------------------------------------------------------------
// Direct persistent-store helpers (Node only; no-op on Edge)
// ---------------------------------------------------------------------------

export async function psGetPlayer(
  cleanUsername: string
): Promise<import("../server/persistent-storage").PlayerRecord | null> {
  const m = await loadPersistent();
  if (!m) return null;
  return m.psGetPlayer(cleanUsername);
}

export async function psGetPlayerById(
  playerId: string
): Promise<import("../server/persistent-storage").PlayerRecord | null> {
  const m = await loadPersistent();
  if (!m) return null;
  return m.psGetPlayerById(playerId);
}

export async function psUpsertPlayer(
  player: import("../server/persistent-storage").PlayerRecord
): Promise<void> {
  const m = await loadPersistent();
  if (!m) return;
  await m.psUpsertPlayer(player);
}

export async function psListPlayers(): Promise<
  import("../server/persistent-storage").PlayerRecord[]
> {
  const m = await loadPersistent();
  if (!m) return [];
  return m.psListPlayers();
}

export async function psGetStats(
  playerId: string
): Promise<import("../server/persistent-storage").PlayerStats | null> {
  const m = await loadPersistent();
  if (!m) return null;
  return m.psGetStats(playerId);
}

export async function psUpsertStats(
  stats: import("../server/persistent-storage").PlayerStats
): Promise<void> {
  const m = await loadPersistent();
  if (!m) return;
  await m.psUpsertStats(stats);
}

export async function psGetSave(
  playerId: string
): Promise<import("../server/persistent-storage").GameSaveRecord | null> {
  const m = await loadPersistent();
  if (!m) return null;
  return m.psGetSave(playerId);
}

export async function psUpsertSave(
  save: import("../server/persistent-storage").GameSaveRecord
): Promise<void> {
  const m = await loadPersistent();
  if (!m) return;
  await m.psUpsertSave(save);
}

export async function psDeleteSave(playerId: string): Promise<void> {
  const m = await loadPersistent();
  if (!m) return;
  await m.psDeleteSave(playerId);
}

export async function psAddScore(
  entry: import("../server/persistent-storage").PersistentScoreEntry
): Promise<void> {
  const m = await loadPersistent();
  if (!m) return;
  await m.psAddScore(entry);
}

export async function psListScores(): Promise<
  import("../server/persistent-storage").PersistentScoreEntry[]
> {
  const m = await loadPersistent();
  if (!m) return [];
  return m.psListScores();
}
