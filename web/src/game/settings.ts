// src/game/settings.ts
// Global configuration constants for Zombie Survival Web.
// Mirrors settings.py. Tune gameplay here.

export const SCREEN_WIDTH = 1280;
export const SCREEN_HEIGHT = 720;
export const FPS = 60;
export const WINDOW_TITLE = "ZOMBIE SURVIVAL";
export const RESOLUTIONS: ReadonlyArray<readonly [number, number]> = [
  [1280, 720],
  [1600, 900],
  [1920, 1080],
];

// World
export const WORLD_WIDTH = 4000;
export const WORLD_HEIGHT = 4000;
export const MAP_SEED = 20260823;
export const MINIMAP_SIZE = 160;


// Gameplay
export const PLAYER_RADIUS = 16;
export const PLAYER_BASE_SPEED = 230.0;
export const PLAYER_BASE_MAX_HP = 100.0;
export const BULLET_LIFETIME = 1.6;
export const MAX_PARTICLES = 900;
export const MAX_ALIVE_ZOMBIES = 200;

// Waves
export const BASE_WAVE_SIZE = 10;
export const WAVE_SIZE_GROWTH = 5;
export const WAVE_INTERMISSION = 5.0;
export const HP_GROWTH_PER_WAVE = 0.08;
export const SPEED_GROWTH_PER_WAVE = 0.02;
export const DAMAGE_GROWTH_PER_WAVE = 0.04;
export const SPAWN_MIN_DIST = 500.0;
export const SPAWN_MAX_DIST = 950.0;
export const FIRST_BOSS_WAVE = 5; // from this wave on, EVERY wave includes a boss

// Day/night
export const DAY_LENGTH = 120.0;
export const NIGHT_LENGTH = 70.0;
export const NIGHT_TRANSITION = 12.0;
export const NIGHT_SPEED_BONUS = 0.30;
export const NIGHT_DAMAGE_BONUS = 0.25;
export const NIGHT_SPAWN_MULT = 1.6;

// Scoring
export const COMBO_WINDOW = 3.0;
export const COMBO_KILLS_PER_STEP = 10;
export const COMBO_MAX_MULT = 5;

export const XP_BASE_REQUIREMENT = 100;

export let DEBUG = false;
export function setDebug(v: boolean) {
  DEBUG = v;
}
