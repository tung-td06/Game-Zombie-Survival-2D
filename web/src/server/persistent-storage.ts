// Persistent JSON Storage Fallback (Node.js only)
// -----------------------------------------------
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
// IMPORTANT — Edge bundle isolation:
//   This file lives in `src/server/` and uses Node.js-only modules
//   (`node:fs`, `node:path`). It is **NEVER imported by any file in
//   `src/app/`** (which is bundled for the Cloudflare Edge runtime).
//   The `db.ts` shim loads it lazily via dynamic `import()` only on the
//   Node.js dev server, after the Edge bundler has already been
//   satisfied with the `db-core.ts` code path.
//
// File layout (all under web/data/persistent/):
//   players.json   - Map<cleanUsername, PlayerRecord>
//   player_stats.json - Map<playerId, PlayerStats>
//   game_saves.json  - Map<playerId, GameSaveRecord>
//   scores.json      - Array<{...}>
//
// Writes are debounced (200ms) to avoid hammering the disk while still
// giving strong durability guarantees between commits and restarts.

// Node builtins are loaded lazily via a guarded require (never statically
// imported) so this module compiles cleanly inside the Next.js dev Edge
// bundler, where only runtime access decides whether fs/path are available.
function nodeBuiltins(): {
  fs: typeof import("node:fs")["promises"];
  path: typeof import("node:path");
} | null {
  try {
    const req = (eval("require") as NodeRequire | undefined);
    if (!req) return null;
    const fsMod = req("fs") as typeof import("node:fs");
    const pathMod = req("path") as typeof import("node:path");
    if (!fsMod?.promises || !pathMod?.join) return null;
    return { fs: fsMod.promises, path: pathMod };
  } catch {
    return null;
  }
}

// Local type duplicates — kept inline (and exported) to avoid pulling
// the Edge-bundled `db-core.ts` into this Node-only file. The shapes
// intentionally mirror those in `db-core.ts`.
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

// Resolved per call so tests can redirect the store to a sandbox directory
// via `PERSISTENT_TEST_DIR` before the first read/write.
function getDataDir(): string {
  const override = process.env.PERSISTENT_TEST_DIR;
  if (override) return override;
  const nb = nodeBuiltins();
  if (!nb) return "";
  return nb.path.join(process.cwd(), "data", "persistent");
}

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
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let pendingWrite = false;

function isNodeRuntime(): boolean {
  // fs/promises are only available in Node, not in Edge/Workers.
  // We do a soft check to avoid hard failures on Edge.
  try {
    return typeof process !== "undefined" && !!(process as any).versions?.node;
  } catch {
    return false;
  }
}

async function ensureDir(): Promise<void> {
  if (!isNodeRuntime()) return;
  const nb = nodeBuiltins();
  if (!nb) return;
  try {
    await nb.fs.mkdir(getDataDir(), { recursive: true });
  } catch {
    // ignore
  }
}

function filePath(name: keyof FileShape): string {
  const nb = nodeBuiltins();
  if (!nb) return "";
  return nb.path.join(getDataDir(), `${name}.json`);
}

async function readJson<T>(name: keyof FileShape, fallback: T): Promise<T> {
  if (!isNodeRuntime()) return fallback;
  const nb = nodeBuiltins();
  if (!nb) return fallback;
  try {
    const buf = await nb.fs.readFile(filePath(name), "utf8");
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
  const nb = nodeBuiltins();
  if (!nb) return;
  pendingWrite = false;
  const snapshot = cache;
  await ensureDir();
  await Promise.all([
    nb.fs
      .writeFile(filePath("players"), JSON.stringify(snapshot.players, null, 2), "utf8")
      .catch((e) =>
        console.warn("persistent-storage: write players.json failed:", e?.message)
      ),
    nb.fs
      .writeFile(
        filePath("player_stats"),
        JSON.stringify(snapshot.player_stats, null, 2),
        "utf8"
      )
      .catch((e) =>
        console.warn("persistent-storage: write player_stats.json failed:", e?.message)
      ),
    nb.fs
      .writeFile(filePath("game_saves"), JSON.stringify(snapshot.game_saves, null, 2), "utf8")
      .catch((e) =>
        console.warn("persistent-storage: write game_saves.json failed:", e?.message)
      ),
    nb.fs
      .writeFile(filePath("scores"), JSON.stringify(snapshot.scores, null, 2), "utf8")
      .catch((e) =>
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

/** Force pending debounced writes to disk immediately. Used by tests. */
export function _flushNowForTests(): Promise<void> {
  return flushNow();
}

/** Returns the directory used for the JSON files. */
export function _dataDir(): string {
  return getDataDir();
}

// Attach best-effort exit handlers the first time this module is loaded.
attachExitHandlers();
