"""Session quests with rewards (coins / XP)."""
from __future__ import annotations


class Quest:
    __slots__ = ("id", "text", "target", "reward_coins", "reward_xp",
                 "progress_fn", "done")

    def __init__(self, qid: str, text: str, target: int,
                 reward_coins: int, reward_xp: int, progress_fn) -> None:
        self.id = qid
        self.text = text
        self.target = target
        self.reward_coins = reward_coins
        self.reward_xp = reward_xp
        self.progress_fn = progress_fn
        self.done = False

    @property
    def progress(self) -> float:
        return min(float(self.target), max(0.0, float(self.progress_fn())))


class QuestSystem:
    """A fixed quest board per run; completing grants coins + XP."""

    def __init__(self) -> None:
        # `stats` closure target is bound at update-time via game reference.
        self._game = None
        self.quests: list[Quest] = []

    def bind(self, game) -> None:
        """(Re)build the quest board for a fresh run."""
        self._game = game
        stats = lambda key: (lambda: game.stats.get(key, 0))  # noqa: E731
        shots = lambda wid: (lambda:                            # noqa: E731
            game.stats.get("shots_by_weapon", {}).get(wid, 0))
        self.quests = [
            Quest("kill_50", "Kill 50 Zombies", 50, 300, 150, stats("kills")),
            Quest("kill_fast_10", "Kill 10 Fast Zombies", 10, 250, 120,
                  lambda: game.stats.get("kills_by_type", {}).get("fast", 0)),
            Quest("survive_5min", "Survive 5 Minutes", 300, 400, 200,
                  stats("survival_time")),
            Quest("boss_1", "Kill 1 Boss", 1, 800, 400, stats("boss_kills")),
            Quest("shotgun_20", "Fire Shotgun 20 times", 20, 350, 150,
                  shots("shotgun")),
        ]

    def update(self, game) -> None:
        for q in self.quests:
            if q.done:
                continue
            if q.progress >= q.target:
                q.done = True
                game.player.coins += q.reward_coins
                game.player.add_xp(q.reward_xp, game)
                game.toast(f"QUEST COMPLETE: {q.text}  "
                           f"(+${q.reward_coins} +{q.reward_xp}XP)")
                game.audio.play("levelup")

    @property
    def active(self) -> list[Quest]:
        return [q for q in self.quests if not q.done]

    @property
    def completed_count(self) -> int:
        return sum(1 for q in self.quests if q.done)
