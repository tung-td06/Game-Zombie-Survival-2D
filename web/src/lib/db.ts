// ---------------------------------------------------------------------------
// D1 Binding Lookup
// ---------------------------------------------------------------------------
// On Cloudflare Pages (Edge runtime), `getRequestContext()` exposes the
// `env.DB` binding configured in `wrangler.toml`. In any other environment
// (Node.js dev server, tests, plain `next dev`) the require() throws and we
// fall back to `null`, which makes the rest of this module automatically
// route reads/writes to the on-disk persistent JSON store.

export function getD1Database(): D1Database | null {
  try {
    // Guarded require so Edge bundlers don't trip on the dynamic import.
    const req = (eval("require") as NodeRequire | undefined);
    if (!req) return null;
    const { getRequestContext } = req("@cloudflare/next-on-pages") as {
      getRequestContext?: () => { env?: { DB?: D1Database } };
    };
    const ctx = getRequestContext?.();
    return (ctx?.env as any)?.DB ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface PlayerRecord {
  id: string;
  username: string;
  display_name: string | null;
  password_hash: string;
  created_at: number;
  updated_at: number;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
  wave: number;
  zombies_killed: number;
  survival_time: number;
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

export interface SubmitScoreInput {
  score: number;
  wave: number;
  zombies_killed: number;
  survival_time: number;
  shots_fired: number;
  shots_hit: number;
}

// ---------------------------------------------------------------------------
// Security: Web Crypto Password Hashing (PBKDF2)
// ---------------------------------------------------------------------------

function bufferToHex(buf: ArrayBuffer | Uint8Array): string {
  const arr =
    buf instanceof Uint8Array
      ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
      : new Uint8Array(buf);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  const derivedKey = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new Uint8Array(salt),
      iterations: 10000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return `$pbkdf2$${bufferToHex(salt)}$${bufferToHex(derivedKey)}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  try {
    const parts = storedHash.split("$");
    if (parts.length !== 4 || parts[1] !== "pbkdf2") return false;
    const salt = hexToBuffer(parts[2]);
    const expectedHashHex = parts[3];

    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );
    const derivedKey = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: new Uint8Array(salt),
        iterations: 10000,
        hash: "SHA-256",
      },
      keyMaterial,
      256
    );
    const actualHashHex = bufferToHex(derivedKey);
    return actualHashHex === expectedHashHex;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Security: Session Tokens (HMAC-SHA256 Cookie Token)
// ---------------------------------------------------------------------------

const SECRET_KEY = "zs-cloudflare-secret-key-change-in-prod";

async function getHmacKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSessionToken(
  playerId: string,
  username: string
): Promise<string> {
  const payload = {
    sub: playerId,
    name: username,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  };
  const enc = new TextEncoder();
  const payloadStr = btoa(JSON.stringify(payload));
  const key = await getHmacKey();
  const signatureBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(payloadStr)
  );
  const signature = bufferToHex(signatureBuf);
  return `${payloadStr}.${signature}`;
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<{ playerId: string; username: string } | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadStr, signature] = parts;

  try {
    const key = await getHmacKey();
    const enc = new TextEncoder();
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      new Uint8Array(hexToBuffer(signature)),
      enc.encode(payloadStr)
    );
    if (!isValid) return null;

    const payload = JSON.parse(atob(payloadStr));
    if (!payload.sub || !payload.name || payload.exp < Date.now()) {
      return null;
    }
    return { playerId: payload.sub, username: payload.name };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Persistent Fallback Storage (for local dev / missing D1 binding)
// ---------------------------------------------------------------------------
// In production on Cloudflare Pages, D1 is used directly. In any other
// environment (Node dev server, tests), reads/writes route to an on-disk
// JSON store so data survives process restarts, hot reloads and commits.
// See `persistent-storage.ts` for the file layout.

import {
  psGetPlayer,
  psGetPlayerById,
  psUpsertPlayer,
  psGetStats,
  psUpsertStats,
  psGetSave,
  psUpsertSave,
  psDeleteSave,
  psAddScore,
  psListScores,
  PersistentScoreEntry,
} from "./persistent-storage";

// ---------------------------------------------------------------------------
// In-Memory Fallback Storage (for local dev / missing D1 binding)
// ---------------------------------------------------------------------------
//
// A small in-process cache sits on top of the persistent store to avoid
// hitting the filesystem for every read. The cache is rebuilt lazily on
// first access; the persistent store is the source of truth.

const memoryPlayers = new Map<string, PlayerRecord>(); // clean username -> record (cache)
const memoryPlayersById = new Map<string, PlayerRecord>(); // id -> record (cache)
const memoryStats = new Map<string, PlayerStats>(); // playerId -> stats (cache)
const memorySaves = new Map<string, GameSaveRecord>(); // playerId -> save (cache)
const memoryScores: PersistentScoreEntry[] = []; // recent scores (cache)

// ---------------------------------------------------------------------------
// Compatibility profile helpers
// ---------------------------------------------------------------------------

export async function getProfile(
  db: D1Database | null | undefined,
  username: string
): Promise<any> {
  const player = await getPlayerByUsername(db, username);
  if (!player) return null;
  const stats = await getPlayerStats(db, player.id);
  return {
    high_score: stats?.best_score || 0,
    total_kills: stats?.total_zombies_killed || 0,
    player_level: 1,
  };
}

export async function saveProfile(
  db: D1Database | null | undefined,
  username: string,
  _profileData: any
): Promise<void> {
  let player = await getPlayerByUsername(db, username);
  if (!player) {
    const hash = await hashPassword("guest_pass_" + username);
    await createPlayer(db, username, hash, username);
  }
}

// ---------------------------------------------------------------------------
// D1 Database Operations: Player & Auth
// ---------------------------------------------------------------------------

export async function createPlayer(
  db: D1Database | null | undefined,
  username: string,
  passwordHash: string,
  displayName?: string
): Promise<PlayerRecord> {
  const cleanUsername = username.trim().toLowerCase();
  const id = crypto.randomUUID();
  const now = Date.now();
  const dispName = displayName?.trim() || cleanUsername;

  const playerRecord: PlayerRecord = {
    id,
    username: cleanUsername,
    display_name: dispName,
    password_hash: passwordHash,
    created_at: now,
    updated_at: now,
  };

  memoryPlayers.set(cleanUsername, playerRecord);
  memoryPlayersById.set(id, playerRecord);
  memoryStats.set(id, {
    player_id: id,
    total_games: 0,
    best_score: 0,
    best_wave: 0,
    total_zombies_killed: 0,
    best_survival_time: 0,
    updated_at: now,
  });

  if (db) {
    try {
      await db
        .prepare(
          `INSERT INTO players (id, username, display_name, password_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(id, cleanUsername, dispName, passwordHash, now, now)
        .run();

      await db
        .prepare(
          `INSERT INTO player_stats (player_id, total_games, best_score, best_wave, total_zombies_killed, best_survival_time, updated_at)
           VALUES (?, 0, 0, 0, 0, 0, ?)`
        )
        .bind(id, now)
        .run();
    } catch (err) {
      console.warn("D1 createPlayer write warning:", err);
    }
  } else {
    // Local dev / tests: persist to on-disk JSON so the account survives
    // process restarts and hot reloads.
    try {
      await psUpsertPlayer(playerRecord);
      await psUpsertStats({
        player_id: id,
        total_games: 0,
        best_score: 0,
        best_wave: 0,
        total_zombies_killed: 0,
        best_survival_time: 0,
        updated_at: now,
      });
    } catch (err) {
      console.warn("persistent createPlayer write warning:", err);
    }
  }

  return playerRecord;
}

export async function getPlayerByUsername(
  db: D1Database | null | undefined,
  username: string
): Promise<PlayerRecord | null> {
  const clean = username.trim().toLowerCase();
  if (db) {
    try {
      const row = await db
        .prepare("SELECT * FROM players WHERE username = ?")
        .bind(clean)
        .first<Record<string, any>>();

      if (row) {
        const player: PlayerRecord = {
          id: row.id as string,
          username: row.username as string,
          display_name: (row.display_name as string) || (row.username as string),
          password_hash: row.password_hash as string,
          created_at: row.created_at as number,
          updated_at: row.updated_at as number,
        };
        memoryPlayers.set(clean, player);
        memoryPlayersById.set(player.id, player);
        return player;
      }
    } catch (err) {
      console.warn("D1 getPlayerByUsername read error:", err);
    }
  }

  // No D1 (or D1 missed): consult in-memory cache, then persistent JSON.
  const cached = memoryPlayers.get(clean);
  if (cached) return cached;
  try {
    const persisted = await psGetPlayer(clean);
    if (persisted) {
      memoryPlayers.set(persisted.username, persisted);
      memoryPlayersById.set(persisted.id, persisted);
    }
    return persisted;
  } catch (err) {
    console.warn("persistent getPlayerByUsername read warning:", err);
    return null;
  }
}

export async function getPlayerById(
  db: D1Database | null | undefined,
  playerId: string
): Promise<PlayerRecord | null> {
  if (db) {
    try {
      const row = await db
        .prepare("SELECT * FROM players WHERE id = ?")
        .bind(playerId)
        .first<Record<string, any>>();

      if (row) {
        const player: PlayerRecord = {
          id: row.id as string,
          username: row.username as string,
          display_name: (row.display_name as string) || (row.username as string),
          password_hash: row.password_hash as string,
          created_at: row.created_at as number,
          updated_at: row.updated_at as number,
        };
        memoryPlayers.set(player.username, player);
        memoryPlayersById.set(playerId, player);
        return player;
      }
    } catch (err) {
      console.warn("D1 getPlayerById read error:", err);
    }
  }

  // Fall back to cache, then to persistent JSON store.
  const cached = memoryPlayersById.get(playerId);
  if (cached) return cached;
  try {
    const persisted = await psGetPlayerById(playerId);
    if (persisted) {
      memoryPlayersById.set(persisted.id, persisted);
      memoryPlayers.set(persisted.username, persisted);
    }
    return persisted;
  } catch (err) {
    console.warn("persistent getPlayerById read warning:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// D1 Database Operations: Score & Anti-Cheat Validation
// ---------------------------------------------------------------------------

export function validateScoreInput(input: SubmitScoreInput): { valid: boolean; error?: string } {
  const { score, wave, zombies_killed, survival_time, shots_fired, shots_hit } = input;

  if (typeof score !== "number" || isNaN(score) || score < 0) {
    return { valid: false, error: "Invalid score" };
  }
  if (typeof wave !== "number" || isNaN(wave) || wave < 0) {
    return { valid: false, error: "Invalid wave" };
  }
  if (typeof zombies_killed !== "number" || isNaN(zombies_killed) || zombies_killed < 0) {
    return { valid: false, error: "Invalid zombies_killed" };
  }
  if (typeof survival_time !== "number" || isNaN(survival_time) || survival_time < 0) {
    return { valid: false, error: "Invalid survival_time" };
  }
  if (typeof shots_fired !== "number" || isNaN(shots_fired) || shots_fired < 0) {
    return { valid: false, error: "Invalid shots_fired" };
  }
  if (typeof shots_hit !== "number" || isNaN(shots_hit) || shots_hit < 0) {
    return { valid: false, error: "Invalid shots_hit" };
  }
  if (shots_hit > shots_fired) {
    return { valid: false, error: "Shots hit cannot exceed shots fired" };
  }

  // Anti-cheat reasonable bounds check
  if (wave > 250) {
    return { valid: false, error: "Wave exceeds maximum threshold" };
  }
  const maxPossibleScore = wave * 100000 + zombies_killed * 2000 + 50000;
  if (score > maxPossibleScore) {
    return { valid: false, error: "Score exceeds plausible limit for run" };
  }

  return { valid: true };
}

export async function submitScore(
  db: D1Database | null | undefined,
  playerId: string,
  input: SubmitScoreInput
): Promise<void> {
  const scoreId = crypto.randomUUID();
  const now = Date.now();

  const player = await getPlayerById(db, playerId);
  const username = player?.display_name || player?.username || "Survivor";

  const newScore: PersistentScoreEntry = {
    id: scoreId,
    player_id: playerId,
    username,
    score: input.score,
    wave: input.wave,
    zombies_killed: input.zombies_killed,
    survival_time: input.survival_time,
    created_at: now,
  };
  memoryScores.push(newScore);

  const prevStats = memoryStats.get(playerId) || {
    player_id: playerId,
    total_games: 0,
    best_score: 0,
    best_wave: 0,
    total_zombies_killed: 0,
    best_survival_time: 0,
    updated_at: now,
  };

  memoryStats.set(playerId, {
    player_id: playerId,
    total_games: prevStats.total_games + 1,
    best_score: Math.max(prevStats.best_score, input.score),
    best_wave: Math.max(prevStats.best_wave, input.wave),
    total_zombies_killed: prevStats.total_zombies_killed + input.zombies_killed,
    best_survival_time: Math.max(prevStats.best_survival_time, input.survival_time),
    updated_at: now,
  });

  if (db) {
    try {
      const insertScoreStmt = db
        .prepare(
          `INSERT INTO game_scores
           (id, player_id, score, wave, zombies_killed, survival_time, shots_fired, shots_hit, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          scoreId,
          playerId,
          input.score,
          input.wave,
          input.zombies_killed,
          input.survival_time,
          input.shots_fired,
          input.shots_hit,
          now
        );

      const updateStatsStmt = db
        .prepare(
          `INSERT INTO player_stats
           (player_id, total_games, best_score, best_wave, total_zombies_killed, best_survival_time, updated_at)
           VALUES (?, 1, ?, ?, ?, ?, ?)
           ON CONFLICT(player_id) DO UPDATE SET
             total_games          = total_games + 1,
             best_score           = MAX(best_score, excluded.best_score),
             best_wave            = MAX(best_wave, excluded.best_wave),
             total_zombies_killed = total_zombies_killed + excluded.total_zombies_killed,
             best_survival_time   = MAX(best_survival_time, excluded.best_survival_time),
             updated_at           = excluded.updated_at`
        )
        .bind(
          playerId,
          input.score,
          input.wave,
          input.zombies_killed,
          input.survival_time,
          now
        );

      await db.batch([insertScoreStmt, updateStatsStmt]);
    } catch (err) {
      console.warn("D1 submitScore error:", err);
    }
  } else {
    // Persistent fallback path (local dev / tests).
    try {
      await psAddScore(newScore);

      // Mirror the stats update in the persistent store too.
      const persistedPrev = (await psGetStats(playerId)) || {
        player_id: playerId,
        total_games: 0,
        best_score: 0,
        best_wave: 0,
        total_zombies_killed: 0,
        best_survival_time: 0,
        updated_at: now,
      };
      await psUpsertStats({
        player_id: playerId,
        total_games: persistedPrev.total_games + 1,
        best_score: Math.max(persistedPrev.best_score, input.score),
        best_wave: Math.max(persistedPrev.best_wave, input.wave),
        total_zombies_killed: persistedPrev.total_zombies_killed + input.zombies_killed,
        best_survival_time: Math.max(persistedPrev.best_survival_time, input.survival_time),
        updated_at: now,
      });
    } catch (err) {
      console.warn("persistent submitScore error:", err);
    }
  }
}

// ---------------------------------------------------------------------------
// D1 Database Operations: Leaderboard & Stats
// ---------------------------------------------------------------------------

export async function getLeaderboardTop100(
  db: D1Database | null | undefined
): Promise<LeaderboardEntry[]> {
  if (db) {
    try {
      const { results } = await db
        .prepare(
          `SELECT
             gs.score,
             gs.wave,
             gs.zombies_killed,
             gs.survival_time,
             COALESCE(p.display_name, p.username) AS username
           FROM game_scores gs
           JOIN players p ON p.id = gs.player_id
           ORDER BY gs.score DESC, gs.wave DESC, gs.survival_time DESC
           LIMIT 100`
        )
        .all<Record<string, any>>();

      if (results && results.length > 0) {
        return results.map((row, idx) => ({
          rank: idx + 1,
          username: (row.username as string) || "Survivor",
          score: (row.score as number) || 0,
          wave: (row.wave as number) || 0,
          zombies_killed: (row.zombies_killed as number) || 0,
          survival_time: (row.survival_time as number) || 0,
        }));
      }
    } catch (err) {
      console.warn("D1 getLeaderboardTop100 error:", err);
    }
  }

  // Merge in-memory cache with any new entries from persistent store, then
  // sort + cap to top 100.
  let allScores: PersistentScoreEntry[] = [...memoryScores];
  try {
    const persisted = await psListScores();
    if (persisted.length > 0) {
      const seen = new Set(allScores.map((s) => s.id));
      for (const s of persisted) if (!seen.has(s.id)) allScores.push(s);
    }
  } catch (err) {
    console.warn("persistent getLeaderboardTop100 read warning:", err);
  }

  const sorted = allScores.sort((a, b) => {
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
}

export async function getPlayerStats(
  db: D1Database | null | undefined,
  playerId: string
): Promise<PlayerStats | null> {
  if (db) {
    try {
      const row = await db
        .prepare("SELECT * FROM player_stats WHERE player_id = ?")
        .bind(playerId)
        .first<Record<string, any>>();

      if (row) {
        const stats: PlayerStats = {
          player_id: row.player_id as string,
          total_games: row.total_games as number,
          best_score: row.best_score as number,
          best_wave: row.best_wave as number,
          total_zombies_killed: row.total_zombies_killed as number,
          best_survival_time: row.best_survival_time as number,
          updated_at: row.updated_at as number,
        };
        memoryStats.set(playerId, stats);
        return stats;
      }
    } catch (err) {
      console.warn("D1 getPlayerStats error:", err);
    }
  }

  const cached = memoryStats.get(playerId);
  if (cached) return cached;
  try {
    const persisted = await psGetStats(playerId);
    if (persisted) {
      memoryStats.set(playerId, persisted);
      return persisted;
    }
  } catch (err) {
    console.warn("persistent getPlayerStats read warning:", err);
  }

  return {
    player_id: playerId,
    total_games: 0,
    best_score: 0,
    best_wave: 0,
    total_zombies_killed: 0,
    best_survival_time: 0,
    updated_at: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// D1 Database Operations: Game Saves
// ---------------------------------------------------------------------------

export async function getGameSave(
  db: D1Database | null | undefined,
  playerId: string
): Promise<GameSaveRecord | null> {
  if (db) {
    try {
      const row = await db
        .prepare("SELECT * FROM game_saves WHERE player_id = ?")
        .bind(playerId)
        .first<Record<string, any>>();

      if (row) {
        const saveRec: GameSaveRecord = {
          player_id: row.player_id as string,
          save_version: row.save_version as number,
          level: row.level as number,
          wave: row.wave as number,
          score: row.score as number,
          money: row.money as number,
          player_data: JSON.parse(row.player_data as string),
          weapon_data: row.weapon_data ? JSON.parse(row.weapon_data as string) : null,
          inventory_data: JSON.parse(row.inventory_data as string),
          progression_data: JSON.parse(row.progression_data as string),
          world_data: JSON.parse(row.world_data as string),
          created_at: row.created_at as number,
          updated_at: row.updated_at as number,
        };
        memorySaves.set(playerId, saveRec);
        return saveRec;
      }
    } catch (err) {
      console.warn("D1 getGameSave error:", err);
    }
  }

  const cached = memorySaves.get(playerId);
  if (cached) return cached;
  try {
    const persisted = await psGetSave(playerId);
    if (persisted) {
      memorySaves.set(playerId, persisted);
      return persisted;
    }
  } catch (err) {
    console.warn("persistent getGameSave read warning:", err);
  }

  return null;
}

export async function saveGameSave(
  db: D1Database | null | undefined,
  playerId: string,
  savePayload: any
): Promise<void> {
  const now = Date.now();
  const existingSave = memorySaves.get(playerId);
  const createdAt = existingSave ? existingSave.created_at : now;

  const saveRec: GameSaveRecord = {
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
    created_at: createdAt,
    updated_at: now,
  };
  memorySaves.set(playerId, saveRec);

  if (db) {
    try {
      await db
        .prepare(
          `INSERT INTO game_saves
             (player_id, save_version, level, wave, score, money,
              player_data, weapon_data, inventory_data, progression_data, world_data, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(player_id) DO UPDATE SET
             save_version     = excluded.save_version,
             level            = excluded.level,
             wave             = excluded.wave,
             score            = excluded.score,
             money            = excluded.money,
             player_data      = excluded.player_data,
             weapon_data      = excluded.weapon_data,
             inventory_data   = excluded.inventory_data,
             progression_data = excluded.progression_data,
             world_data       = excluded.world_data,
             updated_at       = excluded.updated_at`
        )
        .bind(
          playerId,
          saveRec.save_version,
          saveRec.level,
          saveRec.wave,
          saveRec.score,
          saveRec.money,
          JSON.stringify(saveRec.player_data),
          saveRec.weapon_data ? JSON.stringify(saveRec.weapon_data) : null,
          JSON.stringify(saveRec.inventory_data),
          JSON.stringify(saveRec.progression_data),
          JSON.stringify(saveRec.world_data),
          createdAt,
          now
        )
        .run();
    } catch (err) {
      console.warn("D1 saveGameSave error:", err);
    }
  } else {
    // Local dev / tests: write to the on-disk JSON store.
    try {
      await psUpsertSave(saveRec);
    } catch (err) {
      console.warn("persistent saveGameSave write warning:", err);
    }
  }
}

export async function deleteGameSave(
  db: D1Database | null | undefined,
  playerId: string
): Promise<void> {
  memorySaves.delete(playerId);
  if (db) {
    try {
      await db
        .prepare("DELETE FROM game_saves WHERE player_id = ?")
        .bind(playerId)
        .run();
    } catch (err) {
      console.warn("D1 deleteGameSave error:", err);
    }
  } else {
    try {
      await psDeleteSave(playerId);
    } catch (err) {
      console.warn("persistent deleteGameSave write warning:", err);
    }
  }
}
