"""Centralised input handling with rebindable actions.

Decouples raw pygame events from gameplay code so key bindings can be
changed (or remapped / sent over network) without touching Player logic.
"""
from __future__ import annotations

import pygame

DEFAULT_BINDINGS: dict[str, list[int]] = {
    "move_up": [pygame.K_w],
    "move_down": [pygame.K_s],
    "move_left": [pygame.K_a],
    "move_right": [pygame.K_d],
    "reload": [pygame.K_r],
    "interact": [pygame.K_e],
    "pause": [pygame.K_ESCAPE],
    "weapon_1": [pygame.K_1],
    "weapon_2": [pygame.K_2],
    "weapon_3": [pygame.K_3],
    "weapon_4": [pygame.K_4],
    "weapon_5": [pygame.K_5],
}


class InputManager:
    """Tracks held / just-pressed keys and mouse buttons."""

    def __init__(self, bindings: dict[str, list[int]] | None = None) -> None:
        self.bindings = bindings or dict(DEFAULT_BINDINGS)
        self.keys_down: set[int] = set()
        self.keys_pressed: set[int] = set()
        self.mouse_pos: tuple[int, int] = (0, 0)
        self.mouse_down: set[int] = set()
        self.mouse_pressed: set[int] = set()

    # ------------------------------------------------------------ events ---
    def handle_event(self, event: pygame.event.Event) -> None:
        if event.type == pygame.KEYDOWN:
            self.keys_down.add(event.key)
            self.keys_pressed.add(event.key)
        elif event.type == pygame.KEYUP:
            self.keys_down.discard(event.key)
        elif event.type == pygame.MOUSEMOTION:
            self.mouse_pos = event.pos
        elif event.type == pygame.MOUSEBUTTONDOWN:
            self.mouse_down.add(event.button)
            self.mouse_pressed.add(event.button)
        elif event.type == pygame.MOUSEBUTTONUP:
            self.mouse_down.discard(event.button)

    def end_frame(self) -> None:
        """Clear per-frame 'just pressed' buffers. Call once per frame."""
        self.keys_pressed.clear()
        self.mouse_pressed.clear()

    # ------------------------------------------------------------ queries --
    def is_down(self, action: str) -> bool:
        return any(k in self.keys_down for k in self.bindings.get(action, ()))

    def is_pressed(self, action: str) -> bool:
        return any(k in self.keys_pressed for k in self.bindings.get(action, ()))

    def key_pressed(self, key: int) -> bool:
        return key in self.keys_pressed

    def mouse_moved_into(self) -> tuple[int, int]:
        return self.mouse_pos

    @property
    def mouse_clicked(self) -> bool:
        return 1 in self.mouse_pressed
