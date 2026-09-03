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
// Public API (unchanged) — re-exported from db-core.ts:
//   getD1Database, getPlayerByUsername, getPlayerById, createPlayer,
//   hashPassword, verifyPassword, createSessionToken, verifySessionToken,
//   getProfile, saveProfile,
//   getLeaderboardTop100, getPlayerStats, submitScore, getGameSave,
//   saveGameSave, deleteGameSave,
//   validateScoreInput, SubmitScoreInput,
//   PlayerRecord, PlayerStats, GameSaveRecord, LeaderboardEntry,
//   PersistentScoreEntry.
//
// Additional helpers (still backwards-compatible — these previously lived
// in the old db.ts and now route through D1 OR the lazy Node fallback):
//   psGetPlayer, psGetPlayerById, psUpsertPlayer, psListPlayers,
//   psGetStats, psUpsertStats,
//   psGetSave, psUpsertSave, psDeleteSave,
//   psAddScore, psListScores.
// ---------------------------------------------------------------------------

export {
  getD1Database,
  getPlayerByUsername,
  getPlayerById,
  createPlayer,
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  getProfile,
  saveProfile,
  getLeaderboardTop100,
  getPlayerStats,
  submitScore,
  getGameSave,
  saveGameSave,
  deleteGameSave,
  validateScoreInput,
} from "./db-core";

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
  // Runtime-loaded fallback for hosts without a D1 binding (vitest, plain Node
  // ESM, Next Node dev). Specifiers are assembled at runtime so no bundler can
  // statically trace `node:fs`/`node:path` into the Edge bundle:
  // relative-with-extension works on native ESM / vitest, relative extensionless
  // under webpack-style Node resolution, and the "@/" alias form where the
  // alias is applied.
  const candidates = [
    ["..", "server", "persistent-storage.ts"].join("/"),
    ["..", "server", "persistent-storage"].join("/"),
    ["@", "server", "persistent-storage"].join("/"),
  ];
  persistentModulePromise = (async () => {
    for (const dynamicPath of candidates) {
      try {
        const mod = (await import(/* @vite-ignore */ dynamicPath)) as PersistentModule;
        if (mod && typeof mod.psUpsertPlayer === "function") return mod;
      } catch {
        // try the next candidate
      }
    }
    return null;
  })();
  return persistentModulePromise;
}

// Player helpers ------------------------------------------------------------

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

// Stats helpers -------------------------------------------------------------

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

// Game-save helpers ---------------------------------------------------------

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

// Score helpers -------------------------------------------------------------

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
