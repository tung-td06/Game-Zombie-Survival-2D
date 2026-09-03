-- Zombie Survival 2D - Cloudflare D1 Migration
-- File: migrations/0001_initial.sql

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id            TEXT PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- Game Scores table
CREATE TABLE IF NOT EXISTS game_scores (
  id             TEXT PRIMARY KEY,
  player_id      TEXT NOT NULL,
  score          INTEGER NOT NULL DEFAULT 0,
  wave           INTEGER NOT NULL DEFAULT 0,
  zombies_killed INTEGER NOT NULL DEFAULT 0,
  survival_time  INTEGER NOT NULL DEFAULT 0,
  shots_fired    INTEGER NOT NULL DEFAULT 0,
  shots_hit      INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  FOREIGN KEY(player_id) REFERENCES players(id)
);

-- Player Stats table
CREATE TABLE IF NOT EXISTS player_stats (
  player_id            TEXT PRIMARY KEY,
  total_games          INTEGER NOT NULL DEFAULT 0,
  best_score           INTEGER NOT NULL DEFAULT 0,
  best_wave            INTEGER NOT NULL DEFAULT 0,
  total_zombies_killed INTEGER NOT NULL DEFAULT 0,
  best_survival_time   INTEGER NOT NULL DEFAULT 0,
  updated_at           INTEGER NOT NULL,
  FOREIGN KEY(player_id) REFERENCES players(id)
);

-- Game Saves table
CREATE TABLE IF NOT EXISTS game_saves (
  player_id        TEXT PRIMARY KEY,
  save_version     INTEGER NOT NULL DEFAULT 1,
  level            INTEGER NOT NULL DEFAULT 1,
  wave             INTEGER NOT NULL DEFAULT 1,
  score            INTEGER NOT NULL DEFAULT 0,
  money            INTEGER NOT NULL DEFAULT 0,
  player_data      TEXT NOT NULL DEFAULT '{}',
  weapon_data      TEXT,
  inventory_data   TEXT NOT NULL DEFAULT '{}',
  progression_data TEXT NOT NULL DEFAULT '{}',
  world_data       TEXT NOT NULL DEFAULT '{}',
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  FOREIGN KEY(player_id) REFERENCES players(id)
);

-- Leaderboard performance indexes
CREATE INDEX IF NOT EXISTS idx_game_scores_score ON game_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_game_scores_player ON game_scores(player_id);
CREATE INDEX IF NOT EXISTS idx_game_scores_wave ON game_scores(wave DESC);
CREATE INDEX IF NOT EXISTS idx_game_scores_created ON game_scores(created_at DESC);
