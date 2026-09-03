-- Zombie Survival 2D - D1 Database Schema
-- Migration: 0001_init

-- Player profiles table
CREATE TABLE IF NOT EXISTS profiles (
  username         TEXT PRIMARY KEY,
  high_score       INTEGER NOT NULL DEFAULT 0,
  total_kills      INTEGER NOT NULL DEFAULT 0,
  coins            INTEGER NOT NULL DEFAULT 0,
  player_level     INTEGER NOT NULL DEFAULT 1,
  xp               INTEGER NOT NULL DEFAULT 0,
  unlocked_weapons TEXT    NOT NULL DEFAULT '["pistol"]',
  weapon_upgrades  TEXT    NOT NULL DEFAULT '{}',
  player_upgrades  TEXT    NOT NULL DEFAULT '{}',
  achievements     TEXT    NOT NULL DEFAULT '[]',
  quests_claimed   TEXT    NOT NULL DEFAULT '[]',
  settings         TEXT    NOT NULL DEFAULT '{}'
);

-- Leaderboard table (one entry per player, best score only)
CREATE TABLE IF NOT EXISTS leaderboard (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT    NOT NULL UNIQUE,
  score    INTEGER NOT NULL DEFAULT 0,
  kills    INTEGER NOT NULL DEFAULT 0,
  wave     INTEGER NOT NULL DEFAULT 1,
  level    INTEGER NOT NULL DEFAULT 1,
  date     TEXT    NOT NULL
);

-- Game saves table (one active save per player)
CREATE TABLE IF NOT EXISTS game_saves (
  username         TEXT    PRIMARY KEY,
  save_version     INTEGER NOT NULL,
  level            INTEGER NOT NULL,
  wave             INTEGER NOT NULL,
  score            INTEGER NOT NULL,
  money            INTEGER NOT NULL,
  player_data      TEXT    NOT NULL,
  weapon_data      TEXT,
  inventory_data   TEXT    NOT NULL DEFAULT '{}',
  progression_data TEXT    NOT NULL DEFAULT '{}',
  world_data       TEXT    NOT NULL DEFAULT '{}',
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL
);
