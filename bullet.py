"""Bullets fired by both the player and ranged zombies."""
from __future__ import annotations

import math

import pygame

import settings as S
from collision import circle_rect_collide


class Bullet:
    """Simple projectile with trail; handles its own collisions."""

    def __init__(self, pos: pygame.Vector2, angle: float, speed: float,
                 damage: float, owner: str = "player", crit: bool = False,
                 radius: float = 4.0, elem: str | None = None) -> None:
        self.pos = pygame.Vector2(pos)
        self.vel = pygame.Vector2(speed, 0).rotate_rad(angle)
        self.damage = float(damage)
        self.owner = owner                    # 'player' | 'enemy'
        self.crit = crit
        self.radius = radius
        self.lifetime = S.BULLET_LIFETIME
        self.dead = False
        self.elem = elem                      # 'fire' | 'plasma' | 'pierce'
        self.trail_a = pygame.Vector2(pos)
        self.trail_b = pygame.Vector2(pos)
        self.hit_set: set[int] = set()        # for pierce: hit each zombie once

    # ------------------------------------------------------------- update --
    def update(self, dt: float, game) -> None:
        self.lifetime -= dt
        if self.lifetime <= 0:
            self.dead = True
            return

        distance = self.vel.length() * dt
        steps = max(1, int(distance / 10))     # sub-steps avoid tunneling
        step_vec = self.vel * (dt / steps)

        for _ in range(steps):
            self.trail_b.update(self.trail_a)
            self.trail_a.update(self.pos)
            self.pos += step_vec

            if not (0 <= self.pos.x <= S.WORLD_WIDTH and
                    0 <= self.pos.y <= S.WORLD_HEIGHT):
                self.dead = True
                return

            for rect in game.map.get_near(self.pos, self.radius):
                if circle_rect_collide(self.pos.x, self.pos.y, self.radius, rect):
                    self.dead = True
                    game.particles.impact(self.pos, S.color("ui_dim"), 4)
                    return

            if self.owner == "player":
                for z in game.zombies:
                    if id(z) in self.hit_set:
                        continue
                    if self.pos.distance_squared_to(z.pos) <= \
                            (z.radius + self.radius) ** 2:
                        z.take_damage(self.damage, self.crit, game)
                        if self.elem == "fire":
                            game.particles.burn_trail(self.pos,
                                                      math.degrees(
                                                          math.atan2(self.vel.y,
                                                                     self.vel.x)), 4)
                        elif self.elem == "plasma":
                            game.particles.explosion(self.pos, big=False)
                            game.shake_camera(2)
                        if self.elem == "pierce":
                            self.hit_set.add(id(z))
                            continue
                        self.dead = True
                        return
            else:
                p = game.player
                if self.pos.distance_squared_to(p.pos) <= \
                        (p.radius + self.radius) ** 2:
                    p.take_damage(self.damage, game)
                    self.dead = True
                    return

    # --------------------------------------------------------------- draw --
    def draw(self, surface: pygame.Surface, cam) -> None:
        sp = cam.apply(self.pos)
        ta = cam.apply(self.trail_a)
        tb = cam.apply(self.trail_b)
        if self.owner == "player":
            trail_col = (255, 220, 120, 180)
            head_col = (255, 240, 160)
        else:
            trail_col = (255, 100, 90, 180)
            head_col = (255, 180, 150)
        if tb != ta:
            t = max(1, int(self.radius * 1.2))
            pygame.draw.line(surface, trail_col, ta, tb, t)
            inner_t = max(1, int(self.radius * 0.5))
            core_col = (255, 255, 220) if self.owner == "player" else (255, 220, 200)
            pygame.draw.line(surface, core_col, ta, tb, inner_t)
        pygame.draw.circle(surface, head_col, (int(sp.x), int(sp.y)),
                           int(self.radius) + 1)
        pygame.draw.circle(surface, (255, 255, 255),
                           (int(sp.x), int(sp.y)), max(1, int(self.radius) - 2))
