-- Zombie Survival 2D - Cloudflare D1 Migration
-- File: web/migrations/0003_game_saves_player_id.sql
--
-- Rebuilds `game_saves` on the player_id-keyed schema that the API
-- actually uses (see src/lib/db-core.ts).
--
-- Background: an early migration (0001_init.sql) created a `game_saves`
-- table keyed by TEXT `username`, and the later `0001_initial.sql` could
-- not create its own (player_id-keyed) version because CREATE TABLE IF
-- NOT EXISTS silently skipped an existing table of the same name. Any
-- database that applied 0001_init therefore still has the username-keyed
-- shape, so the save/load endpoints (which query by player_id) silently
-- fail. Fresh databases get the correct table from 0001_initial, in which
-- case the DROP below is a no-op and the CREATE restores the identical
-- schema.
--
-- The table only holds one active save per player; replacing it costs at
-- most that one in-progress save (there is no per-run history to lose).

DROP TABLE IF EXISTS game_saves;

CREATE TABLE game_saves (
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
