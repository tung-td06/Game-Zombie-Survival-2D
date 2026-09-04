// src/game/data.ts
// JSON loaders. Files live in /public/data and are served statically.

import { safeJson } from "./utils";

export interface WeaponData {
  name: string;
  damage: number;
  magazine: number;
  fire_rate: number;
  reload_time: number;
  bullet_speed: number;
  /** Max reach in px before the projectile expires; falls back to speed * BULLET_LIFETIME. */
  range?: number;
  spread_deg: number;
  pellets: number;
  critical_chance: number;
  critical_multiplier: number;
  auto: boolean;
  price: number;
  start_reserve: number;
}

export interface ZombieData {
  name: string;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  attack_range: number;
  attack_cooldown: number;
  detection_range: number;
  score: number;
  coins: number;
  xp: number;
  explosion_damage?: number;
  explosion_radius?: number;
  projectile_speed?: number;
  barrage_interval?: number;
  barrage_bullets?: number;
}

export interface UpgradeDef {
  id: string;
  text: string;
  desc: string;
}

export interface UpgradeCatalog {
  upgrades: UpgradeDef[];
  limits: Record<string, number>;
}

async function fetchJSON<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`fetch ${path}: ${r.status}`);
  return (await r.json()) as T;
}

/** Synchronous parse for bundled/cached content. */
export function parseJSON<T>(text: string): T {
  return safeJson<T>(text, {} as T);
}

let cache: {
  weapons?: Record<string, WeaponData>;
  zombies?: Record<string, ZombieData>;
  upgrades?: UpgradeCatalog;
} = {};

export async function loadWeapons(): Promise<Record<string, WeaponData>> {
  if (cache.weapons) return cache.weapons;
  cache.weapons = await fetchJSON<Record<string, WeaponData>>("/data/weapons.json");
  return cache.weapons;
}

export async function loadZombies(): Promise<Record<string, ZombieData>> {
  if (cache.zombies) return cache.zombies;
  cache.zombies = await fetchJSON<Record<string, ZombieData>>("/data/zombies.json");
  return cache.zombies;
}

export async function loadUpgrades(): Promise<UpgradeCatalog> {
  if (cache.upgrades) return cache.upgrades;
  cache.upgrades = await fetchJSON<UpgradeCatalog>("/data/upgrades.json");
  return cache.upgrades;
}

export function clearDataCache() {
  cache = {};
}
