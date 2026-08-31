"""Dynamic lighting: ambient + multiple radial point lights.

Renders an overlay darkened by an ambient factor (day/night cycle) and
subtracts additive circles around point lights (player torch, muzzle
flashes, gun muzzle). Light surfaces are cached per radius for speed.
"""
from __future__ import annotations

import math

import pygame

import settings as S


_light_cache: dict[int, pygame.Surface] = {}


def _make_light(radius: int, color: tuple[int, int, int]) -> pygame.Surface:
    size = radius * 2
    surf = pygame.Surface((size, size), pygame.SRCALPHA)
    center = (radius, radius)
    steps = 32
    for i in range(steps, 0, -1):
        r = int(radius * i / steps)
        # Smooth falloff — much brighter near center, gradual at edges
        t = i / steps
        alpha = int(255 * (1.0 - t) ** 1.4)
        pygame.draw.circle(surf, (*color, alpha), center, r)
    return surf


def get_light(radius: int, color: tuple[int, int, int] = (255, 220, 160)
              ) -> pygame.Surface:
    key = (radius, color)
    if key not in _light_cache:
        _light_cache[key] = _make_light(radius, color)
    return _light_cache[key]


def clear_cache() -> None:
    _light_cache.clear()


class LightingSystem:
    """Per-frame compositing of point lights.

    Hard-disabled: brightness is locked at 100%. No overlay is ever applied
    to the world surface, so the map stays at full daylight brightness
    regardless of game time, wave count, or any other state.
    """

    def __init__(self) -> None:
        self.lights: list[tuple[pygame.Vector2, int, tuple[int, int, int],
                                  float]] = []
        # Hard-disabled: always zero.
        self.ambient_alpha = 0
        self.day_ambient_alpha = 0
        self.day_threshold = 1.0  # never enter "night" branch

    def add_light(self, pos: pygame.Vector2, radius: int,
                  color: tuple[int, int, int] = (255, 220, 160),
                  intensity: float = 1.0) -> None:
        # Brightness locked at 100%: ignore all light contributions so no
        # overlay ever darkens the screen, no matter the wave / time / fog.
        return

    def render(self, surface: pygame.Surface, cam,
               night_factor: float = 0.0,
               player_pos: pygame.Vector2 | None = None,
               ambient_color: tuple[int, int, int] = (90, 110, 160)) -> None:
        """No-op: brightness is locked at 100%, nothing to draw."""
        return