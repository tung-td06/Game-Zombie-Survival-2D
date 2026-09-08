-- Zombie Survival 2D - Cloudflare D1 Migration
-- File: web/migrations/0005_game_saves_skill_tree.sql
--
-- Integrates the Skill Tree into the existing per-user save row
-- (game_saves). The tree is stored as flat, server-validated columns so the
-- upgrade endpoint can apply a spend with a single atomic UPDATE whose WHERE
-- clause enforces "has points" and "not maxed" on the database side.
--
-- `xp` is promoted to its own column (it previously lived only inside
-- player_data) so the server can validate level/xp independently of the
-- client-provided payload.
--
-- All columns are additive with default 0: existing saves automatically get
-- an empty skill tree (skill_points = 0, every skill = 0) with no data loss.

ALTER TABLE game_saves ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_saves ADD COLUMN skill_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_saves ADD COLUMN skill_damage INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_saves ADD COLUMN skill_fire_rate INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_saves ADD COLUMN skill_reload_speed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_saves ADD COLUMN skill_crit_chance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_saves ADD COLUMN skill_crit_damage INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_saves ADD COLUMN skill_max_hp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_saves ADD COLUMN skill_armor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_saves ADD COLUMN skill_hp_regen INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_saves ADD COLUMN skill_life_steal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_saves ADD COLUMN skill_move_speed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_saves ADD COLUMN skill_pickup_range INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_saves ADD COLUMN skill_pierce_bolt INTEGER NOT NULL DEFAULT 0;