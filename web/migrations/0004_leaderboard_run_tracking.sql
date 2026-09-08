-- Zombie Survival 2D - Cloudflare D1 Migration
-- File: web/migrations/0004_leaderboard_run_tracking.sql
--
-- Leaderboard score rows are now tied to a per-run identifier so that
-- repeated saves of the same run (Save Game, then Game Over) UPSERT the
-- same row instead of creating unbounded duplicates, and so each row records
-- how the run ended.
--
--  * run_id       - client-generated UUID identifying one game run.
--  * game_status  - 'saved' (run saved mid-way) or 'game_over' (run ended).
--  * updated_at   - last time the row was written (== created_at on insert).
--
-- All changes are additive: existing rows keep run_id = NULL (SQLite treats
-- NULLs as distinct in a unique index, so the index below cannot fail on
-- legacy duplicates), and the new columns have safe defaults.

ALTER TABLE game_scores ADD COLUMN run_id TEXT;
ALTER TABLE game_scores ADD COLUMN game_status TEXT NOT NULL DEFAULT 'game_over';
ALTER TABLE game_scores ADD COLUMN updated_at INTEGER;

-- Backfill updated_at for pre-existing rows so ordering/logs stay consistent.
UPDATE game_scores SET updated_at = created_at WHERE updated_at IS NULL;

-- Upsert target for submitScore's ON CONFLICT(player_id, run_id) clause.
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_scores_run_unique
  ON game_scores(player_id, run_id);