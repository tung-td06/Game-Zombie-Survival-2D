"""Shop: weapons, ammo, armor, health — paid from the persistent wallet."""
from __future__ import annotations

from save_manager import SaveManager
from weapon import WEAPON_DATA, WEAPON_ORDER

HEALTH_REFILL_PRICE = 150
MAX_HP_PRICE = 300          # +20 max HP (permanent this run)
ARMOR_PRICE = 500           # +10 armor
AMMO_PACK_PRICE = 150


class Shop:
    """Immediate-mode catalog; entries rendered by menu.py."""

    def get_entries(self, game) -> list[dict]:
        """Return purchasable rows for the current game state."""
        entries: list[dict] = []
        owned = set(game.player.weapons.weapons)
        for wid in WEAPON_ORDER:
            data = WEAPON_DATA[wid]
            if wid in owned:
                entries.append({"key": f"weapon:{wid}",
                                "label": data["name"],
                                "detail": f"DMG {data['damage']} x{data['pellets']}"
                                          f"  MAG {data['magazine']}",
                                "price": 0, "owned": True})
            else:
                entries.append({"key": f"weapon:{wid}",
                                "label": data["name"],
                                "detail": f"DMG {data['damage']} x{data['pellets']}"
                                          f"  MAG {data['magazine']}",
                                "price": data["price"], "owned": False})
        p = game.player
        entries.append({"key": "ammo_pack", "label": "AMMO PACK",
                        "detail": f"+{int(p.weapons.current.magazine_size * 3)}"
                                  f" reserve ({p.weapons.current.name})",
                        "price": AMMO_PACK_PRICE, "owned": False})
        entries.append({"key": "health", "label": "FULL HEAL",
                        "detail": f"HP {int(p.hp)}/{int(p.max_hp)}",
                        "price": HEALTH_REFILL_PRICE, "owned": False})
        entries.append({"key": "armor", "label": "ARMOR +10",
                        "detail": f"Armor {int(p.armor)}/100",
                        "price": ARMOR_PRICE, "owned": False})
        entries.append({"key": "max_hp", "label": "MAX HP +20",
                        "detail": f"Max HP {int(p.max_hp)}",
                        "price": MAX_HP_PRICE, "owned": False})
        return entries

    def buy(self, key: str, game) -> bool:
        """Attempt purchase; returns True on success.

        Persistent upgrades (max_hp, armor) are stored on the save profile
        and re-applied to every fresh run.
        """
        p = game.player
        save: SaveManager = game.save
        if key.startswith("weapon:"):
            wid = key.split(":", 1)[1]
            price = WEAPON_DATA[wid]["price"]
            if wid in p.weapons.weapons or p.coins < price:
                return False
            p.coins -= price
            p.weapons.give(wid)
            p.weapons.current_id = wid
            save.data.setdefault("unlocked_weapons", []).append(wid)
        else:
            prices = {"ammo_pack": AMMO_PACK_PRICE, "health": HEALTH_REFILL_PRICE,
                      "armor": ARMOR_PRICE, "max_hp": MAX_HP_PRICE}
            price = prices[key]
            if p.coins < price:
                return False
            p.coins -= price
            if key == "ammo_pack":
                w = p.weapons.current
                w.add_reserve(int(w.magazine_size * 3))
            elif key == "health":
                p.heal(p.max_hp)
            elif key == "armor":
                p.add_armor(10)
                save.data.setdefault("permanent_armor", 0)
                save.data["permanent_armor"] = min(
                    100, save.data["permanent_armor"] + 10)
                p.armor = max(p.armor, save.data["permanent_armor"])
            elif key == "max_hp":
                p.max_hp += 20
                p.heal(20)
                save.data.setdefault("permanent_max_hp", 0)
                save.data["permanent_max_hp"] += 20
        game.audio.play("buy")
        save.coins = p.coins
        save.save()
        game.toast("PURCHASED!")
        return True
