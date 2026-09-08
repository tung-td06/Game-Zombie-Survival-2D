// tests/ufo.test.ts
// UFO FLEET: catalog sanity, MAX_UFO_OWNED enforcement in Player state,
// and the localStorage has_drone -> owned_ufos migration.
import { describe, test, expect, beforeEach } from "vitest";
import {
  MAX_UFO_OWNED,
  UFO_CATALOG,
  ufoDef,
  firstUnownedUFO,
} from "@/game/ufo";
import { SaveManager, SAVE_KEY } from "@/game/save";
import { Player } from "@/game/player";
import { WEAPON_ORDER } from "@/game/weapon";
import type { WeaponData } from "@/game/data";

beforeEach(() => {
  localStorage.clear();
});

const DATA: Record<string, WeaponData> = {
  pistol: {
    name: "PISTOL", damage: 25, magazine: 12, fire_rate: 0.3, reload_time: 1.2,
    bullet_speed: 1000, spread_deg: 2.5, pellets: 1, critical_chance: 0.1,
    critical_multiplier: 2, auto: false, price: 0, start_reserve: 96,
  },
};

describe("UFO catalog", () => {
  test("catalog has more than MAX_UFO_OWNED entries (so the cap is reachable)", () => {
    expect(UFO_CATALOG.length).toBeGreaterThan(MAX_UFO_OWNED);
    expect(MAX_UFO_OWNED).toBe(4);
  });

  test("every UFO has a unique id, name, price and colours", () => {
    const ids = new Set<string>();
    for (const def of UFO_CATALOG) {
      expect(def.id).toBeTruthy();
      expect(ids.has(def.id)).toBe(false);
      ids.add(def.id);
      expect(def.name).toBeTruthy();
      expect(def.price).toBeGreaterThan(0);
      expect(def.tint).toMatch(/^#/);
      expect(def.glow).toContain("rgba");
    }
    // The classic drone is the first entry (backward-compatible migration).
    expect(UFO_CATALOG[0]!.id).toBe("drone");
  });

  test("firstUnownedUFO respects the 4-UFO cap", () => {
    expect(firstUnownedUFO([])!.id).toBe("drone");
    expect(firstUnownedUFO(["drone", "wasp", "phantom"])!.id).toBe("goliath");
    expect(firstUnownedUFO(["drone", "wasp", "phantom", "goliath"])).toBeNull();
    expect(firstUnownedUFO(UFO_CATALOG.map((u) => u.id))).toBeNull();
  });

  test("ufoDef resolves known ids and rejects unknown ones", () => {
    expect(ufoDef("wasp")?.name).toBe("WASP");
    expect(ufoDef("nope")).toBeUndefined();
  });
});

describe("Player UFO state", () => {
  function makePlayer(coins = 0) {
    return new Player(
      { x: 0, y: 0 },
      { coins, unlocked: ["pistol"], weaponData: DATA },
    );
  }

  test("hasDrone is derived from the ACTIVE ufo", () => {
    const p = makePlayer();
    expect(p.hasDrone).toBe(false);
    p.setUFOs(["drone"]);
    expect(p.hasDrone).toBe(true);
    expect(p.activeUFO).toBe("drone"); // first owned auto-activates
  });

  test("setUFOs caps at MAX_UFO_OWNED and never keeps an unowned active", () => {
    const p = makePlayer();
    p.setUFOs(["drone", "wasp", "phantom", "goliath", "vulture"], "vulture");
    expect(p.ownedUFOs.length).toBe(4);
    expect(p.ownedUFOs).toEqual(["drone", "wasp", "phantom", "goliath"]);
    expect(p.activeUFO).toBe("drone"); // requested active not owned -> first
  });

  test("setUFOs dedupes and drops unknown ids", () => {
    const p = makePlayer();
    p.setUFOs(["drone", "drone", "nope", "wasp"], "wasp");
    expect(p.ownedUFOs).toEqual(["drone", "wasp"]);
    expect(p.activeUFO).toBe("wasp");
  });
});

describe("SaveManager UFO migration", () => {
  test("old save with has_drone migrates to owned_ufos/active_ufo", () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ has_drone: true, unlocked_weapons: ["pistol"] }),
    );
    const s = new SaveManager();
    expect(s.data.owned_ufos).toEqual(["drone"]);
    expect(s.data.active_ufo).toBe("drone");
    expect(s.data.has_drone).toBe(true);
  });

  test("fresh save starts with an empty fleet", () => {
    const s = new SaveManager();
    expect(s.data.owned_ufos).toEqual([]);
    expect(s.data.active_ufo).toBe("");
    expect(s.data.has_drone).toBe(false);
  });

  test("owned_ufos/active_ufo survive a save -> reload round trip", () => {
    const s = new SaveManager();
    s.data.owned_ufos = ["drone", "wasp"];
    s.data.active_ufo = "wasp";
    s.save();
    const s2 = new SaveManager();
    expect(s2.data.owned_ufos).toEqual(["drone", "wasp"]);
    expect(s2.data.active_ufo).toBe("wasp");
  });

  test("active_ufo is corrected when it points at an unowned ufo", () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ owned_ufos: ["wasp"], active_ufo: "drone" }),
    );
    const s = new SaveManager();
    expect(s.data.active_ufo).toBe("wasp");
  });
});