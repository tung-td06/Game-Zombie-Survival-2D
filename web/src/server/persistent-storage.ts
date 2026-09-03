// Persistent JSON Storage (Node.js)
// ---------------------------------
// Lightweight file-based JSON store used by `src/lib/db.ts` to persist
// player accounts, stats, game saves and leaderboard scores.
//
// File layout (all under web/data/persistent/):
//   players.json      - Record<cleanUsername, PlayerRecord>
//   player_stats.json - Record<playerId, PlayerStats>
//   game_saves.json   - Record<playerId, GameSaveRecord>
//   scores.json       - Array<PersistentScoreEntry>
//
// Every read re-reads the file from disk and every write is written
// through immediately, so all API routes stay consistent even though the
// Next.js server compiles this module into each route chunk separately
// (an in-memory cache would silently go stale between route instances).
// The dataset is tiny (a handful of JSON files) so the I/O cost is
// negligible.

import { promises as fs } from "node:fs";
import * as path from "node:path";

export interface PlayerRecord {
  id: string;
  username: string;
  display_name: string | null;
  password_hash: string;
  created_at: number;
  updated_at: number;
}

export interface PlayerStats {
  player_id: string;
  total_games: number;
  best_score: number;
  best_wave: number;
  total_zombies_killed: number;
  best_survival_time: number;
  updated_at: number;
}

export interface GameSaveRecord {
  player_id: string;
  save_version: number;
  level: number;
  wave: number;
  score: number;
  money: number;
  player_data: any;
  weapon_data: any;
  inventory_data: any;
  progression_data: any;
  world_data: any;
  created_at: number;
  updated_at: number;
}

export interface PersistentScoreEntry {
  id: string;
  player_id: string;
  username: string;
  score: number;
  wave: number;
  zombies_killed: number;
  survival_time: number;
  created_at: number;
}

type PlayersFile = Record<string, PlayerRecord>;
type StatsFile = Record<string, PlayerStats>;
type SavesFile = Record<string, GameSaveRecord>;
type ScoresFile = PersistentScoreEntry[];

// Resolved per call so tests can redirect the store to a sandbox directory
// via `PERSISTENT_TEST_DIR` before the first read/write.
export function getDataDir(): string {
  const override = process.env.PERSISTENT_TEST_DIR;
  if (override) return override;
  return path.join(process.cwd(), "data", "persistent");
}

function filePath(name: string): string {
  return path.join(getDataDir(), `${name}.json`);
}

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const buf = await fs.readFile(filePath(name), "utf8");
    return JSON.parse(buf) as T;
  } catch (err: any) {
    if (err?.code === "ENOENT") return fallback;
    // Corrupt file — log and recover with empty data.
    console.warn(`persistent-storage: failed to read ${name}.json, resetting:`, err?.message);
    return fallback;
  }
}

async function writeJson(name: string, data: unknown): Promise<void> {
  try {
    await fs.mkdir(getDataDir(), { recursive: true });
    await fs.writeFile(filePath(name), JSON.stringify(data, null, 2), "utf8");
  } catch (err: any) {
    console.warn(`persistent-storage: write ${name}.json failed:`, err?.message);
  }
}

// --- Player CRUD ------------------------------------------------------------

export async function psGetPlayer(cleanUsername: string): Promise<PlayerRecord | null> {
  const players = await readJson<PlayersFile>("players", {});
  return players[cleanUsername] || null;
}

export async function psGetPlayerById(playerId: string): Promise<PlayerRecord | null> {
  const players = await readJson<PlayersFile>("players", {});
  for (const p of Object.values(players)) {
    if (p.id === playerId) return p;
  }
  return null;
}

export async function psUpsertPlayer(player: PlayerRecord): Promise<void> {
  const players = await readJson<PlayersFile>("players", {});
  players[player.username] = player;
  await writeJson("players", players);
}

export async function psListPlayers(): Promise<PlayerRecord[]> {
  const players = await readJson<PlayersFile>("players", {});
  return Object.values(players);
}

// --- Stats CRUD -------------------------------------------------------------

export async function psGetStats(playerId: string): Promise<PlayerStats | null> {
  const stats = await readJson<StatsFile>("player_stats", {});
  return stats[playerId] || null;
}

export async function psUpsertStats(stats: PlayerStats): Promise<void> {
  const all = await readJson<StatsFile>("player_stats", {});
  all[stats.player_id] = stats;
  await writeJson("player_stats", all);
}

// --- Game Save CRUD ---------------------------------------------------------

export async function psGetSave(playerId: string): Promise<GameSaveRecord | null> {
  const saves = await readJson<SavesFile>("game_saves", {});
  return saves[playerId] || null;
}

export async function psUpsertSave(save: GameSaveRecord): Promise<void> {
  const saves = await readJson<SavesFile>("game_saves", {});
  saves[save.player_id] = save;
  await writeJson("game_saves", saves);
}

export async function psDeleteSave(playerId: string): Promise<void> {
  const saves = await readJson<SavesFile>("game_saves", {});
  delete saves[playerId];
  await writeJson("game_saves", saves);
}

// --- Score CRUD -------------------------------------------------------------

export async function psAddScore(entry: PersistentScoreEntry): Promise<void> {
  const scores = await readJson<ScoresFile>("scores", []);
  scores.push(entry);
  // Cap to last 5000 to avoid unbounded growth.
  if (scores.length > 5000) {
    scores.splice(0, scores.length - 5000);
  }
  await writeJson("scores", scores);
}

export async function psListScores(): Promise<PersistentScoreEntry[]> {
  const scores = await readJson<ScoresFile>("scores", []);
  return [...scores];
}

// --- Maintenance ------------------------------------------------------------

/** Kept for test compatibility — there is no in-memory cache to reset. */
export function _resetCacheForTests(): void {
  // no-op: every operation reads straight from disk
}

/** Kept for test compatibility — writes are already synchronous. */
export async function _flushNowForTests(): Promise<void> {
  // no-op: every operation writes straight to disk
}

/** Returns the directory used for the JSON files. */
export function _dataDir(): string {
  return getDataDir();
}
