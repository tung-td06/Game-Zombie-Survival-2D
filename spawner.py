"""ZombieSpawner: positions & type selection for new zombies."""
from __future__ import annotations

import math
import random

import pygame

import settings as S


class ZombieSpawner:
    """Spawns zombies around the player (min distance enforced)."""

    def __init__(self) -> None:
        self.rng = random.Random()

    # -------------------------------------------------------------- types --
    def pick_type(self, wave: int, modifier: str = "none") -> str:
        """Weighted zombie type selection that unlocks as waves progress."""
        rng = self.rng
        weights: dict[str, float] = {"normal": 10.0}
        if wave >= 2:
            weights["fast"] = min(6.0, 2.0 + wave * 0.5)
        if wave >= 3:
            weights["tank"] = min(5.0, 1.0 + (wave - 2) * 0.4)
        if wave >= 4:
            weights["exploder"] = min(4.0, 1.0 + (wave - 3) * 0.35)
            weights["ranged"] = min(4.0, 1.0 + (wave - 3) * 0.35)
        if wave >= 5:
            weights["crawler"] = min(3.0, 1.0 + (wave - 4) * 0.25)
        if wave >= 7:
            weights["necromancer"] = min(2.0, 0.5 + (wave - 6) * 0.15)
        if modifier == "blood_moon":
            for k in weights:
                weights[k] *= 1.25
            weights["tank"] *= 1.5
        if modifier == "swarm":
            weights["crawler"] = weights.get("crawler", 0) * 2.0
            weights["fast"] *= 1.4
        kinds = list(weights)
        total = sum(weights.values())
        roll = rng.uniform(0, total)
        acc = 0.0
        for k in kinds:
            acc += weights[k]
            if roll <= acc:
                return k
        return "normal"

    # ----------------------------------------------------------- position --
    def spawn_position(self, player_pos: pygame.Vector2,
                       world_map, radius: float = 24.0) -> pygame.Vector2 | None:
        """Ring spawn around player: >= SPAWN_MIN_DIST away, free of walls."""
        for _ in range(40):
            ang = self.rng.uniform(0, math.tau)
            dist = self.rng.uniform(S.SPAWN_MIN_DIST, S.SPAWN_MAX_DIST)
            pos = player_pos + pygame.Vector2(math.cos(ang), math.sin(ang)) * dist
            pos.x = max(60.0, min(S.WORLD_WIDTH - 60.0, pos.x))
            pos.y = max(60.0, min(S.WORLD_HEIGHT - 60.0, pos.y))
            if not world_map.blocked(pos, radius):
                return pos
        return None
