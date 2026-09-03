"""Persistent profile: high score, wallet, unlocks, upgrades, settings."""
from __future__ import annotations

from typing import Any

from utils import load_json, merge_defaults, save_json
import settings as S

DEFAULT_SAVE: dict[str, Any] = {
    "high_score": 0,
    "total_kills": 0,
    "coins": 0,
    "player_level": 1,
    "xp": 0,
    "unlocked_weapons": ["pistol"],
    "weapon_upgrades": {},
    "player_upgrades": {},
    "achievements": [],
    "quests_claimed": [],
    "settings": {
        "master_volume": 0.8,
        "music_volume": 0.6,
        "sfx_volume": 0.8,
        "fullscreen": False,
        "show_fps": False,
        "resolution_index": 0,
        "screen_shake": True,
        "damage_numbers": True,
        "hit_effects": True,
        "footstep_dust": False,
        "window_lights": False,
    },
}


class SaveManager:
    """Loads data/save.json with fallback defaults; saves on demand."""

    def __init__(self) -> None:
        self.data: dict[str, Any] = dict(DEFAULT_SAVE)
        self.load()

    # ---------------------------------------------------------------- io ---
    def load(self) -> bool:
        self.data = load_json(S.SAVE_FILE, DEFAULT_SAVE)
        merge_defaults(self.data, DEFAULT_SAVE)
        return True

    def save(self) -> bool:
        return save_json(S.SAVE_FILE, self.data)

    # ---------------------------------------------------------- accessors --
    @property
    def high_score(self) -> int:
        return int(self.data.get("high_score", 0))

    @property
    def total_kills(self) -> int:
        return int(self.data.get("total_kills", 0))

    @property
    def coins(self) -> int:
        return int(self.data.get("coins", 0))

    @coins.setter
    def coins(self, value: int) -> None:
        self.data["coins"] = max(0, int(value))

    @property
    def unlocked_weapons(self) -> list[str]:
        weapons = self.data.setdefault("unlocked_weapons", ["pistol"])
        if "pistol" not in weapons:
            weapons.insert(0, "pistol")
        return weapons

    @property
    def achievements(self) -> list[str]:
        return self.data.setdefault("achievements", [])

    @property
    def quests_claimed(self) -> list[str]:
        return self.data.setdefault("quests_claimed", [])

    @property
    def settings(self) -> dict[str, Any]:
        return self.data["settings"]

    # -------------------------------------------------------------- run ----
    def record_run(self, score: int, kills: int, coins: int,
                   level: int, xp: int) -> bool:
        """Commit end-of-run progress. Returns True if new high score."""
        new_high = score > self.high_score
        if new_high:
            self.data["high_score"] = int(score)
        self.data["total_kills"] = self.total_kills + kills
        self.coins = coins
        self.data["player_level"] = max(1, int(level))
        self.data["xp"] = max(0, int(xp))
        self.save()
        return new_high
