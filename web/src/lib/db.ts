import { getRequestContext } from "@cloudflare/next-on-pages";

export function getD1Database(): D1Database | null {
  try {
    const ctx = getRequestContext();
    return ctx?.env?.DB ?? null;
  } catch {
    return null;
  }
}

export interface LeaderboardEntry {
  username: string;
  score: number;
  kills: number;
  wave: number;
  level: number;
  date: string;
}

export interface GameSave {
  username: string;
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
  created_at: string;
  updated_at: string;
}

export interface ProfileData {
  high_score: number;
  total_kills: number;
  coins: number;
  player_level: number;
  xp: number;
  unlocked_weapons: string[];
  weapon_upgrades: Record<string, any>;
  player_upgrades: Record<string, any>;
  achievements: string[];
  quests_claimed: string[];
  settings: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Profile operations
// ---------------------------------------------------------------------------

export async function getProfile(
  db: D1Database,
  username: string
): Promise<ProfileData | null> {
  const row = await db
    .prepare("SELECT * FROM profiles WHERE username = ?")
    .bind(username.toLowerCase())
    .first<Record<string, any>>();

  if (!row) return null;

  return {
    high_score: row.high_score as number,
    total_kills: row.total_kills as number,
    coins: row.coins as number,
    player_level: row.player_level as number,
    xp: row.xp as number,
    unlocked_weapons: JSON.parse(row.unlocked_weapons as string),
    weapon_upgrades: JSON.parse(row.weapon_upgrades as string),
    player_upgrades: JSON.parse(row.player_upgrades as string),
    achievements: JSON.parse(row.achievements as string),
    quests_claimed: JSON.parse(row.quests_claimed as string),
    settings: JSON.parse(row.settings as string),
  };
}

export async function saveProfile(
  db: D1Database,
  username: string,
  profileData: ProfileData
): Promise<void> {
  const key = username.toLowerCase();
  await db
    .prepare(
      `INSERT INTO profiles
         (username, high_score, total_kills, coins, player_level, xp,
          unlocked_weapons, weapon_upgrades, player_upgrades,
          achievements, quests_claimed, settings)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET
         high_score       = excluded.high_score,
         total_kills      = excluded.total_kills,
         coins            = excluded.coins,
         player_level     = excluded.player_level,
         xp               = excluded.xp,
         unlocked_weapons = excluded.unlocked_weapons,
         weapon_upgrades  = excluded.weapon_upgrades,
         player_upgrades  = excluded.player_upgrades,
         achievements     = excluded.achievements,
         quests_claimed   = excluded.quests_claimed,
         settings         = excluded.settings`
    )
    .bind(
      key,
      profileData.high_score ?? 0,
      profileData.total_kills ?? 0,
      profileData.coins ?? 0,
      profileData.player_level ?? 1,
      profileData.xp ?? 0,
      JSON.stringify(profileData.unlocked_weapons ?? ["pistol"]),
      JSON.stringify(profileData.weapon_upgrades ?? {}),
      JSON.stringify(profileData.player_upgrades ?? {}),
      JSON.stringify(profileData.achievements ?? []),
      JSON.stringify(profileData.quests_claimed ?? []),
      JSON.stringify(profileData.settings ?? {})
    )
    .run();
}

// ---------------------------------------------------------------------------
// Leaderboard operations
// ---------------------------------------------------------------------------

export async function getLeaderboard(
  db: D1Database
): Promise<LeaderboardEntry[]> {
  const { results } = await db
    .prepare(
      "SELECT username, score, kills, wave, level, date FROM leaderboard ORDER BY score DESC LIMIT 20"
    )
    .all<LeaderboardEntry>();
  return results;
}

export async function addLeaderboardEntry(
  db: D1Database,
  entry: LeaderboardEntry
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO leaderboard (username, score, kills, wave, level, date)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET
         score = CASE WHEN excluded.score > leaderboard.score THEN excluded.score ELSE leaderboard.score END,
         kills = CASE WHEN excluded.score > leaderboard.score THEN excluded.kills ELSE leaderboard.kills END,
         wave  = CASE WHEN excluded.score > leaderboard.score THEN excluded.wave  ELSE leaderboard.wave  END,
         level = CASE WHEN excluded.score > leaderboard.score THEN excluded.level ELSE leaderboard.level END,
         date  = CASE WHEN excluded.score > leaderboard.score THEN excluded.date  ELSE leaderboard.date  END`
    )
    .bind(
      entry.username.toLowerCase(),
      entry.score,
      entry.kills,
      entry.wave,
      entry.level,
      entry.date
    )
    .run();
}

// ---------------------------------------------------------------------------
// Game save operations
// ---------------------------------------------------------------------------

export async function getGameSave(
  db: D1Database,
  username: string
): Promise<GameSave | null> {
  const row = await db
    .prepare("SELECT * FROM game_saves WHERE username = ?")
    .bind(username.toLowerCase())
    .first<Record<string, any>>();

  if (!row) return null;

  return {
    username: (row.username as string).toLowerCase(),
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
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function saveGameSave(
  db: D1Database,
  username: string,
  save: GameSave
): Promise<void> {
  const key = username.toLowerCase();
  await db
    .prepare(
      `INSERT INTO game_saves
         (username, save_version, level, wave, score, money,
          player_data, weapon_data, inventory_data, progression_data,
          world_data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET
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
      key,
      save.save_version,
      save.level,
      save.wave,
      save.score,
      save.money,
      JSON.stringify(save.player_data),
      save.weapon_data ? JSON.stringify(save.weapon_data) : null,
      JSON.stringify(save.inventory_data ?? {}),
      JSON.stringify(save.progression_data ?? {}),
      JSON.stringify(save.world_data ?? {}),
      save.created_at,
      save.updated_at
    )
    .run();
}

export async function deleteGameSave(
  db: D1Database,
  username: string
): Promise<void> {
  await db
    .prepare("DELETE FROM game_saves WHERE username = ?")
    .bind(username.toLowerCase())
    .run();
}
