"""Procedural sprite cache: draws entity sprites into pygame.Surfaces.

All sprites are generated at runtime from primitives so the game has zero
external asset dependency. Each sprite is pre-rendered once at the
player's current resolution scale, cached by (kind, frame, color).

Coordinate convention: sprites are drawn centered on (cx, cy).
"""
from __future__ import annotations

import math

import pygame

import settings as S


_FRAMES: dict[str, pygame.Surface] = {}
_FRAME_ROT: dict[tuple[str, int], pygame.Surface] = {}


def _circle_surf(size: int, body: tuple[int, int, int],
                 rim: tuple[int, int, int], outline: tuple[int, int, int],
                 highlight: tuple[int, int, int] | None = None,
                 detail: tuple | None = None) -> pygame.Surface:
    surf = pygame.Surface((size, size), pygame.SRCALPHA)
    cx = cy = size // 2
    r = size // 2 - 2
    pygame.draw.circle(surf, outline, (cx, cy), r + 1)
    pygame.draw.circle(surf, body, (cx, cy), r)
    pygame.draw.circle(surf, rim, (cx, cy), r - 2)
    if highlight:
        pygame.draw.circle(surf, highlight, (cx - r // 3, cy - r // 3), r // 3)
    if detail:
        pygame.draw.circle(surf, detail, (cx + r // 3, cy + r // 3), r // 6)
    pygame.draw.circle(surf, (0, 0, 0, 80), (cx + 1, cy + 2), r)
    pygame.draw.circle(surf, (0, 0, 0, 0), (cx, cy), r + 2)
    return surf


def _player_sprite(frame: int = 0) -> pygame.Surface:
    """Top-down player avatar: round body + shoulder pads + backpack.

    `frame` (0..3) cycles the leg animation.
    """
    size = 56
    s = pygame.Surface((size, size), pygame.SRCALPHA)
    body = S.color("player")
    dark = S.color("player_dark")
    highlight = (170, 230, 255)
    cx, cy = size // 2, size // 2 + 2
    r = 16

    shadow = pygame.Surface((size, size), pygame.SRCALPHA)
    pygame.draw.ellipse(shadow, (0, 0, 0, 110), (cx - 16, cy + 14, 32, 12))
    pygame.draw.ellipse(shadow, (0, 0, 0, 60), (cx - 12, cy + 17, 24, 8))
    s.blit(shadow, (0, 0))

    pygame.draw.circle(s, (8, 10, 14), (cx, cy + 1), r + 3)
    pygame.draw.circle(s, body, (cx, cy), r)
    pygame.draw.circle(s, (130, 235, 255), (cx, cy), r - 4)
    pygame.draw.circle(s, (220, 245, 255), (cx - 4, cy - 5), 4)
    pygame.draw.circle(s, (250, 255, 255), (cx - 4, cy - 5), 2)

    pygame.draw.circle(s, dark, (cx + 10, cy - 5), 4)
    pygame.draw.circle(s, dark, (cx - 10, cy + 5), 4)
    pygame.draw.circle(s, (60, 80, 100), (cx + 10, cy - 5), 2)
    pygame.draw.circle(s, (60, 80, 100), (cx - 10, cy + 5), 2)

    pygame.draw.rect(s, (50, 70, 90), (cx - 5, cy + 11, 10, 5), border_radius=2)
    pygame.draw.rect(s, (30, 30, 36), (cx + 5, cy - 8, 9, 14), border_radius=3)
    pygame.draw.rect(s, (70, 70, 80), (cx + 6, cy - 7, 7, 12), border_radius=2)
    pygame.draw.rect(s, highlight, (cx + 6, cy - 7, 7, 2))

    leg_phase = (frame % 4)
    leg_off_x = [(-4, 4), (-2, 2), (4, -4), (2, -2)][leg_phase]
    leg_off_y = [(0, 0), (1, 1), (0, 0), (1, 1)][leg_phase]
    pygame.draw.circle(s, dark,
                       (cx - 6 + leg_off_x[0], cy + 14 + leg_off_y[0]), 3)
    pygame.draw.circle(s, dark,
                       (cx + 6 + leg_off_x[1], cy + 14 + leg_off_y[1]), 3)
    pygame.draw.circle(s, (90, 100, 110),
                       (cx - 6 + leg_off_x[0], cy + 14 + leg_off_y[0]), 2)
    pygame.draw.circle(s, (90, 100, 110),
                       (cx + 6 + leg_off_x[1], cy + 14 + leg_off_y[1]), 2)

    pygame.draw.circle(s, (240, 250, 255), (cx, cy), 2)
    return s


def _zombie_sprite(kind: str, body_color: tuple[int, int, int]) -> pygame.Surface:
    size = 64
    s = pygame.Surface((size, size), pygame.SRCALPHA)
    cx, cy = size // 2, size // 2
    shadow = pygame.Surface((size, size), pygame.SRCALPHA)
    pygame.draw.ellipse(shadow, (0, 0, 0, 80), (cx - 18, cy + 14, 36, 14))
    s.blit(shadow, (0, 0))
    if kind == "fast":
        body_r = 12
        pygame.draw.circle(s, (10, 16, 10), (cx, cy), body_r + 2)
        pygame.draw.circle(s, body_color, (cx, cy), body_r)
        pygame.draw.circle(s, (220, 30, 30), (cx - 3, cy - 3), 2)
        pygame.draw.circle(s, (220, 30, 30), (cx + 3, cy - 3), 2)
        pygame.draw.circle(s, (255, 230, 60), (cx + 4, cy - 6), 1)
        pygame.draw.polygon(s, (255, 230, 60), [(cx, cy - 8), (cx + 1, cy - 2),
                                                  (cx - 1, cy - 2)])
    elif kind == "tank":
        body_r = 22
        pygame.draw.circle(s, (14, 10, 18), (cx, cy), body_r + 2)
        pygame.draw.circle(s, body_color, (cx, cy), body_r)
        pygame.draw.circle(s, (60, 50, 70), (cx, cy), body_r - 4)
        pygame.draw.circle(s, (220, 30, 30), (cx - 7, cy - 5), 3)
        pygame.draw.circle(s, (220, 30, 30), (cx + 7, cy - 5), 3)
        for px in (-10, 0, 10):
            pygame.draw.line(s, (30, 24, 36), (cx + px, cy - 16),
                             (cx + px, cy - 22), 2)
    elif kind == "exploder":
        body_r = 17
        pygame.draw.circle(s, (24, 12, 6), (cx, cy), body_r + 2)
        pygame.draw.circle(s, body_color, (cx, cy), body_r)
        pygame.draw.circle(s, (255, 160, 60), (cx, cy), body_r - 4)
        for ang_i in range(6):
            ang = math.tau * ang_i / 6
            bx = cx + math.cos(ang) * (body_r - 2)
            by = cy + math.sin(ang) * (body_r - 2)
            pygame.draw.circle(s, (140, 60, 30), (int(bx), int(by)), 3)
        pygame.draw.circle(s, (220, 30, 30), (cx - 4, cy - 4), 2)
        pygame.draw.circle(s, (220, 30, 30), (cx + 4, cy - 4), 2)
    elif kind == "ranged":
        body_r = 14
        pygame.draw.circle(s, (10, 22, 22), (cx, cy), body_r + 2)
        pygame.draw.circle(s, body_color, (cx, cy), body_r)
        pygame.draw.circle(s, (40, 80, 80), (cx, cy), body_r - 3)
        pygame.draw.circle(s, (220, 30, 30), (cx - 4, cy - 4), 2)
        pygame.draw.circle(s, (220, 30, 30), (cx + 4, cy - 4), 2)
        pygame.draw.rect(s, (30, 60, 60), (cx + body_r - 2, cy - 2, 8, 4))
    elif kind == "boss":
        body_r = 38
        pygame.draw.circle(s, (40, 8, 10), (cx, cy), body_r + 4)
        pygame.draw.circle(s, body_color, (cx, cy), body_r)
        pygame.draw.circle(s, (90, 20, 24), (cx, cy), body_r - 6)
        pygame.draw.circle(s, (220, 30, 30), (cx - 12, cy - 8), 5)
        pygame.draw.circle(s, (220, 30, 30), (cx + 12, cy - 8), 5)
        pygame.draw.circle(s, (255, 200, 60), (cx - 12, cy - 8), 2)
        pygame.draw.circle(s, (255, 200, 60), (cx + 12, cy - 8), 2)
        pygame.draw.circle(s, (10, 4, 6), (cx, cy + 12), 6)
        pygame.draw.polygon(s, (240, 220, 200), [(cx - 4, cy + 10),
                                                  (cx + 4, cy + 10),
                                                  (cx, cy + 16)])
        for sx in (-22, 0, 22):
            pygame.draw.line(s, (60, 14, 18), (cx + sx, cy - body_r + 4),
                             (cx + sx, cy - body_r - 6), 3)
    elif kind == "crawler":
        body_r = 14
        pygame.draw.ellipse(s, (12, 16, 12), (cx - 16, cy - 4, 32, 14))
        pygame.draw.ellipse(s, body_color, (cx - 14, cy - 3, 28, 10))
        pygame.draw.circle(s, (220, 30, 30), (cx + 6, cy - 4), 2)
        pygame.draw.line(s, (40, 60, 40), (cx - 14, cy + 4), (cx - 22, cy + 8), 2)
        pygame.draw.line(s, (40, 60, 40), (cx + 14, cy + 4), (cx + 22, cy + 8), 2)
    elif kind == "necromancer":
        body_r = 16
        pygame.draw.circle(s, (20, 10, 24), (cx, cy), body_r + 2)
        pygame.draw.circle(s, body_color, (cx, cy), body_r)
        pygame.draw.polygon(s, (50, 30, 60), [(cx, cy - body_r - 8),
                                                (cx - 10, cy - body_r + 4),
                                                (cx + 10, cy - body_r + 4)])
        pygame.draw.circle(s, (220, 30, 30), (cx - 4, cy - 4), 2)
        pygame.draw.circle(s, (220, 30, 30), (cx + 4, cy - 4), 2)
        pygame.draw.circle(s, (170, 90, 220), (cx, cy + 6), 3)
    else:
        body_r = 14
        pygame.draw.circle(s, (12, 18, 12), (cx, cy), body_r + 2)
        pygame.draw.circle(s, body_color, (cx, cy), body_r)
        pygame.draw.circle(s, (50, 80, 40), (cx, cy), body_r - 3)
        pygame.draw.circle(s, (220, 30, 30), (cx - 4, cy - 4), 2)
        pygame.draw.circle(s, (220, 30, 30), (cx + 4, cy - 4), 2)
        pygame.draw.line(s, (40, 60, 30), (cx - body_r, cy + 4),
                         (cx - body_r - 6, cy + 8), 2)
        pygame.draw.line(s, (40, 60, 30), (cx + body_r, cy + 4),
                         (cx + body_r + 6, cy + 8), 2)
    return s


def _bullet_sprite(owner: str) -> pygame.Surface:
    size = 16
    s = pygame.Surface((size, size), pygame.SRCALPHA)
    if owner == "player":
        outer = (255, 240, 130)
        inner = (255, 255, 200)
    else:
        outer = (255, 110, 90)
        inner = (255, 200, 160)
    cx, cy = size // 2, size // 2
    pygame.draw.circle(s, outer, (cx, cy), 5)
    pygame.draw.circle(s, inner, (cx, cy), 3)
    pygame.draw.circle(s, (255, 255, 255), (cx - 1, cy - 1), 1)
    return s


def _loot_sprite(kind: str) -> pygame.Surface:
    size = 32
    s = pygame.Surface((size, size), pygame.SRCALPHA)
    cx, cy = size // 2, size // 2
    if kind == "coins":
        pygame.draw.circle(s, (240, 200, 80), (cx, cy), 10)
        pygame.draw.circle(s, (180, 130, 40), (cx, cy), 10, 2)
        pygame.draw.circle(s, (255, 230, 130), (cx - 3, cy - 3), 3)
        f = pygame.font.SysFont("consolas", 11, bold=True)
        img = f.render("$", True, (60, 40, 12))
        s.blit(img, img.get_rect(center=(cx, cy + 1)))
    elif kind == "ammo":
        pygame.draw.rect(s, (200, 200, 210), (cx - 8, cy - 8, 16, 16),
                         border_radius=3)
        pygame.draw.rect(s, (120, 120, 130), (cx - 8, cy - 8, 16, 16), 2,
                         border_radius=3)
        f = pygame.font.SysFont("consolas", 10, bold=True)
        img = f.render("A", True, (20, 20, 24))
        s.blit(img, img.get_rect(center=(cx, cy + 1)))
    elif kind == "health":
        pygame.draw.rect(s, (220, 60, 70), (cx - 8, cy - 8, 16, 16),
                         border_radius=4)
        pygame.draw.rect(s, (140, 30, 40), (cx - 8, cy - 8, 16, 16), 2,
                         border_radius=4)
        pygame.draw.rect(s, (255, 240, 240), (cx - 4, cy - 1, 8, 2))
        pygame.draw.rect(s, (255, 240, 240), (cx - 1, cy - 4, 2, 8))
    elif kind == "armor":
        pygame.draw.rect(s, (90, 180, 255), (cx - 9, cy - 9, 18, 18),
                         border_radius=4)
        pygame.draw.rect(s, (40, 100, 180), (cx - 9, cy - 9, 18, 18), 2,
                         border_radius=4)
        f = pygame.font.SysFont("consolas", 10, bold=True)
        img = f.render("#", True, (10, 20, 40))
        s.blit(img, img.get_rect(center=(cx, cy + 1)))
    elif kind == "weapon":
        pygame.draw.rect(s, (255, 140, 220), (cx - 9, cy - 9, 18, 18),
                         border_radius=4)
        pygame.draw.rect(s, (160, 60, 130), (cx - 9, cy - 9, 18, 18), 2,
                         border_radius=4)
        f = pygame.font.SysFont("consolas", 10, bold=True)
        img = f.render("W", True, (40, 10, 30))
        s.blit(img, img.get_rect(center=(cx, cy + 1)))
    elif kind == "chest":
        pygame.draw.rect(s, (220, 180, 80), (cx - 11, cy - 8, 22, 16),
                         border_radius=2)
        pygame.draw.rect(s, (120, 80, 30), (cx - 11, cy - 8, 22, 16), 2,
                         border_radius=2)
        pygame.draw.rect(s, (180, 130, 40), (cx - 11, cy - 2, 22, 3))
        pygame.draw.circle(s, (255, 230, 130), (cx, cy + 1), 2)
    return s


def get_player_sprite(frame: int = 0) -> pygame.Surface:
    key = f"player:{frame}"
    if key not in _FRAMES:
        _FRAMES[key] = _player_sprite(frame)
    return _FRAMES[key]


def get_zombie_sprite(kind: str, body_color: tuple[int, int, int]) -> pygame.Surface:
    key = f"z:{kind}:{body_color}"
    if key not in _FRAMES:
        _FRAMES[key] = _zombie_sprite(kind, body_color)
    return _FRAMES[key]


def get_bullet_sprite(owner: str) -> pygame.Surface:
    key = f"b:{owner}"
    if key not in _FRAMES:
        _FRAMES[key] = _bullet_sprite(owner)
    return _FRAMES[key]


def get_loot_sprite(kind: str) -> pygame.Surface:
    key = f"l:{kind}"
    if key not in _FRAMES:
        _FRAMES[key] = _loot_sprite(kind)
    return _FRAMES[key]


# ----------------------------------------------------------- supply crate -
def _supply_crate_sprite(kind: str) -> pygame.Surface:
    """Top-down supply crate sprite matching the game's existing crate /
    chest style (dark wood/metal palette, thick outline).

    The centre icon varies per kind so players can recognise loot at a
    glance:  A = ammo, + = health, # = armor, W = weapon, * = mixed.
    """
    size = 40
    s = pygame.Surface((size, size), pygame.SRCALPHA)
    cx = cy = size // 2

    # Base palette — kind colours mirror SupplyCrate.KIND_COLORS.
    kind_styles = {
        "ammo":   ((170, 174, 188), (90, 96, 110),  "A"),
        "health": ((180, 60, 70),   (110, 30, 38),  "+"),
        "armor":  ((70, 130, 180),  (32, 70, 110),  "#"),
        "weapon": ((170, 90, 140),  (90, 40, 70),   "W"),
        "mixed":  ((170, 130, 60),  (90, 60, 24),   "*"),
    }
    body, dark, glyph = kind_styles.get(
        kind, ((140, 120, 90), (80, 60, 30), "?"))

    # Plank base shadow under the crate.
    pygame.draw.ellipse(s, (0, 0, 0, 110),
                        (cx - 16, cy + 12, 32, 8))

    # Main body — slightly trapezoidal look via two rects.
    pygame.draw.rect(s, (8, 8, 12), (cx - 14, cy - 10, 28, 22),
                     border_radius=3)              # outline
    pygame.draw.rect(s, body, (cx - 12, cy - 9, 24, 19),
                     border_radius=3)
    # Top "lid" line (horizontal plank gap).
    pygame.draw.rect(s, dark, (cx - 12, cy - 4, 24, 2))
    pygame.draw.line(s, dark,
                     (cx, cy - 9), (cx, cy - 2), 1)

    # Reinforcement corners.
    pygame.draw.rect(s, dark, (cx - 12, cy - 9, 4, 4),
                     border_radius=1)
    pygame.draw.rect(s, dark, (cx + 8, cy - 9, 4, 4),
                     border_radius=1)
    pygame.draw.rect(s, dark, (cx - 12, cy + 6, 4, 4),
                     border_radius=1)
    pygame.draw.rect(s, dark, (cx + 8, cy + 6, 4, 4),
                     border_radius=1)

    # Cross-bracing "X" so it visually reads as a crate, not a chest.
    pygame.draw.line(s, dark, (cx - 9, cy + 7),
                     (cx + 9, cy - 6), 1)
    pygame.draw.line(s, dark, (cx - 9, cy - 6),
                     (cx + 9, cy + 7), 1)

    # Glyph in the centre.
    f = pygame.font.SysFont("consolas", 13, bold=True)
    img = f.render(glyph, True, (245, 245, 235))
    s.blit(img, img.get_rect(center=(cx, cy + 1)))

    # Small highlight on top edge so it reads as 3D.
    pygame.draw.line(s, (255, 255, 255, 70),
                     (cx - 8, cy - 8), (cx + 8, cy - 8), 1)
    return s


def get_supply_crate_sprite(kind: str) -> pygame.Surface:
    key = f"crate:{kind}"
    if key not in _FRAMES:
        _FRAMES[key] = _supply_crate_sprite(kind)
    return _FRAMES[key]


def clear_cache() -> None:
    _FRAMES.clear()
    _FRAME_ROT.clear()