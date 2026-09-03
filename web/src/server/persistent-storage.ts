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
// IMPORTANT — Disk-authoritative (no in-memory cache):
//   Next.js dev compiles this module into a separate chunk per route, so
//   every API route holds its OWN instance of this module. A shared
//   in-memory cache (or debounced writes that live in one instance) would
//   therefore be invisible to the other routes: a player registered
//   through one route chunk would not be found by the login route chunk,
//   and pending debounced writes could be lost entirely. To keep every
//   route consistent we therefore read the JSON files from disk on every
//   access and write them through immediately on every mutation — no
//   module-level cache, no debounce timers.
//
// File layout (all under web/data/persistent/):
//   players.json   - Record<cleanUsername, PlayerRecord>
//   player_stats.json - Record<playerId, PlayerStats>
//   game_saves.json  - Record<playerId, GameSaveRecord>
//   scores.json      - Array<{...}>

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

async function readAllFresh(): Promise<FileShape> {
  await ensureDir();
  const [players, player_stats, game_saves, scores] = await Promise.all([
    readJson<Record<string, PlayerRecord>>("players", {}),
    readJson<Record<string, PlayerStats>>("player_stats", {}),
    readJson<Record<string, GameSaveRecord>>("game_saves", {}),
    readJson<FileShape["scores"]>("scores", []),
  ]);
  return { players, player_stats, game_saves, scores };
}

// Always reads a fresh snapshot from disk — never a module-level cache.
// Queued after any in-flight mutation in this process so the read sees the
// latest write-through result.
async function loadAll(): Promise<FileShape> {
  if (!isNodeRuntime()) return EMPTY;
  return writeQueue.run(() => readAllFresh());
}

// A tiny in-process promise queue. Next.js dev compiles this module into
// several independent chunks (one per route), so there is no shared mutable
// state to lock — but when two requests in the SAME process mutate the store
// concurrently, this chain still prevents a read-modify-write from being
// interleaved by another mutation between its read and its write.
const writeQueue = {
  tail: Promise.resolve() as Promise<unknown>,
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn);
    // Keep the chain alive even when a step rejects.
    this.tail = next.catch(() => undefined);
    return next;
  },
};

// Atomic read-modify-write: loads the four JSON files, applies `mutate` to
// the fresh snapshot, then writes all files back — entirely inside one queue
// task so concurrent mutations in the same process cannot interleave.
async function mutate<T>(fn: (data: FileShape) => T | Promise<T>): Promise<T> {
  if (!isNodeRuntime()) return fn(EMPTY) as T;
  const nb = nodeBuiltins();
  if (!nb) return fn(EMPTY) as T;
  return writeQueue.run(async () => {
    await ensureDir();
    const [players, player_stats, game_saves, scores] = await Promise.all([
      readJson<Record<string, PlayerRecord>>("players", {}),
      readJson<Record<string, PlayerStats>>("player_stats", {}),
      readJson<Record<string, GameSaveRecord>>("game_saves", {}),
      readJson<FileShape["scores"]>("scores", []),
    ]);
    const data: FileShape = { players, player_stats, game_saves, scores };
    const result = await fn(data);
    await Promise.all([
      nb.fs
        .writeFile(filePath("players"), JSON.stringify(data.players, null, 2), "utf8")
        .catch((e) => console.warn("persistent-storage: write players.json failed:", e?.message)),
      nb.fs
        .writeFile(filePath("player_stats"), JSON.stringify(data.player_stats, null, 2), "utf8")
        .catch((e) =>
          console.warn("persistent-storage: write player_stats.json failed:", e?.message)
        ),
      nb.fs
        .writeFile(filePath("game_saves"), JSON.stringify(data.game_saves, null, 2), "utf8")
        .catch((e) =>
          console.warn("persistent-storage: write game_saves.json failed:", e?.message)
        ),
      nb.fs
        .writeFile(filePath("scores"), JSON.stringify(data.scores, null, 2), "utf8")
        .catch((e) => console.warn("persistent-storage: write scores.json failed:", e?.message)),
    ]);
    return result;
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
  await mutate((data) => {
    data.players[player.username] = player;
  });
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
  await mutate((data) => {
    data.player_stats[stats.player_id] = stats;
  });
}

// --- Game Save CRUD ---------------------------------------------------------

export async function psGetSave(playerId: string): Promise<GameSaveRecord | null> {
  if (!isNodeRuntime()) return null;
  const data = await loadAll();
  return data.game_saves[playerId] || null;
}

export async function psUpsertSave(save: GameSaveRecord): Promise<void> {
  if (!isNodeRuntime()) return;
  await mutate((data) => {
    data.game_saves[save.player_id] = save;
  });
}

export async function psDeleteSave(playerId: string): Promise<void> {
  if (!isNodeRuntime()) return;
  await mutate((data) => {
    delete data.game_saves[playerId];
  });
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
  await mutate((data) => {
    data.scores.push(entry);
    // Cap to last 5000 to avoid unbounded growth.
    if (data.scores.length > 5000) {
      data.scores.splice(0, data.scores.length - 5000);
    }
  });
}

export async function psListScores(): Promise<PersistentScoreEntry[]> {
  if (!isNodeRuntime()) return [];
  const data = await loadAll();
  return [...data.scores];
}

// --- Maintenance ------------------------------------------------------------

/** No-op kept for API compatibility (the store is always disk-fresh now). */
export function _resetCacheForTests(): void {
  // nothing to reset — every access already re-reads from disk
}

/** No-op kept for API compatibility (writes are immediate, not debounced). */
export async function _flushNowForTests(): Promise<void> {
  // nothing to flush — writes already went through synchronously
}

/** Returns the directory used for the JSON files. */
export function _dataDir(): string {
  return getDataDir();
}
