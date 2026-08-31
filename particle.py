"""Particles (blood, smoke, fire, muzzle flash) and floating damage numbers."""
from __future__ import annotations

import math
import random

import pygame

import settings as S
from ui import get_font


class Particle:
    __slots__ = ("pos", "vel", "life", "max_life", "size", "color", "gravity", "shrink")

    def __init__(self, pos: pygame.Vector2, vel: pygame.Vector2, life: float,
                 size: float, color: tuple[int, int, int],
                 gravity: float = 0.0, shrink: bool = True) -> None:
        self.pos = pygame.Vector2(pos)
        self.vel = pygame.Vector2(vel)
        self.life = self.max_life = life
        self.size = size
        self.color = color
        self.gravity = gravity
        self.shrink = shrink

    def update(self, dt: float) -> bool:
        self.life -= dt
        if self.life <= 0:
            return False
        self.vel *= max(0.0, 1.0 - dt * 2.5)
        self.vel.y += self.gravity * dt
        self.pos += self.vel * dt
        return True

    def draw(self, surface: pygame.Surface, cam) -> None:
        t = max(0.0, self.life / self.max_life)
        alpha = int(255 * t)
        size = max(1, int(self.size * (t if self.shrink else 1.0)))
        col = (
            min(255, int(self.color[0] * t + 20)),
            min(255, int(self.color[1] * t + 20)),
            min(255, int(self.color[2] * t + 20)),
        )
        sp = cam.apply(self.pos)
        shape = pygame.draw.circle(surface, col, (int(sp.x), int(sp.y)), size)
        _ = alpha, shape


class DamageNumber:
    __slots__ = ("text", "pos", "vel", "life", "color")

    def __init__(self, text: str, pos: pygame.Vector2,
                 color: tuple[int, int, int]) -> None:
        self.text = text
        self.pos = pygame.Vector2(pos) + pygame.Vector2(random.uniform(-8, 8), -14)
        self.vel = pygame.Vector2(random.uniform(-12, 12), -55.0)
        self.life = 0.9
        self.color = color

    def update(self, dt: float) -> bool:
        self.life -= dt
        self.pos += self.vel * dt
        return self.life > 0

    def draw(self, surface: pygame.Surface, cam) -> None:
        font = get_font(16 if len(self.text) < 5 else 14)
        img = font.render(self.text, True, self.color)
        if self.life < 0.35:
            img.set_alpha(int(255 * self.life / 0.35))
        sp = cam.apply(self.pos)
        surface.blit(img, img.get_rect(center=(int(sp.x), int(sp.y))))


class ParticleSystem:
    """Central emitter/manager capped at MAX_PARTICLES."""

    def __init__(self) -> None:
        self.particles: list[Particle] = []
        self.numbers: list[DamageNumber] = []
        # Optional settings hook — set via Game._wire_settings(). When the
        # `hit_effects` toggle is False, particle emitters are no-ops; when
        # `damage_numbers` is False, no floating numbers are spawned. Both
        # default to True so existing behaviour is unchanged.
        self.settings: dict | None = None

    # ------------------------------------------------------------ emitters -
    def _push(self, p: Particle) -> None:
        if self.settings is not None \
                and not self.settings.get("hit_effects", True):
            return
        if len(self.particles) >= S.MAX_PARTICLES:
            self.particles.pop(0)
        self.particles.append(p)

    def blood(self, pos: pygame.Vector2, count: int = 8,
              color: tuple[int, int, int] | None = None) -> None:
        color = color or S.color("blood")
        for _ in range(count):
            ang = random.uniform(0, math.tau)
            spd = random.uniform(40, 220)
            self._push(Particle(pos, pygame.Vector2(spd, 0).rotate_rad(ang),
                                random.uniform(0.3, 0.7),
                                random.randint(2, 4), color))

    def impact(self, pos: pygame.Vector2,
               color: tuple[int, int, int], count: int = 5) -> None:
        for _ in range(count):
            ang = random.uniform(0, math.tau)
            spd = random.uniform(30, 130)
            self._push(Particle(pos, pygame.Vector2(spd, 0).rotate_rad(ang),
                                0.25, 2, color))

    def muzzle_flash(self, pos: pygame.Vector2, angle: float) -> None:
        for i in range(5):
            spread = angle + random.uniform(-0.35, 0.35)
            spd = random.uniform(120, 320)
            self._push(Particle(pos, pygame.Vector2(spd, 0).rotate_rad(spread),
                                random.uniform(0.06, 0.14), 3,
                                (255, 210, 90), shrink=True))
        self._push(Particle(pos, pygame.Vector2(math.cos(angle), math.sin(angle)) * 60,
                            0.08, 9, (255, 240, 170)))

    def explosion(self, pos: pygame.Vector2, big: bool = False) -> None:
        n = 40 if big else 26
        for _ in range(n):
            ang = random.uniform(0, math.tau)
            spd = random.uniform(80, 420 if big else 300)
            col = random.choice([(255, 160, 40), (255, 90, 30), (90, 90, 90)])
            self._push(Particle(pos, pygame.Vector2(spd, 0).rotate_rad(ang),
                                random.uniform(0.4, 1.0), random.randint(3, 6), col))
        for _ in range(12):
            ang = random.uniform(0, math.tau)
            self._push(Particle(pos, pygame.Vector2(random.uniform(-40, 40), 0)
                                .rotate_rad(ang), random.uniform(0.8, 1.6),
                                random.randint(6, 12), (60, 60, 60), gravity=-20))

    def burn_trail(self, pos: pygame.Vector2, angle: float,
                 count: int = 5) -> None:
        for _ in range(count):
            spread = angle + random.uniform(-0.4, 0.4)
            spd = random.uniform(60, 180)
            self._push(Particle(pos, pygame.Vector2(spd, 0).rotate_rad(spread),
                                random.uniform(0.2, 0.5),
                                random.randint(2, 4),
                                random.choice([(255, 160, 40), (255, 90, 30),
                                               (255, 220, 130)])))

    def dust(self, pos: pygame.Vector2) -> None:
        self._push(Particle(pos,
                            pygame.Vector2(random.uniform(-30, 30),
                                           random.uniform(-30, 30)),
                            random.uniform(0.4, 0.8),
                            random.randint(2, 4),
                            (170, 160, 140)))

    def heal(self, pos: pygame.Vector2) -> None:
        for _ in range(10):
            self._push(Particle(pos, pygame.Vector2(random.uniform(-30, 30), -80),
                                0.6, 3, S.color("ui_green")))

    def death_burst(self, pos: pygame.Vector2,
                    color: tuple[int, int, int]) -> None:
        for _ in range(18):
            ang = random.uniform(0, math.tau)
            spd = random.uniform(60, 260)
            self._push(Particle(pos, pygame.Vector2(spd, 0).rotate_rad(ang),
                                random.uniform(0.4, 0.9), random.randint(2, 5), color))

    # -------------------------------------------------------------- numbers -
    def damage_number(self, pos: pygame.Vector2, amount: float, crit: bool) -> None:
        if self.settings is not None \
                and not self.settings.get("damage_numbers", True):
            return
        text = f"{int(amount)}!"
        color = (255, 230, 80) if crit else (255, 255, 255)
        if crit:
            text = f"CRIT {int(amount)}"
        self.numbers.append(DamageNumber(text, pos, color))

    def float_text(self, pos: pygame.Vector2, text: str,
                   color: tuple[int, int, int]) -> None:
        self.numbers.append(DamageNumber(text, pos, color))

    # ------------------------------------------------------------ lifecycle -
    def update(self, dt: float) -> None:
        self.particles = [p for p in self.particles if p.update(dt)]
        self.numbers = [n for n in self.numbers if n.update(dt)]

    def draw(self, surface: pygame.Surface, cam) -> None:
        for p in self.particles:
            p.draw(surface, cam)
        for n in self.numbers:
            n.draw(surface, cam)

    @property
    def count(self) -> int:
        return len(self.particles) + len(self.numbers)

    def clear(self) -> None:
        self.particles.clear()
        self.numbers.clear()
