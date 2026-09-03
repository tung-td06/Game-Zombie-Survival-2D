export function getD1Database(): D1Database | null {
  try {
    const { getRequestContext } = require("@cloudflare/next-on-pages");
    const ctx = getRequestContext();
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

function bufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
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
  return `$pbkdf2$${bufferToHex(salt.buffer)}$${bufferToHex(derivedKey)}`;
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
// Compatibility profile helpers
// ---------------------------------------------------------------------------

export async function getProfile(
  db: D1Database,
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
  db: D1Database,
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
  db: D1Database,
  username: string,
  passwordHash: string,
  displayName?: string
): Promise<PlayerRecord> {
  const cleanUsername = username.trim().toLowerCase();
  const id = crypto.randomUUID();
  const now = Date.now();
  const dispName = displayName?.trim() || cleanUsername;

  await db
    .prepare(
      `INSERT INTO players (id, username, display_name, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, cleanUsername, dispName, passwordHash, now, now)
    .run();

  // Initialize player_stats
  await db
    .prepare(
      `INSERT INTO player_stats (player_id, total_games, best_score, best_wave, total_zombies_killed, best_survival_time, updated_at)
       VALUES (?, 0, 0, 0, 0, 0, ?)`
    )
    .bind(id, now)
    .run();

  return {
    id,
    username: cleanUsername,
    display_name: dispName,
    password_hash: passwordHash,
    created_at: now,
    updated_at: now,
  };
}

export async function getPlayerByUsername(
  db: D1Database,
  username: string
): Promise<PlayerRecord | null> {
  const clean = username.trim().toLowerCase();
  const row = await db
    .prepare("SELECT * FROM players WHERE username = ?")
    .bind(clean)
    .first<Record<string, any>>();

  if (!row) return null;
  return {
    id: row.id as string,
    username: row.username as string,
    display_name: (row.display_name as string) || (row.username as string),
    password_hash: row.password_hash as string,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
  };
}

export async function getPlayerById(
  db: D1Database,
  playerId: string
): Promise<PlayerRecord | null> {
  const row = await db
    .prepare("SELECT * FROM players WHERE id = ?")
    .bind(playerId)
    .first<Record<string, any>>();

  if (!row) return null;
  return {
    id: row.id as string,
    username: row.username as string,
    display_name: (row.display_name as string) || (row.username as string),
    password_hash: row.password_hash as string,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
  };
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
  db: D1Database,
  playerId: string,
  input: SubmitScoreInput
): Promise<void> {
  const scoreId = crypto.randomUUID();
  const now = Date.now();

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
}

// ---------------------------------------------------------------------------
// D1 Database Operations: Leaderboard & Stats
// ---------------------------------------------------------------------------

export async function getLeaderboardTop100(db: D1Database): Promise<LeaderboardEntry[]> {
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

  return (results || []).map((row, idx) => ({
    rank: idx + 1,
    username: (row.username as string) || "Survivor",
    score: (row.score as number) || 0,
    wave: (row.wave as number) || 0,
    zombies_killed: (row.zombies_killed as number) || 0,
    survival_time: (row.survival_time as number) || 0,
  }));
}

export async function getPlayerStats(
  db: D1Database,
  playerId: string
): Promise<PlayerStats | null> {
  const row = await db
    .prepare("SELECT * FROM player_stats WHERE player_id = ?")
    .bind(playerId)
    .first<Record<string, any>>();

  if (!row) {
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

  return {
    player_id: row.player_id as string,
    total_games: row.total_games as number,
    best_score: row.best_score as number,
    best_wave: row.best_wave as number,
    total_zombies_killed: row.total_zombies_killed as number,
    best_survival_time: row.best_survival_time as number,
    updated_at: row.updated_at as number,
  };
}

// ---------------------------------------------------------------------------
// D1 Database Operations: Game Saves
// ---------------------------------------------------------------------------

export async function getGameSave(
  db: D1Database,
  playerId: string
): Promise<GameSaveRecord | null> {
  const row = await db
    .prepare("SELECT * FROM game_saves WHERE player_id = ?")
    .bind(playerId)
    .first<Record<string, any>>();

  if (!row) return null;

  return {
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
}

export async function saveGameSave(
  db: D1Database,
  playerId: string,
  savePayload: any
): Promise<void> {
  const now = Date.now();
  const existingSave = await getGameSave(db, playerId);
  const createdAt = existingSave ? existingSave.created_at : now;

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
      savePayload.save_version || 1,
      savePayload.level || 1,
      savePayload.wave || 1,
      savePayload.score || 0,
      savePayload.money || 0,
      JSON.stringify(savePayload.player || {}),
      savePayload.weapons ? JSON.stringify(savePayload.weapons) : null,
      JSON.stringify(savePayload.inventory || {}),
      JSON.stringify(savePayload.progression || {}),
      JSON.stringify(savePayload.world || {}),
      createdAt,
      now
    )
    .run();
}

export async function deleteGameSave(
  db: D1Database,
  playerId: string
): Promise<void> {
  await db
    .prepare("DELETE FROM game_saves WHERE player_id = ?")
    .bind(playerId)
    .run();
}
