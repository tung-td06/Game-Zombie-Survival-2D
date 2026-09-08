// tests/shop.test.ts
import { describe, test, expect, vi } from "vitest";
import { Shop, DRONE_PRICE, BOMB_PACK_PRICE } from "@/game/shop";
import { BOMB_MAX, BOMB_PACK_AMOUNT } from "@/game/grenade";
import type { WeaponData } from "@/game/data";

const DATA: Record<string, WeaponData> = {
  pistol: {
    name: "PISTOL", damage: 25, magazine: 12, fire_rate: 0.3, reload_time: 1.2,
    bullet_speed: 1000, spread_deg: 2.5, pellets: 1, critical_chance: 0.1,
    critical_multiplier: 2, auto: false, price: 0, start_reserve: 96,
  },
  shotgun: {
    name: "SHOTGUN", damage: 20, magazine: 6, fire_rate: 0.8, reload_time: 1.8,
    bullet_speed: 850, spread_deg: 12, pellets: 8, critical_chance: 0.05,
    critical_multiplier: 2, auto: false, price: 500, start_reserve: 24,
  },
  smg: {
    name: "SMG", damage: 15, magazine: 30, fire_rate: 0.08, reload_time: 1.5,
    bullet_speed: 1100, spread_deg: 5, pellets: 1, critical_chance: 0.08,
    critical_multiplier: 2, auto: true, price: 800, start_reserve: 90,
  },
  rifle: {
    name: "AK-47", damage: 30, magazine: 30, fire_rate: 0.12, reload_time: 1.7,
    bullet_speed: 1300, spread_deg: 3, pellets: 1, critical_chance: 0.12,
    critical_multiplier: 2.2, auto: true, price: 1500, start_reserve: 60,
  },
  sniper: {
    name: "SNIPER", damage: 150, magazine: 5, fire_rate: 1.5, reload_time: 2.2,
    bullet_speed: 1800, spread_deg: 0.5, pellets: 1, critical_chance: 0.3,
    critical_multiplier: 3, auto: false, price: 3000, start_reserve: 15,
  },
};

function makeGame(coins: number, weapons = ["pistol"] as string[]) {
  const player: Record<string, any> = {
    coins,
    hp: 50,
    max_hp: 100,
    armor: 0,
    ownedUFOs: [] as string[],
    activeUFO: "",
    pos: { x: 0, y: 0 },
    weapons: {
      weapons: Object.fromEntries(weapons.map((w) => [w, { addReserve: vi.fn(), magazineSize: DATA[w]!.magazine }])),
      give: vi.fn().mockReturnValue(true),
      currentId: "pistol",
      current: { addReserve: vi.fn(), magazineSize: 12 },
    },
    heal: vi.fn(),
    addArmor: vi.fn(),
    bombs: 0,
    maxBombs: BOMB_MAX,
    addBombs(n: number) {
      const before = this.bombs;
      this.bombs = Math.min(this.maxBombs, this.bombs + n);
      return this.bombs - before;
    },
    setUFOs(owned: string[], active?: string) {
      this.ownedUFOs = [...owned];
      this.activeUFO =
        this.ownedUFOs.length === 0
          ? ""
          : typeof active === "string" && this.ownedUFOs.includes(active)
            ? active
            : this.ownedUFOs[0]!;
    },
  };
  Object.defineProperty(player, "hasDrone", {
    get() {
      return player.activeUFO !== "";
    },
    enumerable: true,
  });
  return {
    player,
    save: {
      data: { unlocked_weapons: weapons },
      coins,
      save: vi.fn(),
    },
    audio: { play: vi.fn(), playSFX: vi.fn(), playMusic: vi.fn() },
    toast: vi.fn(),
  } as unknown as Parameters<Shop["buy"]>[1];
}

describe("Shop", () => {
  test("buy shotgun with enough coins", () => {
    const s = new Shop(DATA);
    const g = makeGame(1000);
    expect(s.buy("weapon:shotgun", g)).toBe(true);
    expect(g.player!.coins).toBe(500);
  });

  test("refuse when not enough coins", () => {
    const s = new Shop(DATA);
    const g = makeGame(0);
    expect(s.buy("weapon:sniper", g)).toBe(false);
  });

  test("refuse when already owned", () => {
    const s = new Shop(DATA);
    const g = makeGame(10000, ["shotgun"]);
    expect(s.buy("weapon:shotgun", g)).toBe(false);
  });

  test("UFO drone costs 10000 and unlocks once", () => {
    expect(DRONE_PRICE).toBe(10000);
    const s = new Shop(DATA);
    const g = makeGame(DRONE_PRICE);
    expect(s.buy("drone", g)).toBe(true);
    expect(g.player!.coins).toBe(0);
    expect(g.player!.hasDrone).toBe(true);
    expect(g.save.data["has_drone"]).toBe(true);
    expect(g.save.data["owned_ufos"]).toEqual(["drone"]);
    // Already owned: no second charge.
    expect(s.buy("drone", g)).toBe(false);
    expect(g.player!.coins).toBe(0);
  });

  test("UFO drone refused below 10000 coins", () => {
    const s = new Shop(DATA);
    const g = makeGame(DRONE_PRICE - 1);
    expect(s.buy("drone", g)).toBe(false);
    expect(g.player!.hasDrone).toBeFalsy();
  });

  test("UFO fleet caps at MAX_UFO_OWNED (4) purchases", () => {
    const s = new Shop(DATA);
    const g = makeGame(1000000);
    const ids = ["drone", "wasp", "phantom", "goliath", "vulture", "sentinel"];
    let ok = 0;
    for (const id of ids) {
      const res = s.buyUFO(id, g);
      if (res === "ok") ok++;
      else expect(res).toBe("limit");
    }
    expect(ok).toBe(4);
    expect(g.player!.ownedUFOs.length).toBe(4);
    expect(g.player!.ownedUFOs).toEqual(["drone", "wasp", "phantom", "goliath"]);
    // 5th attempt never touches money.
    const coinsBefore = g.player!.coins;
    expect(s.buyUFO("vulture", g)).toBe("limit");
    expect(g.player!.coins).toBe(coinsBefore);
  });

  test("UFO buy rejects already-owned, insufficient funds, unknown ids", () => {
    const s = new Shop(DATA);
    const g = makeGame(999);
    expect(s.buyUFO("drone", g)).toBe("funds"); // 10000 > 999
    expect(g.player!.ownedUFOs.length).toBe(0);
    expect(s.buyUFO("nope", g)).toBe("invalid");
    expect(s.buyUFO("drone", g)).toBe("funds");
  });

  test("equip switches the ACTIVE saucer without charging", () => {
    const s = new Shop(DATA);
    const g = makeGame(1000000);
    s.buyUFO("drone", g);
    s.buyUFO("wasp", g);
    expect(g.player!.activeUFO).toBe("drone"); // first buy auto-activates
    expect(s.equipUFO("wasp", g)).toBe(true);
    expect(g.player!.activeUFO).toBe("wasp");
    expect(g.save.data["active_ufo"]).toBe("wasp");
    // Cannot equip something not owned.
    expect(s.equipUFO("phantom", g)).toBe(false);
    expect(g.player!.activeUFO).toBe("wasp");
  });

  test("bomb pack grants bombs and charges once", () => {
    const s = new Shop(DATA);
    const g = makeGame(BOMB_PACK_PRICE);
    expect(s.buy("bomb_pack", g)).toBe(true);
    expect(g.player!.bombs).toBe(BOMB_PACK_AMOUNT);
    expect(g.player!.coins).toBe(0);
  });

  test("bomb pack refused at the carry cap without charging", () => {
    const s = new Shop(DATA);
    const g = makeGame(BOMB_PACK_PRICE);
    g.player!.bombs = BOMB_MAX;
    expect(s.buy("bomb_pack", g)).toBe(false);
    expect(g.player!.coins).toBe(BOMB_PACK_PRICE);
  });

  test("health refill", () => {
    const s = new Shop(DATA);
    const g = makeGame(500);
    expect(s.buy("health", g)).toBe(true);
    expect(g.player!.heal).toHaveBeenCalled();
  });
});
