// ---------------------------------------------------------------------------
// db.ts — data layer (local-first, no Cloudflare)
// ---------------------------------------------------------------------------
// Every account, score and game save is persisted by the Node JSON store in
// `src/server/persistent-storage.ts` (files under `web/data/persistent/`),
// which is imported statically here so it runs on the regular Next.js Node
// server (`npm run dev` / `npm run start`). The old Cloudflare D1 binding
// and Edge-only lazy-loading machinery have been removed; nothing in this
// module depends on a Cloudflare environment.
//
// Passwords use PBKDF2 (Web Crypto) and sessions are HMAC-signed cookies
// with a 30-day expiry, so the only server state besides the JSON files is
// the session secret below.
// ---------------------------------------------------------------------------

import {
  psGetPlayer,
  psGetPlayerById,
  psUpsertPlayer,
  psListPlayers,
  psGetStats,
  psUpsertStats,
  psGetSave,
  psUpsertSave,
  psDeleteSave,
  psAddScore,
  psListScores,
} from "../server/persistent-storage";

export type {
  PlayerRecord,
  PlayerStats,
  GameSaveRecord,
  PersistentScoreEntry,
} from "../server/persistent-storage";

import type {
  PlayerRecord,
  PlayerStats,
  GameSaveRecord,
  PersistentScoreEntry,
} from "../server/persistent-storage";

export interface SubmitScoreInput {
  score: number;
  wave: number;
  zombies_killed: number;
  survival_time: number;
  shots_fired: number;
  shots_hit: number;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
  wave: number;
  zombies_killed: number;
  survival_time: number;
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

// Override with the SESSION_SECRET environment variable in production so
// sessions survive restarts and can't be forged by someone reading the repo.
const SESSION_SECRET =
  (typeof process !== "undefined" && process.env.SESSION_SECRET) ||
  "zs-session-secret-change-in-prod";

async function getHmacKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(SESSION_SECRET),
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
// Player & Auth
// ---------------------------------------------------------------------------

export async function createPlayer(
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

  return playerRecord;
}

export async function getPlayerByUsername(
  username: string
): Promise<PlayerRecord | null> {
  return psGetPlayer(username.trim().toLowerCase());
}

export async function getPlayerById(playerId: string): Promise<PlayerRecord | null> {
  return psGetPlayerById(playerId);
}

// ---------------------------------------------------------------------------
// Scores & Leaderboard
// ---------------------------------------------------------------------------

export function validateScoreInput(input: SubmitScoreInput): {
  valid: boolean;
  error?: string;
} {
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
  playerId: string,
  input: SubmitScoreInput
): Promise<void> {
  const player = await psGetPlayerById(playerId);
  const now = Date.now();
  await psAddScore({
    id: crypto.randomUUID(),
    player_id: playerId,
    username: player?.display_name || player?.username || "Survivor",
    score: input.score,
    wave: input.wave,
    zombies_killed: input.zombies_killed,
    survival_time: input.survival_time,
    created_at: now,
  });
  const prev = await psGetStats(playerId);
  await psUpsertStats({
    player_id: playerId,
    total_games: (prev?.total_games || 0) + 1,
    best_score: Math.max(prev?.best_score || 0, input.score),
    best_wave: Math.max(prev?.best_wave || 0, input.wave),
    total_zombies_killed: (prev?.total_zombies_killed || 0) + input.zombies_killed,
    best_survival_time: Math.max(prev?.best_survival_time || 0, input.survival_time),
    updated_at: now,
  });
}

export async function getLeaderboardTop100(): Promise<LeaderboardEntry[]> {
  const scores = await psListScores();
  const sorted = [...scores]
    .sort(
      (a, b) =>
        b.score - a.score || b.wave - a.wave || b.survival_time - a.survival_time
    )
    .slice(0, 100);
  return sorted.map((row, idx) => ({
    rank: idx + 1,
    username: row.username || "Survivor",
    score: row.score || 0,
    wave: row.wave || 0,
    zombies_killed: row.zombies_killed || 0,
    survival_time: row.survival_time || 0,
  }));
}

export async function getPlayerStats(playerId: string): Promise<PlayerStats | null> {
  return psGetStats(playerId);
}

// ---------------------------------------------------------------------------
// Game Saves
// ---------------------------------------------------------------------------

export async function getGameSave(playerId: string): Promise<GameSaveRecord | null> {
  return psGetSave(playerId);
}

export async function saveGameSave(
  playerId: string,
  savePayload: any
): Promise<void> {
  const now = Date.now();
  const existing = await psGetSave(playerId);
  await psUpsertSave({
    player_id: playerId,
    save_version: savePayload.save_version || 1,
    level: savePayload.level || 1,
    wave: savePayload.wave || 1,
    score: savePayload.score || 0,
    money: savePayload.money || 0,
    player_data: savePayload.player ?? savePayload.player_data ?? {},
    weapon_data: savePayload.weapons
      ? savePayload.weapons
      : savePayload.weapon_data ?? null,
    inventory_data: savePayload.inventory ?? savePayload.inventory_data ?? {},
    progression_data: savePayload.progression ?? savePayload.progression_data ?? {},
    world_data: savePayload.world ?? savePayload.world_data ?? {},
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });
}

export async function deleteGameSave(playerId: string): Promise<void> {
  await psDeleteSave(playerId);
}

// ---------------------------------------------------------------------------
// Compatibility profile helpers (legacy /api/profile endpoints)
// ---------------------------------------------------------------------------

export async function getProfile(username: string): Promise<any> {
  const player = await getPlayerByUsername(username);
  if (!player) return null;
  const stats = await getPlayerStats(player.id);
  return {
    high_score: stats?.best_score || 0,
    total_kills: stats?.total_zombies_killed || 0,
    player_level: 1,
  };
}

export async function saveProfile(username: string, _profileData: any): Promise<void> {
  let player = await getPlayerByUsername(username);
  if (!player) {
    const hash = await hashPassword("guest_pass_" + username);
    await createPlayer(username, hash, username);
  }
}

// Re-export the raw store helpers for callers that need direct access
// (e.g. tests, maintenance scripts).
export {
  psListPlayers,
  psGetSave,
  psUpsertSave,
  psDeleteSave,
  psListScores,
  psGetStats,
  psUpsertStats,
};
