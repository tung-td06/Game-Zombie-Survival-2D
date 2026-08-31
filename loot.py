"""Ground loot: coins, ammo, health, armor and rare weapon drops."""
from __future__ import annotations

import random

import pygame

import settings as S
from sprite.sprite_cache import get_loot_sprite
from weapon import WEAPON_DATA


class Loot:
    """A pickup lying in the world; magnetises to the player when close."""

    STYLE = {
        "coins": (S.color("ui_gold"), "$"),
        "ammo": ((200, 200, 210), "A"),
        "health": (S.color("ui_accent"), "+"),
        "armor": (S.color("ui_blue"), "#"),
        "weapon": ((255, 140, 220), "W"),
        "chest": ((220, 180, 80), "C"),
    }

    def __init__(self, pos: pygame.Vector2, kind: str, amount: int = 0,
                 payload: str | None = None) -> None:
        self.pos = pygame.Vector2(pos)
        self.kind = kind
        self.amount = int(amount)
        self.payload = payload              # e.g. weapon id
        self.age = 0.0
        self.dead = False

    # ------------------------------------------------------------- update --
    def update(self, dt: float, game) -> None:
        self.age += dt
        p = game.player
        d = p.pos.distance_to(self.pos)
        grabbing = game.input.is_down("interact")      # E = vacuum pickup
        magnet_mult = getattr(p, "magnet_mult", 1.0)
        magnet_range = (220 if grabbing else 110) * magnet_mult
        pickup_range = p.radius + (48 if grabbing else 14)
        if d < magnet_range and d > 0.001:
            speed = 420 if grabbing else 300
            pull = (p.pos - self.pos).normalize() * speed * dt
            self.pos += pull * max(0.3, 1.0 - d / magnet_range)
        if d < pickup_range:
            self._apply(game)
            self.dead = True

    def _apply(self, game) -> None:
        p = game.player
        if self.kind == "coins":
            p.coins += self.amount
            game.particles.float_text(self.pos, f"+${self.amount}",
                                      S.color("ui_gold"))
        elif self.kind == "health":
            p.heal(self.amount)
            game.particles.float_text(self.pos, f"+{self.amount} HP",
                                      S.color("ui_green"))
        elif self.kind == "armor":
            p.add_armor(self.amount)
            game.particles.float_text(self.pos, f"+{self.amount} ARMOR",
                                      S.color("ui_blue"))
        elif self.kind == "ammo":
            w = p.weapons.current
            w.add_reserve(int(w.magazine_size * 1.5))
            game.particles.float_text(self.pos, "AMMO", (220, 220, 230))
        elif self.kind == "weapon":
            wid = self.payload or "shotgun"
            if p.weapons.give(wid):
                p.weapons.current_id = wid
                game.toast(f"PICKED UP {WEAPON_DATA[wid]['name']}!")
            else:
                w = p.weapons.weapons[wid]
                w.add_reserve(w.magazine_size * 2)
        elif self.kind == "chest":
            import random
            r = random.random()
            if r < 0.4:
                p.coins += 200
                game.particles.float_text(self.pos, "+$200", S.color("ui_gold"))
            elif r < 0.7:
                p.heal(50)
                game.particles.float_text(self.pos, "+50 HP",
                                          S.color("ui_green"))
            elif r < 0.9:
                p.weapons.current.add_reserve(
                    p.weapons.current.magazine_size * 5)
                game.particles.float_text(self.pos, "AMMO PACK",
                                          (220, 220, 230))
            else:
                p.add_armor(50)
                game.particles.float_text(self.pos, "+50 ARMOR",
                                          S.color("ui_blue"))
            game.particles.explosion(self.pos, big=False)
            game.shake_camera(3)
        game.audio.play("pickup")

    # --------------------------------------------------------------- draw --
    def draw(self, surface: pygame.Surface, cam) -> None:
        phase = (pygame.time.get_ticks() % 1600) / 800.0
        bob = pygame.Vector2(0, -4 + 3 * (1.0 - abs(phase - 1.0)))
        sp = cam.apply(self.pos + bob)
        sprite = get_loot_sprite(self.kind)
        rect = sprite.get_rect(center=(int(sp.x), int(sp.y)))
        glow = pygame.Surface((rect.width + 8, rect.height + 8), pygame.SRCALPHA)
        glow_color = self.STYLE.get(self.kind, ((255, 255, 255), "?"))[0]
        pygame.draw.circle(glow, (*glow_color, 60),
                           (rect.width // 2 + 4, rect.height // 2 + 4),
                           rect.width // 2 + 2)
        surface.blit(glow, (rect.x - 4, rect.y - 4))
        surface.blit(sprite, rect)


def drops_for(zombie, rng: random.Random) -> list[Loot]:
    """Roll the drop table for a dying zombie."""
    drops = [Loot(zombie.pos.copy(), "coins", zombie.coin_value)]
    roll = rng.random()
    if roll < 0.06:
        drops.append(Loot(zombie.pos + pygame.Vector2(rng.uniform(-20, 20), 0),
                          "health", 25))
    elif roll < 0.17:
        drops.append(Loot(zombie.pos + pygame.Vector2(rng.uniform(-20, 20), 0),
                          "ammo"))
    elif roll < 0.21:
        drops.append(Loot(zombie.pos + pygame.Vector2(rng.uniform(-20, 20), 0),
                          "armor", 15))
    elif roll < 0.225:
        owned_locked = ["shotgun", "smg", "rifle", "sniper"]
        drops.append(Loot(zombie.pos, "weapon",
                          payload=rng.choice(owned_locked)))
    return drops
