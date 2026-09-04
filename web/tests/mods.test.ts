// tests/mods.test.ts
import { describe, test, expect } from "vitest";
import { Weapon, WeaponManager } from "@/game/weapon";
import { MOD_CATALOG } from "@/game/mods";
import type { WeaponData } from "@/game/data";

const FIX: Record<string, WeaponData> = {
  pistol: {
    name: "PISTOL",
    damage: 25,
    magazine: 12,
    fire_rate: 0.3,
    reload_time: 1.2,
    bullet_speed: 1000,
    range: 700,
    spread_deg: 2.5,
    pellets: 1,
    critical_chance: 0.0,
    critical_multiplier: 2.0,
    auto: false,
    price: 0,
    start_reserve: 96,
  },
};

describe("Weapon mods", () => {
  test("extended_mag increases magazine size and starting ammo", () => {
    const w = new Weapon("pistol", FIX, ["extended_mag"]);
    expect(w.magazineSize).toBe(18); // 12 * 1.5
    expect(w.ammo).toBe(18);
  });

  test("scope increases range", () => {
    const w = new Weapon("pistol", FIX, ["scope"]);
    expect(w.range).toBeCloseTo(700 * 1.3);
  });

  test("tight_choke reduces spread", () => {
    const w = new Weapon("pistol", FIX, ["tight_choke"]);
    expect(w.spreadDeg).toBeCloseTo(2.5 * 0.7);
  });

  test("quick_reload reduces reload time (stacks with skill reloadMult)", () => {
    const w = new Weapon("pistol", FIX, ["quick_reload"]);
    expect(w.reloadTime).toBeCloseTo(1.2 * 0.8);
    w.ammo = 0;
    w.startReload(0.9); // skill reloadMult applied on top
    expect(w.reloadTotal).toBeCloseTo(1.2 * 0.8 * 0.9);
  });

  test("addMod is idempotent and recomputes stats", () => {
    const w = new Weapon("pistol", FIX);
    expect(w.addMod("scope")).toBe(true);
    expect(w.addMod("scope")).toBe(false);
    expect(w.range).toBeCloseTo(700 * 1.3);
  });

  test("mods catalog has at least one mod per stat used in the shop", () => {
    const stats = new Set(MOD_CATALOG.map((m) => m.stat));
    expect(stats.has("range")).toBe(true);
    expect(stats.has("magazine")).toBe(true);
    expect(stats.has("spread")).toBe(true);
    expect(stats.has("reload")).toBe(true);
  });
});

describe("WeaponManager.applyMod", () => {
  test("fails for a weapon that isn't owned", () => {
    const m = new WeaponManager(["pistol"], FIX);
    expect(m.applyMod("shotgun", "scope")).toBe(false);
  });

  test("attaches a mod to an owned weapon", () => {
    const m = new WeaponManager(["pistol"], FIX);
    expect(m.applyMod("pistol", "scope")).toBe(true);
    expect(m.weapons.pistol!.mods).toContain("scope");
  });

  test("seeds mods from save data at construction", () => {
    const m = new WeaponManager(["pistol"], FIX, { pistol: ["extended_mag"] });
    expect(m.weapons.pistol!.magazineSize).toBe(18);
  });
});
