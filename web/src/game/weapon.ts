// src/game/weapon.ts
// Data-driven weapons + WeaponManager. Mirrors weapon.py.

import { BULLET_LIFETIME } from "./settings";
import type { WeaponData } from "./data";

export const WEAPON_ORDER: readonly string[] = [
  "pistol",
  "shotgun",
  "smg",
  "rifle",
  "sniper",
];

export interface FireResult {
  angle: number;
  damage: number;
  crit: boolean;
  speed: number;
  /** Seconds this shot may fly = range / speed. */
  lifetime: number;
}

export class Weapon {
  id: string;
  name: string;
  damage: number;
  magazineSize: number;
  fireRate: number;
  reloadTime: number;
  bulletSpeed: number;
  /** Max reach in px before the projectile expires. */
  range: number;
  spreadDeg: number;
  pellets: number;
  criticalChance: number;
  criticalMultiplier: number;
  auto: boolean;
  price: number;

  ammo: number;
  reserve: number;
  cooldown = 0;
  reloading = false;
  reloadTimer = 0;
  reloadTotal = 0;

  constructor(id: string, data: Record<string, WeaponData>) {
    const d = data[id] ?? data["pistol"]!;
    this.id = data[id] ? id : "pistol";
    this.name = d.name;
    this.damage = d.damage;
    this.magazineSize = d.magazine;
    this.fireRate = d.fire_rate;
    this.reloadTime = d.reload_time;
    this.bulletSpeed = d.bullet_speed;
    this.range =
      d.range ?? this.bulletSpeed * BULLET_LIFETIME; // legacy fallback
    this.spreadDeg = d.spread_deg;
    this.pellets = d.pellets;
    this.criticalChance = d.critical_chance;
    this.criticalMultiplier = d.critical_multiplier;
    this.auto = d.auto;
    this.price = d.price;

    this.ammo = this.magazineSize;
    this.reserve = d.start_reserve;
  }

  canFire(wantHeldDown: boolean): boolean {
    if (!wantHeldDown && !this.auto) return false;
    return this.cooldown <= 0 && !this.reloading && this.ammo > 0;
  }

  fire(
    baseAngle: number,
    damageMult = 1,
    critBonus = 0,
    critMultBonus = 0,
  ): FireResult[] {
    this.ammo -= 1;
    this.cooldown = this.fireRate;
    const shots: FireResult[] = [];
    for (let i = 0; i < Math.max(1, this.pellets); i++) {
      const angle =
        baseAngle + (Math.random() * 2 - 1) * (this.spreadDeg * Math.PI) / 180;
      const crit = Math.random() < Math.min(0.9, this.criticalChance + critBonus);
      const mult = crit ? this.criticalMultiplier + critMultBonus : 1;
      shots.push({
        angle,
        damage: this.damage * damageMult * mult,
        crit,
        speed: this.bulletSpeed,
        lifetime: this.range / Math.max(1, this.bulletSpeed),
      });
    }
    return shots;
  }

  startReload(mult = 1): boolean {
    if (this.reloading) return false;
    if (this.ammo >= this.magazineSize) return false;
    if (this.reserve <= 0) return false;
    this.reloading = true;
    this.reloadTotal = this.reloadTime * mult;
    this.reloadTimer = this.reloadTotal;
    return true;
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const need = this.magazineSize - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take;
        this.reserve -= take;
        this.reloading = false;
      }
    }
  }

  addReserve(amount: number): void {
    this.reserve += Math.max(0, Math.floor(amount));
  }
}

export class WeaponManager {
  weapons: Record<string, Weapon> = {};
  currentId: string = "pistol";
  data: Record<string, WeaponData>;

  constructor(unlocked: string[] = ["pistol"], data: Record<string, WeaponData>) {
    this.data = data;
    for (const id of unlocked) this.give(id);
    if (Object.keys(this.weapons).length === 0) this.give("pistol");
    this.currentId = Object.keys(this.weapons)[0]!;
  }

  give(id: string): boolean {
    if (this.weapons[id]) return false;
    this.weapons[id] = new Weapon(id, this.data);
    return true;
  }

  get current(): Weapon {
    const w = this.weapons[this.currentId];
    if (w) return w;
    // Defensive: currentId points at a weapon that isn't owned (can happen
    // after restoring a save whose unlocked list drifted from currentId).
    // Fall back to the first owned weapon in canonical order and re-anchor.
    const fallback = WEAPON_ORDER.find((wid) => this.weapons[wid]);
    if (fallback) {
      this.currentId = fallback;
      return this.weapons[fallback]!;
    }
    // Last resort: hand back the first map entry (constructor guarantees
    // at least "pistol" exists, so this can only be reached if the map
    // itself is empty, which never happens).
    return Object.values(this.weapons)[0]!;
  }

  selectSlot(slot: number): boolean {
    const ids = WEAPON_ORDER.filter((w) => this.weapons[w]);
    if (slot >= 1 && slot <= ids.length) {
      this.currentId = ids[slot - 1]!;
      return true;
    }
    return false;
  }

  cycle(direction = 1): void {
    const ids = WEAPON_ORDER.filter((w) => this.weapons[w]);
    if (ids.length === 0) return;
    const idx = ids.indexOf(this.currentId);
    // If currentId is not in the owned list (e.g. corrupted save), start
    // from the first slot instead of producing -1.
    const safeIdx = idx === -1 ? 0 : idx;
    this.currentId = ids[(safeIdx + direction + ids.length) % ids.length]!;
  }

  update(dt: number): void {
    this.current.update(dt);
  }
}
