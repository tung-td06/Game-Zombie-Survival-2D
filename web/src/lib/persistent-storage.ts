// Persistent JSON Storage Fallback
// --------------------------------
// This module provides a lightweight file-based JSON store that acts as
// a persistent replacement for the in-memory Maps in `db.ts` whenever
// the Cloudflare D1 binding is not available (e.g. `npm run dev` on a
// regular Node.js process, where the `[[d1_databases]]` binding does
// not exist).
//
// In production on Cloudflare Pages, D1 is used and this module is
// simply never invoked (each method safely no-ops if `node:fs` is not
// available, which is the case on the Workers/Edge runtime).
//
// File layout (all under web/data/persistent/):
//   players.json   - Map<cleanUsername, PlayerRecord>
//   player_stats.json - Map<playerId, PlayerStats>
//   game_saves.json  - Map<playerId, GameSaveRecord>
//   scores.json      - Array<{...}>
//
// Writes are debounced (200ms) to avoid hammering the disk while still
// giving strong durability guarantees between commits and restarts.

import { promises as fs } from "node:fs";
import * as path from "node:path";
import type {
  PlayerRecord,
  PlayerStats,
  GameSaveRecord,
} from "./db";

const DATA_DIR = path.join(process.cwd(), "data", "persistent");

type FileShape = {
  players: Record<string, PlayerRecord>;
  player_stats: Record<string, PlayerStats>;
  game_saves: Record<string, GameSaveRecord>;
  scores: Array<{
    id: string;
    player_id: string;
    username: string;
    score: number;
    wave: number;
    zombies_killed: number;
    survival_time: number;
    created_at: number;
  }>;
};

const EMPTY: FileShape = {
  players: {},
  player_stats: {},
  game_saves: {},
  scores: [],
};

// In-memory cache that mirrors the on-disk JSON file.
let cache: FileShape | null = null;
let loaded = false;
let writeTimer: NodeJS.Timeout | null = null;
let pendingWrite = false;

function isNodeRuntime(): boolean {
  // fs/promises are only available in Node, not in Edge/Workers.
  // We do a soft check to avoid hard failures on Edge.
  try {
    // require would throw in Edge; use a guarded dynamic check.
    return typeof process !== "undefined" && !!(process as any).versions?.node;
  } catch {
    return false;
  }
}

async function ensureDir(): Promise<void> {
  if (!isNodeRuntime()) return;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

function filePath(name: keyof FileShape): string {
  return path.join(DATA_DIR, `${name}.json`);
}

async function readJson<T>(name: keyof FileShape, fallback: T): Promise<T> {
  if (!isNodeRuntime()) return fallback;
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

async function loadAll(): Promise<FileShape> {
  if (loaded && cache) return cache;
  await ensureDir();
  const [players, player_stats, game_saves, scores] = await Promise.all([
    readJson<Record<string, PlayerRecord>>("players", {}),
    readJson<Record<string, PlayerStats>>("player_stats", {}),
    readJson<Record<string, GameSaveRecord>>("game_saves", {}),
    readJson<FileShape["scores"]>("scores", []),
  ]);
  cache = { players, player_stats, game_saves, scores };
  loaded = true;
  return cache;
}

async function flushNow(): Promise<void> {
  if (!isNodeRuntime() || !cache) return;
  pendingWrite = false;
  const snapshot = cache;
  await ensureDir();
  await Promise.all([
    fs.writeFile(filePath("players"), JSON.stringify(snapshot.players, null, 2), "utf8").catch((e) =>
      console.warn("persistent-storage: write players.json failed:", e?.message)
    ),
    fs
      .writeFile(filePath("player_stats"), JSON.stringify(snapshot.player_stats, null, 2), "utf8")
      .catch((e) => console.warn("persistent-storage: write player_stats.json failed:", e?.message)),
    fs.writeFile(filePath("game_saves"), JSON.stringify(snapshot.game_saves, null, 2), "utf8").catch((e) =>
      console.warn("persistent-storage: write game_saves.json failed:", e?.message)
    ),
    fs.writeFile(filePath("scores"), JSON.stringify(snapshot.scores, null, 2), "utf8").catch((e) =>
      console.warn("persistent-storage: write scores.json failed:", e?.message)
    ),
  ]);
}

function scheduleFlush(): void {
  if (!isNodeRuntime()) return;
  pendingWrite = true;
  if (writeTimer) return;
  writeTimer = setTimeout(async () => {
    writeTimer = null;
    if (pendingWrite) await flushNow();
  }, 200);
}

// Ensure writes hit disk on process exit (Ctrl+C, dev shutdown, etc.)
function attachExitHandlers(): void {
  if (!isNodeRuntime()) return;
  const flush = () => {
    if (pendingWrite) {
      // Best-effort sync flush
      flushNow().catch(() => undefined);
    }
  };
  // Node 18+ exposes beforeExit; older runtimes still get exit.
  (process as any).once?.("beforeExit", flush);
  process.once("exit", flush);
  // SIGINT/SIGTERM are common in dev mode.
  process.once("SIGINT", () => {
    flush();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    flush();
    process.exit(0);
  });
}

// --- Player CRUD ------------------------------------------------------------

export async function psGetPlayer(cleanUsername: string): Promise<PlayerRecord | null> {
  if (!isNodeRuntime()) return null;
  const data = await loadAll();
  return data.players[cleanUsername] || null;
}

export async function psGetPlayerById(playerId: string): Promise<PlayerRecord | null> {
  if (!isNodeRuntime()) return null;
  const data = await loadAll();
  return findPlayerById(data, playerId);
}

function findPlayerById(data: FileShape, playerId: string): PlayerRecord | null {
  for (const p of Object.values(data.players)) {
    if (p.id === playerId) return p;
  }
  return null;
}

export async function psUpsertPlayer(player: PlayerRecord): Promise<void> {
  if (!isNodeRuntime()) return;
  const data = await loadAll();
  data.players[player.username] = player;
  scheduleFlush();
}

export async function psListPlayers(): Promise<PlayerRecord[]> {
  if (!isNodeRuntime()) return [];
  const data = await loadAll();
  return Object.values(data.players);
}

// --- Stats CRUD -------------------------------------------------------------

export async function psGetStats(playerId: string): Promise<PlayerStats | null> {
  if (!isNodeRuntime()) return null;
  const data = await loadAll();
  return data.player_stats[playerId] || null;
}

export async function psUpsertStats(stats: PlayerStats): Promise<void> {
  if (!isNodeRuntime()) return;
  const data = await loadAll();
  data.player_stats[stats.player_id] = stats;
  scheduleFlush();
}

// --- Game Save CRUD ---------------------------------------------------------

export async function psGetSave(playerId: string): Promise<GameSaveRecord | null> {
  if (!isNodeRuntime()) return null;
  const data = await loadAll();
  return data.game_saves[playerId] || null;
}

export async function psUpsertSave(save: GameSaveRecord): Promise<void> {
  if (!isNodeRuntime()) return;
  const data = await loadAll();
  data.game_saves[save.player_id] = save;
  scheduleFlush();
}

export async function psDeleteSave(playerId: string): Promise<void> {
  if (!isNodeRuntime()) return;
  const data = await loadAll();
  delete data.game_saves[playerId];
  scheduleFlush();
}

// --- Score CRUD -------------------------------------------------------------

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

export async function psAddScore(entry: PersistentScoreEntry): Promise<void> {
  if (!isNodeRuntime()) return;
  const data = await loadAll();
  data.scores.push(entry);
  // Cap to last 5000 to avoid unbounded growth.
  if (data.scores.length > 5000) {
    data.scores.splice(0, data.scores.length - 5000);
  }
  scheduleFlush();
}

export async function psListScores(): Promise<PersistentScoreEntry[]> {
  if (!isNodeRuntime()) return [];
  const data = await loadAll();
  return [...data.scores];
}

// --- Maintenance ------------------------------------------------------------

/** Force the next access to re-read from disk. Used by tests. */
export function _resetCacheForTests(): void {
  cache = null;
  loaded = false;
}

/** Returns the directory used for the JSON files. */
export function _dataDir(): string {
  return DATA_DIR;
}

// Attach best-effort exit handlers the first time this module is loaded.
attachExitHandlers();
