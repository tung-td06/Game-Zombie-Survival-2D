// src/game/weapon.ts
// Data-driven weapons + WeaponManager. Mirrors weapon.py.

import { BULLET_LIFETIME } from "./settings";
import type { WeaponData } from "./data";
import { modMultiplier } from "./mods";

export const WEAPON_ORDER: readonly string[] = [
  "pistol",
  "shotgun",
  "smg",
  "rifle",
  "sniper",
  "flamethrower",
  "plasma",
  "crossbow",
];

export interface FireResult {
  angle: number;
  damage: number;
  crit: boolean;
  speed: number;
  /** Seconds this shot may fly = range / speed. */
  lifetime: number;
  /** Elemental projectile behaviour for this shot. */
  elem?: "fire" | "plasma" | "pierce";
  /** Projectile radius for this shot. */
  radius: number;
}

export class Weapon {
  id: string;
  name: string;
  damage: number;
  /** Effective (mod-adjusted) stats used by the rest of the game. */
  magazineSize: number;
  fireRate: number;
  reloadTime: number;
  bulletSpeed: number;
  /** Max reach in px before the projectile expires. */
  range: number;
  elem?: "fire" | "plasma" | "pierce";
  radius: number;
  spreadDeg: number;
  pellets: number;
  criticalChance: number;
  criticalMultiplier: number;
  auto: boolean;
  price: number;

  /** Un-modded base stats, kept so mods can be recomputed idempotently. */
  private baseMagazineSize: number;
  private baseReloadTime: number;
  private baseRange: number;
  private baseSpreadDeg: number;
  /** Mod ids attached to this weapon (persisted via SaveData.weapon_upgrades). */
  mods: string[];

  ammo: number;
  reserve: number;
  cooldown = 0;
  reloading = false;
  reloadTimer = 0;
  reloadTotal = 0;

  constructor(id: string, data: Record<string, WeaponData>, mods: string[] = []) {
    const d = data[id] ?? data["pistol"]!;
    this.id = data[id] ? id : "pistol";
    this.name = d.name;
    this.damage = d.damage;
    this.baseMagazineSize = d.magazine;
    this.fireRate = d.fire_rate;
    this.baseReloadTime = d.reload_time;
    this.bulletSpeed = d.bullet_speed;
    this.baseRange = d.range ?? this.bulletSpeed * BULLET_LIFETIME; // legacy fallback
    this.elem = d.elem;
    this.radius = d.bullet_radius ?? 4;
    this.baseSpreadDeg = d.spread_deg;
    this.pellets = d.pellets;
    this.criticalChance = d.critical_chance;
    this.criticalMultiplier = d.critical_multiplier;
    this.auto = d.auto;
    this.price = d.price;

    this.mods = [...mods];
    this.magazineSize = this.baseMagazineSize;
    this.reloadTime = this.baseReloadTime;
    this.range = this.baseRange;
    this.spreadDeg = this.baseSpreadDeg;
    this.recomputeMods();

    this.ammo = this.magazineSize;
    this.reserve = d.start_reserve;
  }

  /** Re-derive the effective stats from base values + attached mods. */
  recomputeMods(): void {
    this.magazineSize = Math.round(this.baseMagazineSize * modMultiplier(this.mods, "magazine"));
    this.reloadTime = this.baseReloadTime * modMultiplier(this.mods, "reload");
    this.range = this.baseRange * modMultiplier(this.mods, "range");
    this.spreadDeg = this.baseSpreadDeg * modMultiplier(this.mods, "spread");
  }

  /** Attach `modId`; returns false if already equipped. */
  addMod(modId: string): boolean {
    if (this.mods.includes(modId)) return false;
    this.mods.push(modId);
    this.recomputeMods();
    return true;
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
        elem: this.elem,
        radius: this.radius,
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
  weaponMods: Record<string, string[]>;

  constructor(
    unlocked: string[] = ["pistol"],
    data: Record<string, WeaponData>,
    weaponMods: Record<string, string[]> = {},
  ) {
    this.data = data;
    this.weaponMods = weaponMods;
    for (const id of unlocked) this.give(id);
    if (Object.keys(this.weapons).length === 0) this.give("pistol");
    this.currentId = Object.keys(this.weapons)[0]!;
  }

  give(id: string): boolean {
    if (this.weapons[id]) return false;
    this.weapons[id] = new Weapon(id, this.data, this.weaponMods[id]);
    return true;
  }

  /** Attach `modId` to an already-owned weapon. Returns false if not owned or already equipped. */
  applyMod(id: string, modId: string): boolean {
    const w = this.weapons[id];
    if (!w) return false;
    return w.addMod(modId);
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
