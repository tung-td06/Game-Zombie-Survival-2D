"""Level-up upgrade choices (pick 1 of 3) + Skill Tree branches.

Each level-up grants a `skill_point` instead of choosing from a 3-card pool.
Skill points can be spent in the SKILL TREE (menu → SKILLS) on three
branches: Combat (damage / fire rate), Survival (HP / armor / regen),
and Utility (speed / crit / pickup magnet). The classic 3-card choice
is kept as a fallback when SKILL_TREE_ENABLED is False.
"""
from __future__ import annotations

import random

import settings as S
from utils import load_json

_UPGRADES_FILE = S.UPGRADES_FILE if hasattr(S, "UPGRADES_FILE") \
    else S.DATA_DIR + "/upgrades.json"

_DATA = load_json(_UPGRADES_FILE, {
    "upgrades": [
        {"id": "max_hp",    "text": "+20 MAX HP",        "desc": "Increase max health"},
        {"id": "damage",    "text": "+10% DAMAGE",       "desc": "All weapons hit harder"},
        {"id": "speed",     "text": "+8% MOVE SPEED",    "desc": "Run faster"},
        {"id": "fire_rate", "text": "+8% FIRE RATE",     "desc": "Shoot faster"},
        {"id": "reload",    "text": "+10% RELOAD SPEED", "desc": "Reload quicker"},
        {"id": "armor",     "text": "+10 ARMOR",         "desc": "Absorb damage first"},
        {"id": "crit_ch",   "text": "+5% CRIT CHANCE",   "desc": "More critical hits"},
        {"id": "crit_dmg",  "text": "+25% CRIT DAMAGE",  "desc": "Crits hurt more"},
        {"id": "regen",     "text": "+1 HP / sec",       "desc": "Slowly regenerate health"},
        {"id": "magnet",    "text": "+30% pickup range", "desc": "Loot vacuum reaches further"},
        {"id": "vampire",   "text": "+2% life steal",    "desc": "Heal on every kill"},
        {"id": "pierce",    "text": "+1 pierce bullet",  "desc": "Crossbow pierces more enemies"},
    ],
    "limits": {"max_hp": 10, "armor": 10},
})

SKILL_TREE_ENABLED = True
SKILL_BRANCHES = {
    "Combat": ["damage", "fire_rate", "reload", "crit_ch", "crit_dmg"],
    "Survival": ["max_hp", "armor", "regen", "vampire"],
    "Utility": ["speed", "magnet", "pierce"],
}


class UpgradeSystem:
    """Catalog of player upgrades; rolls 3 random choices per level-up."""

    CATALOG: list[dict] = _DATA.get("upgrades", [])
    LIMITS: dict[str, int] = _DATA.get("limits", {})

    def roll_choices(self, player) -> list[str]:
        pool: list[str] = []
        for u in self.CATALOG:
            limit = self.LIMITS.get(u["id"])
            if limit is not None and player.upgrade_levels.get(u["id"], 0) >= limit:
                continue
            pool.append(u["id"])
        if len(pool) < 3:
            pool = pool + [u["id"] for u in self.CATALOG][:3 - len(pool)]
        return random.sample(pool, min(3, len(pool)))

    def text_for(self, uid: str) -> str:
        for u in self.CATALOG:
            if u["id"] == uid:
                return u["text"]
        return uid

    def apply(self, uid: str, player, game=None) -> None:
        player.upgrade_levels[uid] = player.upgrade_levels.get(uid, 0) + 1
        if uid == "max_hp":
            player.max_hp += 20
            player.heal(20)
        elif uid == "damage":
            player.damage_mult *= 1.10
        elif uid == "speed":
            player.speed_mult *= 1.08
        elif uid == "fire_rate":
            player.fire_rate_mult *= 1.08
        elif uid == "reload":
            player.reload_mult *= 0.90
        elif uid == "armor":
            player.add_armor(10)
        elif uid == "crit_ch":
            player.crit_bonus += 0.05
        elif uid == "crit_dmg":
            player.crit_mult_bonus += 0.25
        elif uid == "regen":
            player.regen += 1.0
        elif uid == "magnet":
            player.magnet_mult *= 1.30
        elif uid == "vampire":
            player.life_steal += 0.02
        elif uid == "pierce":
            player.pierce_bonus += 1
