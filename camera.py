"""Smooth-follow camera with screen-shake support."""
from __future__ import annotations

import random

import pygame

import settings as S
from utils import clamp


class Camera:
    """Converts world coordinates to screen coordinates."""

    def __init__(self, view_w: int, view_h: int) -> None:
        self.view_w = view_w
        self.view_h = view_h
        self.offset = pygame.Vector2(0, 0)
        self.shake_mag = 0.0
        self._jitter = pygame.Vector2(0, 0)

    # ------------------------------------------------------------ update ----
    def update(self, target: pygame.Vector2, dt: float) -> None:
        """Smoothly follow the target point (world coords)."""
        desired = pygame.Vector2(
            clamp(target.x - self.view_w / 2, 0, max(0, S.WORLD_WIDTH - self.view_w)),
            clamp(target.y - self.view_h / 2, 0, max(0, S.WORLD_HEIGHT - self.view_h)),
        )
        self.offset += (desired - self.offset) * min(1.0, dt * 8.0)
        self.shake_mag = max(0.0, self.shake_mag - dt * 30.0)
        if self.shake_mag > 0.1:
            self._jitter = pygame.Vector2(
                random.uniform(-self.shake_mag, self.shake_mag),
                random.uniform(-self.shake_mag, self.shake_mag),
            )
        else:
            self._jitter.update(0, 0)

    def shake(self, magnitude: float, enabled: bool = True) -> None:
        # `enabled` is the screen_shake setting (default True keeps existing
        # behaviour identical when the setting hasn't been touched).
        if not enabled:
            return
        self.shake_mag = min(24.0, max(self.shake_mag, magnitude))

    # -------------------------------------------------------- conversions ---
    def apply(self, world_pos: pygame.Vector2) -> pygame.Vector2:
        """World position -> screen position."""
        return world_pos - self.offset + self._jitter

    def apply_rect(self, rect: pygame.Rect) -> pygame.Rect:
        return pygame.Rect(
            int(rect.x - self.offset.x + self._jitter.x),
            int(rect.y - self.offset.y + self._jitter.y),
            rect.width, rect.height,
        )

    def screen_to_world(self, screen_pos: tuple[float, float]) -> pygame.Vector2:
        return pygame.Vector2(screen_pos) + self.offset - self._jitter

    @property
    def view_rect(self) -> pygame.Rect:
        """Visible region in world coordinates (for culling)."""
        jx, jy = -self._jitter.x, -self._jitter.y
        return pygame.Rect(
            int(self.offset.x + jx) - 64, int(self.offset.y + jy) - 64,
            self.view_w + 128, self.view_h + 128,
        )
