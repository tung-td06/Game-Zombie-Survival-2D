"""Circle-vs-rect collision helpers used by all moving entities."""
from __future__ import annotations

import pygame


def circle_rect_collide(cx: float, cy: float, radius: float, rect: pygame.Rect) -> bool:
    """True if a circle overlaps an axis-aligned rect."""
    nearest_x = max(rect.left, min(cx, rect.right))
    nearest_y = max(rect.top, min(cy, rect.bottom))
    dx = cx - nearest_x
    dy = cy - nearest_y
    return dx * dx + dy * dy <= radius * radius


def move_circle(pos: pygame.Vector2, delta: pygame.Vector2, radius: float,
                rects: list[pygame.Rect]) -> None:
    """Axis-separated movement with obstacle sliding.

    Moves `pos` by `delta`; on overlap the offending axis is pushed out so
    entities slide along walls instead of getting stuck.
    """
    if delta.x != 0.0:
        pos.x += delta.x
        for r in rects:
            if circle_rect_collide(pos.x, pos.y, radius, r):
                pos.x = float(r.left - radius) if delta.x > 0 else float(r.right + radius)
    if delta.y != 0.0:
        pos.y += delta.y
        for r in rects:
            if circle_rect_collide(pos.x, pos.y, radius, r):
                pos.y = float(r.top - radius) if delta.y > 0 else float(r.bottom + radius)
    # Final safety push-out for corners / spawns inside geometry.
    for r in rects:
        if circle_rect_collide(pos.x, pos.y, radius, r):
            nx = max(r.left, min(pos.x, r.right))
            ny = max(r.top, min(pos.y, r.bottom))
            dx = pos.x - nx
            dy = pos.y - ny
            d2 = dx * dx + dy * dy
            if d2 > 0.0001:
                d = d2 ** 0.5
                pos.x = nx + dx / d * radius
                pos.y = ny + dy / d * radius
