// tests/weapon.test.ts
import { describe, test, expect } from "vitest";
import { Weapon, WeaponManager, WEAPON_ORDER } from "@/game/weapon";
import type { WeaponData } from "@/game/data";

const FIX: Record<string, WeaponData> = {
  pistol: {
    name: "PISTOL",
    damage: 25,
    magazine: 12,
    fire_rate: 0.3,
    reload_time: 1.2,
    bullet_speed: 1000,
    spread_deg: 2.5,
    pellets: 1,
    critical_chance: 0.0,
    critical_multiplier: 2.0,
    auto: false,
    price: 0,
    start_reserve: 96,
  },
  shotgun: {
    name: "SHOTGUN",
    damage: 20,
    magazine: 6,
    fire_rate: 0.8,
    reload_time: 1.8,
    bullet_speed: 850,
    spread_deg: 12,
    pellets: 8,
    critical_chance: 0.0,
    critical_multiplier: 2.0,
    auto: false,
    price: 500,
    start_reserve: 24,
  },
  smg: {
    name: "SMG",
    damage: 15,
    magazine: 30,
    fire_rate: 0.08,
    reload_time: 1.5,
    bullet_speed: 1100,
    spread_deg: 5.0,
    pellets: 1,
    critical_chance: 0.0,
    critical_multiplier: 2.0,
    auto: true,
    price: 800,
    start_reserve: 90,
  },
};

describe("Weapon", () => {
  test("initial ammo + reserve from data", () => {
    const w = new Weapon("pistol", FIX);
    expect(w.ammo).toBe(12);
    expect(w.reserve).toBe(96);
  });

  test("fire decrements ammo and sets cooldown", () => {
    const w = new Weapon("pistol", FIX);
    const shots = w.fire(0);
    expect(shots.length).toBe(1);
    expect(w.ammo).toBe(11);
    expect(w.cooldown).toBeCloseTo(0.3);
  });

  test("can_fire respects auto + held state", () => {
    const pistol = new Weapon("pistol", FIX);
    expect(pistol.canFire(false)).toBe(false); // not auto, not held
    expect(pistol.canFire(true)).toBe(true);
    const smg = new Weapon("smg", FIX);
    expect(smg.canFire(false)).toBe(true); // auto, no click needed
  });

  test("reload refills magazine from reserve", () => {
    const w = new Weapon("pistol", FIX);
    w.ammo = 0;
    expect(w.startReload(1)).toBe(true);
    expect(w.reloading).toBe(true);
    w.update(1.3);
    expect(w.ammo).toBe(12);
    expect(w.reserve).toBe(96 - 12);
    expect(w.reloading).toBe(false);
  });

  test("startReload blocked when reserve is 0", () => {
    const w = new Weapon("pistol", FIX);
    w.reserve = 0;
    expect(w.startReload()).toBe(false);
  });

  test("shotgun fires multiple pellets", () => {
    const w = new Weapon("shotgun", FIX);
    const shots = w.fire(0);
    expect(shots.length).toBe(8);
    expect(w.ammo).toBe(5);
  });

  test("fire caps lifetime by explicit range", () => {
    const w = new Weapon("pistol", {
      ...FIX,
      pistol: { ...FIX.pistol!, bullet_speed: 1000, range: 700 },
    });
    const shots = w.fire(0);
    expect(shots[0]!.lifetime).toBeCloseTo(0.7);
  });

  test("range falls back to legacy speed * lifetime", () => {
    // Fixtures carry no `range` -> legacy reach = speed * BULLET_LIFETIME
    // (1.6 s), i.e. lifetime stays at BULLET_LIFETIME.
    const w = new Weapon("pistol", FIX);
    const shots = w.fire(0);
    expect(shots[0]!.lifetime).toBeCloseTo(1.6);
  });
});

describe("WeaponManager", () => {
  test("starts with pistol", () => {
    const m = new WeaponManager(["pistol"], FIX);
    expect(m.currentId).toBe("pistol");
  });

  test("give adds a new weapon", () => {
    const m = new WeaponManager(["pistol"], FIX);
    expect(m.give("shotgun")).toBe(true);
    expect(m.give("shotgun")).toBe(false); // already there
  });

  test("select_slot picks by index", () => {
    const m = new WeaponManager(["pistol", "shotgun", "smg"], FIX);
    expect(m.selectSlot(1)).toBe(true);
    expect(m.currentId).toBe("pistol");
    expect(m.selectSlot(2)).toBe(true);
    expect(m.currentId).toBe("shotgun");
    expect(m.selectSlot(9)).toBe(false);
  });

  test("cycle rotates through unlocked", () => {
    const m = new WeaponManager(["pistol", "smg"], FIX);
    expect(m.currentId).toBe("pistol");
    m.cycle(1);
    expect(m.currentId).toBe("smg");
    m.cycle(1);
    expect(m.currentId).toBe("pistol");
  });

  test("WEAPON_ORDER lists all 8 weapons", () => {
    expect(WEAPON_ORDER).toEqual([
      "pistol",
      "shotgun",
      "smg",
      "rifle",
      "sniper",
      "flamethrower",
      "plasma",
      "crossbow",
    ]);
  });
});
