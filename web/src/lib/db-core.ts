// ---------------------------------------------------------------------------
// D1 Binding Lookup (Edge-safe)
// ---------------------------------------------------------------------------
// On Cloudflare Pages (Edge runtime), `getRequestContext()` exposes the
// `env.DB` binding configured in `wrangler.toml`. In any other environment
// (Node.js dev server, tests, plain `next dev`) the require() throws and we
// fall back to `null`, which makes the rest of this module automatically
// route reads/writes to a server-only persistent storage module.
//
// This module is intentionally Edge-compatible: it MUST NOT import any
// Node.js-only modules (node:fs, node:path, etc.) at the top level.
// The Node-only persistent fallback is loaded lazily via dynamic import
// from `db.ts` and lives in `src/server/persistent-storage.ts` so the
// Cloudflare Pages Edge bundler never sees it.

// Cloudflare's request context symbol, kept in sync with the one used by
// `@cloudflare/next-on-pages` (`dist/api/getRequestContext.ts`). Reading the
// binding this way works both in the Pages worker (where the main entry sets
// globalThis[SYMBOL] with { env, ctx, cf } per request) and in the Next.js
// dev server with `setupDevPlatform()` — without requiring a static import
// of the next-on-pages package, which would drag `server-only` into the
// edge bundle.
const CLOUDFLARE_REQUEST_CONTEXT_SYMBOL =
  typeof Symbol !== "undefined" && Symbol.for
    ? Symbol.for("__cloudflare-request-context__")
    : "__cloudflare-request-context__";

export function getD1Database(): D1Database | null {
  try {
    const g = globalThis as Record<PropertyKey, unknown>;
    const holder = g[CLOUDFLARE_REQUEST_CONTEXT_SYMBOL] as
      | { env?: Record<string, unknown> }
      | undefined;
    const db = holder?.env?.DB;
    return (db as D1Database | undefined) ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lazy Node-only persistent fallback
// ---------------------------------------------------------------------------
// When no D1 binding exists (Node dev server, plain `next dev`, tests) every
// read/write below routes to the JSON store in `src/server/persistent-storage.ts`.
// That module uses `node:fs`/`node:path`, so it is loaded lazily through a
// dynamic import whose path is assembled at runtime — the same trick used by
// `src/lib/db.ts` — which keeps the Node imports out of the Cloudflare Pages /
// Edge bundle. On Edge the loader returns null (not a Node runtime) and the
// D1 SQL paths below run instead.

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
  // ESM, Next Node dev). Specifiers are assembled at runtime so no bundler
  // (webpack / next-on-pages Edge) can statically trace `node:fs`/`node:path`
  // into the Edge bundle: relative-with-extension works on native ESM / vitest,
  // relative extensionless under webpack-style Node resolution, and the "@/"
  // alias form where the alias is applied. Cloudflare Pages always has the D1
  // binding, so this fallback is never invoked there.
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
      } catch (err) {
        console.warn(
          "db-core loadPersistent: candidate",
          dynamicPath,
          "failed:",
          (err as Error)?.message
        );
      }
    }
    return null;
  })();
  return persistentModulePromise;
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
  /** Skill Tree state (columns added by migration 0005). */
  xp?: number;
  skill_points?: number;
  /** skill id -> level, e.g. { damage: 4, max_hp: 7 }. */
  skills?: Record<string, number>;
}

/**
 * Server-validated Skill Tree state for one player. `level`/`xp` come from
 * the run, `skill_points` are the unspent points, `skills` maps skill id to
 * learned level. The server enforces the invariant
 * `skill_points + sum(skills) <= level - 1` (every level-up grants one
 * point) so a client can never fabricate points.
 */
export interface SkillState {
  level: number;
  xp: number;
  skill_points: number;
  skills: Record<string, number>;
}

/**
 * Skill catalog shared by the upgrade API. `column` is the game_saves column
 * that stores the learned level; `max` is the level cap. Must stay in sync
 * with `web/public/data/upgrades.json` and `src/game/upgrade.ts`.
 */
export const SKILL_CATALOG: Record<
  string,
  { column: string; max: number }
> = {
  damage:      { column: "skill_damage",        max: 5 },
  fire_rate:   { column: "skill_fire_rate",     max: 5 },
  reload:      { column: "skill_reload_speed",  max: 5 },
  crit_ch:     { column: "skill_crit_chance",   max: 5 },
  crit_dmg:    { column: "skill_crit_damage",   max: 5 },
  max_hp:      { column: "skill_max_hp",        max: 10 },
  armor:       { column: "skill_armor",         max: 10 },
  regen:       { column: "skill_hp_regen",      max: 5 },
  vampire:     { column: "skill_life_steal",    max: 5 },
  speed:       { column: "skill_move_speed",    max: 5 },
  magnet:      { column: "skill_pickup_range",  max: 5 },
  pierce:      { column: "skill_pierce_bolt",   max: 5 },
};

/** Column list used by the skill-state SQL statements. */
const SKILL_COLUMNS = Object.values(SKILL_CATALOG).map((s) => s.column);

/**
 * Normalize (and clamp) a client-provided skill state into a valid one.
 * Every number is floored to a safe integer; skills are clamped to their
 * catalog cap; skill_points are clamped so the earned-points invariant
 * `skill_points + sum(skills) <= level - 1` always holds.
 */
export function normalizeSkillState(input: Partial<SkillState>): SkillState {
  const level = Math.max(1, Math.min(9999, Math.floor(Number(input.level) || 1)));
  const xp = Math.max(0, Math.floor(Number(input.xp) || 0));
  const skills: Record<string, number> = {};
  let sum = 0;
  for (const uid of Object.keys(SKILL_CATALOG)) {
    const v = Math.max(
      0,
      Math.min(
        SKILL_CATALOG[uid]!.max,
        Math.floor(Number(input.skills?.[uid]) || 0)
      )
    );
    skills[uid] = v;
    sum += v;
  }
  const maxPoints = Math.max(0, level - 1 - sum);
  const skill_points = Math.max(
    0,
    Math.min(maxPoints, Math.floor(Number(input.skill_points) || 0))
  );
  return { level, xp, skill_points, skills };
}

/** Build a SkillState from a game_saves row (or a partial row). */
function rowToSkillState(row: Record<string, any>): SkillState {
  return normalizeSkillState({
    level: row.level,
    xp: row.xp,
    skill_points: row.skill_points,
    skills: SKILL_COLUMNS.reduce((acc, col) => {
      // col is one of the hardcoded catalog columns (skill_*), so the reverse
      // lookup is always safe here.
      const uid = Object.keys(SKILL_CATALOG).find(
        (k) => SKILL_CATALOG[k]!.column === col
      )!;
      acc[uid] = Math.max(0, Math.floor(Number(row[col]) || 0));
      return acc;
    }, {} as Record<string, number>),
  });
}

export interface SubmitScoreInput {
  score: number;
  wave: number;
  zombies_killed: number;
  survival_time: number;
  shots_fired: number;
  shots_hit: number;
  /** Per-run identifier so repeated saves of the same run upsert one row. */
  run_id?: string;
  /** How the run ended: "saved" (mid-run save) or "game_over". */
  game_status?: "saved" | "game_over";
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
  run_id?: string;
  game_status?: "saved" | "game_over";
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

// Session signing secret. Prefer a per-deployment secret via the
// `SESSION_SECRET` env var (set in the Cloudflare dashboard / [vars]);
// the fallback keeps previously issued sessions valid and matches the
// value used by every deployment so far.
const SECRET_KEY =
  process.env.SESSION_SECRET || "zs-cloudflare-secret-key-change-in-prod";

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
// Compatibility profile helpers (legacy /api/profile endpoints)
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

  if (db) {
    // Persist the account. A failed write MUST surface as an error (the
    // caller turns it into a 500) instead of being swallowed — otherwise the
    // API would report success while no row exists in D1 and the account
    // could never log in afterwards.
    try {
      await db
        .prepare(
          `INSERT INTO players (id, username, display_name, password_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(id, cleanUsername, dispName, passwordHash, now, now)
        .run();

      try {
        await db
          .prepare(
            `INSERT INTO player_stats (player_id, total_games, best_score, best_wave, total_zombies_killed, best_survival_time, updated_at)
             VALUES (?, 0, 0, 0, 0, 0, ?)`
          )
          .bind(id, now)
          .run();
      } catch (err) {
        // Roll back the player row so a half-created account (a player
        // without its stats row) never lingers in the database.
        await db
          .prepare("DELETE FROM players WHERE id = ?")
          .bind(id)
          .run()
          .catch(() => undefined);
        throw err;
      }
    } catch (err) {
      console.error("D1 createPlayer write failed:", err);
      throw new Error("Failed to persist player in D1");
    }
  } else {
    // No D1 binding (Node dev / tests): persist through the JSON store and
    // seed an empty stats row, mirroring the D1 inserts above.
    const m = await loadPersistent();
    if (!m) {
      // No D1 binding AND no Node fallback store (e.g. deployed on
      // Cloudflare with the DB binding missing): fail loudly instead of
      // returning a fake "success".
      console.error("createPlayer: no database binding available");
      throw new Error("No database binding available");
    }
    await m.psUpsertPlayer(playerRecord);
    await m.psUpsertStats({
      player_id: id,
      total_games: 0,
      best_score: 0,
      best_wave: 0,
      total_zombies_killed: 0,
      best_survival_time: 0,
      updated_at: now,
    });
  }

  return playerRecord;
}

export async function getPlayerByUsername(
  db: D1Database | null | undefined,
  username: string
): Promise<PlayerRecord | null> {
  const clean = username.trim().toLowerCase();
  if (!db) {
    const m = await loadPersistent();
    if (!m) return null;
    return m.psGetPlayer(clean);
  }
  // DB read errors intentionally propagate to the caller (which returns a
  // 500) instead of being swallowed and reported as "user not found".
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
  db: D1Database | null | undefined,
  playerId: string
): Promise<PlayerRecord | null> {
  if (!db) {
    const m = await loadPersistent();
    if (!m) return null;
    return m.psGetPlayerById(playerId);
  }
  // DB read errors intentionally propagate to the caller (which returns a
  // 500) instead of being swallowed and reported as "player not found".
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
  db: D1Database | null | undefined,
  playerId: string,
  input: SubmitScoreInput
): Promise<void> {
  if (!db) {
    // No D1 binding: persist the score + update stats through the JSON store,
    // mirroring the D1 batch insert / upsert below.
    const m = await loadPersistent();
    if (!m) return;
    const player = await m.psGetPlayerById(playerId);
    const now = Date.now();
    await m.psAddScore({
      id: crypto.randomUUID(),
      player_id: playerId,
      username: player?.display_name || player?.username || "Survivor",
      score: input.score,
      wave: input.wave,
      zombies_killed: input.zombies_killed,
      survival_time: input.survival_time,
      created_at: now,
      run_id: input.run_id,
      game_status: input.game_status,
    });
    const prev = await m.psGetStats(playerId);
    // Totals are derived from the actual run rows so repeated submissions of
    // the same run (save + game over upserts) never double-count.
    const runs = (await m.psListScores()).filter(
      (r) => r.player_id === playerId
    );
    await m.psUpsertStats({
      player_id: playerId,
      total_games: runs.length,
      best_score: Math.max(prev?.best_score || 0, input.score),
      best_wave: Math.max(prev?.best_wave || 0, input.wave),
      total_zombies_killed: runs.reduce(
        (sum, r) => sum + (r.zombies_killed || 0),
        0
      ),
      best_survival_time: Math.max(
        prev?.best_survival_time || 0,
        input.survival_time
      ),
      updated_at: now,
    });
    return;
  }
  const scoreId = crypto.randomUUID();
  const now = Date.now();
  // One leaderboard row per run: the same (player_id, run_id) updates the
  // existing row instead of inserting duplicates (Save Game and Game Over of
  // the same run must converge on a single record).
  const runId = input.run_id?.trim() || null;
  const gameStatus: "saved" | "game_over" =
    input.game_status === "saved" ? "saved" : "game_over";

  try {
    const insertScoreStmt = db
      .prepare(
        `INSERT INTO game_scores
         (id, player_id, run_id, game_status, score, wave, zombies_killed, survival_time, shots_fired, shots_hit, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(player_id, run_id) DO UPDATE SET
           score           = excluded.score,
           wave            = excluded.wave,
           zombies_killed  = excluded.zombies_killed,
           survival_time   = excluded.survival_time,
           shots_fired     = excluded.shots_fired,
           shots_hit       = excluded.shots_hit,
           game_status     = excluded.game_status,
           updated_at      = excluded.updated_at`
      )
      .bind(
        scoreId,
        playerId,
        runId,
        gameStatus,
        input.score,
        input.wave,
        input.zombies_killed,
        input.survival_time,
        input.shots_fired,
        input.shots_hit,
        now,
        now
      );

    const updateStatsStmt = db
      .prepare(
        `INSERT INTO player_stats
         (player_id, total_games, best_score, best_wave, total_zombies_killed, best_survival_time, updated_at)
         VALUES (?, 1, ?, ?, ?, ?, ?)
         ON CONFLICT(player_id) DO UPDATE SET
           total_games          = (SELECT COUNT(*) FROM game_scores gs WHERE gs.player_id = excluded.player_id),
           best_score           = MAX(best_score, excluded.best_score),
           best_wave            = MAX(best_wave, excluded.best_wave),
           total_zombies_killed = (SELECT COALESCE(SUM(gs.zombies_killed), 0) FROM game_scores gs WHERE gs.player_id = excluded.player_id),
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
}

// ---------------------------------------------------------------------------
// D1 Database Operations: Leaderboard & Stats
// ---------------------------------------------------------------------------

export async function getLeaderboardTop100(
  db: D1Database | null | undefined
): Promise<LeaderboardEntry[]> {
  if (!db) {
    const m = await loadPersistent();
    if (!m) return [];
    const scores = await m.psListScores();
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

    if (!results || results.length === 0) return [];
    return results.map((row, idx) => ({
      rank: idx + 1,
      username: (row.username as string) || "Survivor",
      score: (row.score as number) || 0,
      wave: (row.wave as number) || 0,
      zombies_killed: (row.zombies_killed as number) || 0,
      survival_time: (row.survival_time as number) || 0,
    }));
  } catch (err) {
    console.warn("D1 getLeaderboardTop100 error:", err);
    return [];
  }
}

export async function getPlayerStats(
  db: D1Database | null | undefined,
  playerId: string
): Promise<PlayerStats | null> {
  if (!db) {
    const m = await loadPersistent();
    if (!m) return null;
    return m.psGetStats(playerId);
  }
  try {
    const row = await db
      .prepare("SELECT * FROM player_stats WHERE player_id = ?")
      .bind(playerId)
      .first<Record<string, any>>();

    if (!row) return null;
    return {
      player_id: row.player_id as string,
      total_games: row.total_games as number,
      best_score: row.best_score as number,
      best_wave: row.best_wave as number,
      total_zombies_killed: row.total_zombies_killed as number,
      best_survival_time: row.best_survival_time as number,
      updated_at: row.updated_at as number,
    };
  } catch (err) {
    console.warn("D1 getPlayerStats error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// D1 Database Operations: Game Saves
// ---------------------------------------------------------------------------

export async function getGameSave(
  db: D1Database | null | undefined,
  playerId: string
): Promise<GameSaveRecord | null> {
  if (!db) {
    const m = await loadPersistent();
    if (!m) return null;
    const rec = await m.psGetSave(playerId);
    if (!rec) return null;
    return {
      player_id: rec.player_id,
      save_version: rec.save_version,
      level: rec.level,
      wave: rec.wave,
      score: rec.score,
      money: rec.money,
      player_data: rec.player_data,
      weapon_data: rec.weapon_data ?? null,
      inventory_data: rec.inventory_data,
      progression_data: rec.progression_data,
      world_data: rec.world_data,
      created_at: rec.created_at,
      updated_at: rec.updated_at,
      xp: rec.xp,
      skill_points: rec.skill_points,
      skills: rec.skills,
    };
  }
  try {
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
      // Skill Tree columns (migration 0005). Falls back to the values stored
      // inside player_data for saves written before the migration.
      xp: row.xp ?? (JSON.parse(row.player_data as string).xp ?? 0),
      skill_points:
        row.skill_points ??
        (JSON.parse(row.player_data as string).skillPoints ?? 0),
      skills: row.skill_points !== undefined ? rowToSkillState(row).skills : undefined,
    };
  } catch (err) {
    console.warn("D1 getGameSave error:", err);
    return null;
  }
}

export async function saveGameSave(
  db: D1Database | null | undefined,
  playerId: string,
  savePayload: any
): Promise<void> {
  if (!db) {
    const m = await loadPersistent();
    if (!m) return;
    const now = Date.now();
    const existing = await m.psGetSave(playerId);
    await m.psUpsertSave({
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
      inventory_data:
        savePayload.inventory ?? savePayload.inventory_data ?? {},
      progression_data:
        savePayload.progression ?? savePayload.progression_data ?? {},
      world_data: savePayload.world ?? savePayload.world_data ?? {},
      created_at: existing?.created_at ?? now,
      updated_at: now,
      // Skill Tree columns (mirrors the D1 INSERT below).
      xp: savePayload.player?.xp ?? 0,
      skill_points: savePayload.player?.skillPoints ?? 0,
      skills: { ...(savePayload.player?.upgradeLevels ?? {}) },
    });
    return;
  }
  const now = Date.now();

  // Read existing created_at if present so we can preserve it.
  let createdAt = now;
  try {
    const existing = await db
      .prepare("SELECT created_at FROM game_saves WHERE player_id = ?")
      .bind(playerId)
      .first<{ created_at: number }>();
    if (existing && typeof existing.created_at === "number") {
      createdAt = existing.created_at;
    }
  } catch {
    // ignore; use `now` as fallback
  }

  try {
    const skillCols = SKILL_COLUMNS;
    const skillVals = skillCols.map((col) => {
      const uid = Object.keys(SKILL_CATALOG).find(
        (k) => SKILL_CATALOG[k]!.column === col
      )!;
      return Math.max(0, Math.floor(Number(savePayload.player?.upgradeLevels?.[uid]) || 0));
    });
    const cols = [
      "player_id",
      "save_version",
      "level",
      "xp",
      "wave",
      "score",
      "money",
      "skill_points",
      ...skillCols,
      "player_data",
      "weapon_data",
      "inventory_data",
      "progression_data",
      "world_data",
      "created_at",
      "updated_at",
    ];
    const placeholders = cols.map(() => "?").join(", ");
    const setClauses = cols
      .filter((c) => c !== "player_id" && c !== "created_at")
      .map((c) => `${c} = excluded.${c}`)
      .join(", ");
    await db
      .prepare(
        `INSERT INTO game_saves (${cols.join(", ")})
         VALUES (${placeholders})
         ON CONFLICT(player_id) DO UPDATE SET ${setClauses}`
      )
      .bind(
        playerId,
        savePayload.save_version || 1,
        savePayload.level || 1,
        Math.max(0, Math.floor(Number(savePayload.player?.xp) || 0)),
        savePayload.wave || 1,
        savePayload.score || 0,
        savePayload.money || 0,
        Math.max(0, Math.floor(Number(savePayload.player?.skillPoints) || 0)),
        ...skillVals,
        JSON.stringify(savePayload.player || {}),
        savePayload.weapons ? JSON.stringify(savePayload.weapons) : null,
        JSON.stringify(savePayload.inventory || {}),
        JSON.stringify(savePayload.progression || {}),
        JSON.stringify(savePayload.world || {}),
        createdAt,
        now
      )
      .run();
  } catch (err) {
    console.warn("D1 saveGameSave error:", err);
  }
}

export async function deleteGameSave(
  db: D1Database | null | undefined,
  playerId: string
): Promise<void> {
  if (!db) {
    const m = await loadPersistent();
    if (!m) return;
    await m.psDeleteSave(playerId);
    return;
  }
  try {
    await db
      .prepare("DELETE FROM game_saves WHERE player_id = ?")
      .bind(playerId)
      .run();
  } catch (err) {
    console.warn("D1 deleteGameSave error:", err);
  }
}

/**
 * Fresh run progression written when a player starts a NEW GAME. The account
 * row (players / player_stats / leaderboard history) is untouched — only the
 * single in-progress save is replaced. This is a server-generated clean
 * state, so a client can never "reset" by echoing its own stale save back.
 * Values intentionally mirror the game's fresh-run constants:
 *   level 1, xp 0, money 0, pistol owned/unlocked/equipped only,
 *   no weapon mods, no drone (UFO), empty skill tree, 0 skill points,
 *   wave 1, empty run stats.
 */
export async function resetGameSave(
  db: D1Database | null | undefined,
  playerId: string
): Promise<void> {
  const freshPayload = {
    save_version: 1,
    level: 1,
    wave: 1,
    score: 0,
    money: 0,
    player: {
      // World centre (WORLD_WIDTH/2, WORLD_HEIGHT/2) — same as a fresh run.
      x: 2000,
      y: 2000,
      hp: 100,
      maxHp: 100,
      armor: 0,
      xp: 0,
      skillPoints: 0,
      upgradeLevels: {},
      hasDrone: false,
      bombs: 2, // BOMB_START_COUNT
    },
    weapons: {
      currentId: "pistol",
      unlocked: ["pistol"],
      ammo: {},
      mods: {},
    },
    inventory: {},
    progression: {
      combo: 0,
      comboTimer: 0,
      elapsed: 0,
      timeOfDay: 10,
      stats: {
        kills: 0,
        kills_by_type: {},
        boss_kills: 0,
        survival_time: 0,
        shots_by_weapon: {},
        shots_fired: 0,
        shots_hit: 0,
      },
      waveManager: {
        state: "intermission",
        timer: 3,
        to_spawn: 0,
        spawned_this_wave: 0,
        spawnTimer: 0,
        spawnInterval: 1.5,
        hpMult: 1,
        speedMult: 1,
        dmgMult: 1,
        bossAlive: false,
      },
    },
    world: {
      seed: 0,
      loot: [],
      supplyCrates: [],
      crateTimer: 30, // CRATE_SPAWN_INTERVAL
    },
  };
  await saveGameSave(db, playerId, freshPayload);
}

// ---------------------------------------------------------------------------
// D1 Database Operations: Skill Tree
// ---------------------------------------------------------------------------

/**
 * Read a player's current Skill Tree state from game_saves (or null when
 * they have no save row yet, which is the "fresh" state: level 1, 0 points,
 * all skills 0).
 */
export async function getSkillState(
  db: D1Database | null | undefined,
  playerId: string
): Promise<SkillState | null> {
  if (!db) {
    const m = await loadPersistent();
    if (!m) return null;
    return m.psGetSkillState(playerId);
  }
  try {
    const cols = ["level", "xp", "skill_points", ...SKILL_COLUMNS].join(", ");
    const row = await db
      .prepare(`SELECT ${cols} FROM game_saves WHERE player_id = ?`)
      .bind(playerId)
      .first<Record<string, any>>();
    if (!row) return null;
    return rowToSkillState(row);
  } catch (err) {
    console.warn("D1 getSkillState error:", err);
    return null;
  }
}

/**
 * Server-side upsert of a player's Skill Tree state. The input is
 * normalized/clamped (see normalizeSkillState) before it is written, so a
 * client can never store an invalid level, negative points, a skill above
 * its cap, or more points than level-ups actually granted. Creates the
 * game_saves row when the player has not saved the run yet (level-ups
 * persist immediately, before the first explicit SAVE GAME).
 *
 * Returns the normalized state that was persisted.
 */
export async function syncSkillState(
  db: D1Database | null | undefined,
  playerId: string,
  input: Partial<SkillState>
): Promise<SkillState> {
  const state = normalizeSkillState(input);
  if (!db) {
    const m = await loadPersistent();
    if (!m) return state;
    await m.psSyncSkillState(playerId, state);
    return state;
  }
  const now = Date.now();
  const skillVals = SKILL_COLUMNS.map((col) => {
    const uid = Object.keys(SKILL_CATALOG).find(
      (k) => SKILL_CATALOG[k]!.column === col
    )!;
    return state.skills[uid] ?? 0;
  });
  const cols = [
    "player_id",
    "level",
    "xp",
    "skill_points",
    ...SKILL_COLUMNS,
    "created_at",
    "updated_at",
  ];
  const placeholders = cols.map(() => "?").join(", ");
  const setClauses = cols
    .filter((c) => c !== "player_id" && c !== "created_at")
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");
  try {
    await db
      .prepare(
        `INSERT INTO game_saves (${cols.join(", ")})
         VALUES (${placeholders})
         ON CONFLICT(player_id) DO UPDATE SET ${setClauses}`
      )
      .bind(
        playerId,
        state.level,
        state.xp,
        state.skill_points,
        ...skillVals,
        now,
        now
      )
      .run();
  } catch (err) {
    console.warn("D1 syncSkillState error:", err);
    throw new Error("Failed to persist skill state");
  }
  return state;
}

export type SkillUpgradeResult =
  | { ok: true; state: SkillState }
  | { ok: false; error: string; state: SkillState | null };

/**
 * Spend one skill point on `uid`. The spend is a single atomic UPDATE whose
 * WHERE clause enforces `skill_points > 0` and `skill_<uid> < max` inside
 * the database, so two racing requests can never double-spend one point.
 * On success the new state is returned; on failure the reason
 * ("no save" / "not enough points" / "maxed") plus the current state.
 */
export async function upgradeSkill(
  db: D1Database | null | undefined,
  playerId: string,
  uid: string
): Promise<SkillUpgradeResult> {
  const skill = SKILL_CATALOG[uid];
  if (!skill) return { ok: false, error: "Unknown skill", state: null };
  if (!db) {
    const m = await loadPersistent();
    if (!m) return { ok: false, error: "No database available", state: null };
    return m.psUpgradeSkill(playerId, uid, skill.max);
  }
  const col = skill.column;
  const now = Date.now();
  try {
    const res = await db
      .prepare(
        `UPDATE game_saves
           SET skill_points = skill_points - 1,
               ${col} = ${col} + 1,
               updated_at = ?
         WHERE player_id = ? AND skill_points > 0 AND ${col} < ?`
      )
      .bind(now, playerId, skill.max)
      .run();
    if (!res.meta?.changes) {
      const st = await getSkillState(db, playerId);
      if (!st) return { ok: false, error: "No save found", state: null };
      if (st.skill_points <= 0) {
        return { ok: false, error: "Not enough skill points", state: st };
      }
      if ((st.skills[uid] ?? 0) >= skill.max) {
        return { ok: false, error: "Skill already maxed", state: st };
      }
      return { ok: false, error: "Upgrade failed", state: st };
    }
    const st = await getSkillState(db, playerId);
    return { ok: true, state: st ?? (await syncSkillState(db, playerId, {})) };
  } catch (err) {
    console.warn("D1 upgradeSkill error:", err);
    return { ok: false, error: "Database error", state: null };
  }
}
