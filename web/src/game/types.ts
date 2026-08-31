// src/game/types.ts
// Forward declarations and types shared across game modules.

import type { Vec } from "./vec";

export type GameState =
  | "MENU"
  | "PLAYING"
  | "PAUSED"
  | "PAUSE_SETTINGS"
  | "PAUSE_CONTROLS"
  | "PAUSE_LEAVE_CONFIRM"
  | "PAUSE_SHOP"
  | "SHOP"
  | "UPGRADE"
  | "UPGRADE_INFO"
  | "SETTINGS"
  | "GAME_OVER";

export interface Stats {
  kills: number;
  kills_by_type: Record<string, number>;
  boss_kills: number;
  survival_time: number;
  shots_by_weapon: Record<string, number>;
}

export interface ToastEntry {
  text: string;
  remaining: number;
}

export interface WaveBanner {
  text: string;
  timer: number;
  boss: boolean;
}

// Loose interface intentionally — concrete Game class adds more fields.
// All consumers use `unknown` casts where structural mismatch matters.
export interface IGame {
  state: GameState;
  returnState: GameState;
  inRunContext: boolean;
  dt: number;
  map: import("./map").GameMap | null;
  player: import("./player").Player | null;
  zombies: import("./zombie").Zombie[];
  bullets: import("./bullet").Bullet[];
  enemyBullets: import("./bullet").Bullet[];
  loots: import("./loot").Loot[];
  particles: import("./particle").ParticleSystem;
  camera: import("./camera").Camera;
  waveManager: import("./waveManager").WaveManager;
  quests: import("./quest").QuestSystem;
  achievements: import("./achievement").AchievementSystem;
  save: import("./save").SaveManager;
  audio: import("./audio").AudioManager;
  shop: import("./shop").Shop;
  upgrades: import("./upgrade").UpgradeSystem;
  menus: import("./menu").MenuSystem;
  input: import("./input").InputManager;
  score: number;
  combo: number;
  comboTimer: number;
  elapsed: number;
  timeOfDay: number;
  stats: Stats;
  toasts: ToastEntry[];
  waveBanner: WaveBanner | null;
  newHigh: boolean;
  showFps: boolean;
  fpsDisplay: number;
  upgradeChoices: string[];
  saveButtonState?: "idle" | "saving" | "success" | "error";
  weaponData: Record<string, import("./data").WeaponData>;
  spawner: import("./spawner").ZombieSpawner;
  zgrid: Record<string, unknown[]>;
  toast(text: string): void;
  onLevelUp(): void;
  onZombieKilled(z: import("./zombie").Zombie): void;
  comboMultiplier(): number;
  wave_announce?(text: string, boss: boolean): void;
  applyDisplay(): void;
  isNight(): boolean;
  nightFactor(): number;
  toScreen(p: Vec): Vec;
}
