-- Zombie Survival 2D - Cloudflare D1 Migration
-- File: web/migrations/0002_player_stats.sql
--
-- Adds the `player_stats` table that pairs every `players` row with
-- aggregate gameplay metrics. The original 0001_initial.sql omitted this
-- table, which caused `createPlayer` to throw a foreign-key constraint
-- failure when it tried to insert a sibling row in `player_stats`.
--
-- This migration is idempotent (CREATE TABLE IF NOT EXISTS) and safe to
-- re-run on databases where the table already exists.

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

-- Backfill any existing players that don't have a stats row yet so that
-- the foreign key relationship stays consistent.
INSERT OR IGNORE INTO player_stats (player_id, total_games, best_score, best_wave, total_zombies_killed, best_survival_time, updated_at)
SELECT id, 0, 0, 0, 0, 0, CAST(strftime('%s','now') AS INTEGER) * 1000
FROM players
WHERE id NOT IN (SELECT player_id FROM player_stats);
