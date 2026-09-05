// src/game/shop.ts
// Shop: weapon unlocks, ammo, health, armor, max HP. Mirrors shop.py.

import { WEAPON_ORDER } from "./weapon";
import { BOMB_PACK_AMOUNT, BOMB_PACK_PRICE } from "./grenade";
import type { WeaponData } from "./data";
import type { IGame } from "./types";

export const HEALTH_REFILL_PRICE = 150;
export const MAX_HP_PRICE = 300;
export const ARMOR_PRICE = 500;
export const AMMO_PACK_PRICE = 150;
export { BOMB_PACK_PRICE };
export const DRONE_PRICE = 10000;

export class Shop {
  data: Record<string, WeaponData>;

  constructor(data: Record<string, WeaponData>) {
    this.data = data;
  }

  buy(key: string, game: IGame): boolean {
    const p = game.player!;
    const save = game.save;
    if (key.startsWith("weapon:")) {
      const wid = key.slice("weapon:".length);
      const price = this.data[wid]?.price ?? 0;
      const owned = (p.weapons as unknown as { weapons: Record<string, unknown> }).weapons;
      if (owned[wid] || p.coins < price) return false;
      p.coins -= price;
      (p.weapons as unknown as { give: (id: string) => boolean }).give(wid);
      (p.weapons as unknown as { currentId: string }).currentId = wid;
      const list = save.data.unlocked_weapons;
      if (!list.includes(wid)) list.push(wid);
    } else {
      if (key === "drone" && p.hasDrone) return false;
      if (key === "bomb_pack" && p.bombs >= p.maxBombs) return false;
      const price = priceFor(key);
      if (p.coins < price) return false;
      p.coins -= price;
      if (key === "ammo_pack") {
        const w = p.weapons.current;
        w.addReserve(w.magazineSize * 3);
      } else if (key === "bomb_pack") {
        p.addBombs(BOMB_PACK_AMOUNT);
      } else if (key === "health") {
        p.heal(p.maxHp);
      } else if (key === "armor") {
        p.addArmor(10);
      } else if (key === "max_hp") {
        p.maxHp += 20;
        p.heal(20);
      } else if (key === "drone") {
        p.hasDrone = true;
        save.data["has_drone"] = true;
      } else {
        return false;
      }
    }
    game.audio.playSFX("ui.purchase", game.player!.pos);
    save.coins = p.coins;
    save.save();
    game.toast("PURCHASED!");
    return true;
  }
}

function priceFor(key: string): number {
  switch (key) {
    case "ammo_pack":
      return AMMO_PACK_PRICE;
    case "bomb_pack":
      return BOMB_PACK_PRICE;
    case "health":
      return HEALTH_REFILL_PRICE;
    case "armor":
      return ARMOR_PRICE;
    case "max_hp":
      return MAX_HP_PRICE;
    case "drone":
      return DRONE_PRICE;
    default:
      return Infinity;
  }
}

export function listWeapons() {
  return WEAPON_ORDER;
}
