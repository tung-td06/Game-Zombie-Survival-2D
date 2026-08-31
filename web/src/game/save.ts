// src/game/save.ts
// Persistent profile, persisted in localStorage. Mirrors save_manager.py.

import { safeJson } from "./utils";

export const SAVE_KEY = "zs.save.v1";

export interface SaveData {
  high_score: number;
  total_kills: number;
  coins: number;
  player_level: number;
  xp: number;
  unlocked_weapons: string[];
  weapon_upgrades: Record<string, unknown>;
  player_upgrades: Record<string, number>;
  achievements: string[];
  quests_claimed: string[];
  settings: {
    master_volume: number;
    music_volume: number;
    sfx_volume: number;
    muted: boolean;
    fullscreen: boolean;
    show_fps: boolean;
    resolution_index: number;
    screen_shake: boolean;
    damage_numbers: boolean;
    hit_effects: boolean;
    brightness: number;
    bindings: Record<string, string>;
  };
}

export const DEFAULT_SAVE: SaveData = {
  high_score: 0,
  total_kills: 0,
  coins: 0,
  player_level: 1,
  xp: 0,
  unlocked_weapons: ["pistol"],
  weapon_upgrades: {},
  player_upgrades: {},
  achievements: [],
  quests_claimed: [],
  settings: {
    master_volume: 0.8,
    music_volume: 0.6,
    sfx_volume: 0.8,
    muted: false,
    fullscreen: false,
    show_fps: false,
    resolution_index: 0,
    screen_shake: true,
    damage_numbers: true,
    hit_effects: true,
    brightness: 1,
    bindings: {
      up: "KeyW",
      down: "KeyS",
      left: "KeyA",
      right: "KeyD",
      reload: "KeyR",
      weapon1: "Digit1",
      weapon2: "Digit2",
      weapon3: "Digit3",
      weapon4: "Digit4",
      weapon5: "Digit5",
      next_weapon: "MouseMiddle",
      vacuum: "KeyE",
      pause: "Escape",
      debug: "F3",
      fullscreen: "F11",
    },
  },
};

function defaults(): SaveData {
  return JSON.parse(JSON.stringify(DEFAULT_SAVE));
}

function mergeInto(target: SaveData, source: SaveData): SaveData {
  const out = { ...target, ...source };
  out.settings = { ...target.settings, ...source.settings };
  out.unlocked_weapons = Array.isArray(source.unlocked_weapons)
    ? source.unlocked_weapons
    : target.unlocked_weapons;
  out.achievements = Array.isArray(source.achievements)
    ? source.achievements
    : target.achievements;
  out.quests_claimed = Array.isArray(source.quests_claimed)
    ? source.quests_claimed
    : target.quests_claimed;
  out.weapon_upgrades =
    source.weapon_upgrades && typeof source.weapon_upgrades === "object"
      ? source.weapon_upgrades
      : target.weapon_upgrades;
  out.player_upgrades =
    source.player_upgrades && typeof source.player_upgrades === "object"
      ? source.player_upgrades
      : target.player_upgrades;
  if (!out.unlocked_weapons.includes("pistol")) {
    out.unlocked_weapons.unshift("pistol");
  }
  return out;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export class SaveManager {
  data: SaveData;

  constructor() {
    this.data = this.load();
  }

  load(): SaveData {
    const ls = storage();
    let parsed: Partial<SaveData> = {};
    if (ls) {
      const raw = ls.getItem(SAVE_KEY);
      if (raw) {
        const obj = safeJson<Partial<SaveData>>(raw, {});
        if (obj && typeof obj === "object") parsed = obj as Partial<SaveData>;
      }
    }
    return mergeInto(defaults(), parsed as SaveData);
  }

  save(): boolean {
    const ls = storage();
    if (!ls) return false;
    try {
      ls.setItem(SAVE_KEY, JSON.stringify(this.data));
      return true;
    } catch {
      return false;
    }
  }

  get high_score(): number {
    return Number(this.data.high_score) | 0;
  }
  get total_kills(): number {
    return Number(this.data.total_kills) | 0;
  }
  get coins(): number {
    return Number(this.data.coins) | 0;
  }
  set coins(v: number) {
    this.data.coins = Math.max(0, Math.floor(Number(v) || 0));
  }
  get unlocked_weapons(): string[] {
    const list = this.data.unlocked_weapons;
    if (!list.includes("pistol")) list.unshift("pistol");
    return list;
  }
  get achievements(): string[] {
    return this.data.achievements;
  }
  get quests_claimed(): string[] {
    return this.data.quests_claimed;
  }
  get settings(): SaveData["settings"] {
    return this.data.settings;
  }

  recordRun(
    score: number,
    kills: number,
    coins: number,
    level: number,
    xp: number,
  ): boolean {
    const newHigh = score > this.high_score;
    if (newHigh) this.data.high_score = Math.floor(score);
    this.data.total_kills = this.total_kills + Math.floor(kills);
    this.coins = coins;
    this.data.player_level = Math.max(1, Math.floor(level));
    this.data.xp = Math.max(0, Math.floor(xp));
    this.save();
    return newHigh;
  }
}
