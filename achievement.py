"""Achievement system with persistent unlocks."""
from __future__ import annotations


class AchievementSystem:
    """Checks thresholds each frame; unlocks are saved to save.json."""

    DEFINITIONS: list[dict] = [
        {"id": "first_blood",   "name": "First Blood",
         "desc": "Kill your first zombie"},
        {"id": "kill_100",      "name": "Centurion",
         "desc": "100 total kills"},
        {"id": "kill_1000",     "name": "Zombie Slayer",
         "desc": "1000 total kills"},
        {"id": "survive_10min", "name": "Endurance",
         "desc": "Survive 10 minutes in one run"},
        {"id": "boss_slayer",   "name": "Giant Slayer",
         "desc": "Kill a Boss"},
        {"id": "master_shooter","name": "Master Shooter",
         "desc": "Reach wave 10"},
        {"id": "rich",          "name": "Scavenger King",
         "desc": "Hold $5000 at once"},
    ]

    def __init__(self, unlocked_ids: list[str]) -> None:
        self.unlocked: set[str] = set(unlocked_ids)

    def update(self, game) -> None:
        stats = game.stats
        total_kills = game.save.total_kills + stats.get("kills", 0)
        checks = {
            "first_blood": stats.get("kills", 0) >= 1,
            "kill_100": total_kills >= 100,
            "kill_1000": total_kills >= 1000,
            "survive_10min": stats.get("survival_time", 0) >= 600,
            "boss_slayer": stats.get("boss_kills", 0) >= 1,
            "master_shooter": game.wave_manager.wave >= 10,
            "rich": game.player.coins >= 5000,
        }
        for aid, ok in checks.items():
            if ok and aid not in self.unlocked:
                self.unlock(aid, game)

    def unlock(self, aid: str, game) -> None:
        self.unlocked.add(aid)
        meta = next((d for d in self.DEFINITIONS if d["id"] == aid), None)
        name = meta["name"] if meta else aid
        game.toast(f"ACHIEVEMENT UNLOCKED: {name}")
        game.audio.play("levelup")
        save_list = game.save.achievements
        if aid not in save_list:
            save_list.append(aid)
        game.save.save()

    @property
    def count(self) -> tuple[int, int]:
        return len(self.unlocked), len(self.DEFINITIONS)

    def name_of(self, aid: str) -> str:
        return next((d["name"] for d in self.DEFINITIONS
                     if d["id"] == aid), aid)
