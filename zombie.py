"""Zombie base class + AI, and all zombie types (data-driven).

Types: normal, fast, tank, exploder (AoE on death), ranged (projectile),
boss (phase system, radial barrage), crawler, necromancer.
"""
from __future__ import annotations

import math
import random

import pygame

import settings as S
from collision import move_circle
from sprite.sprite_cache import get_zombie_sprite
from utils import clamp
from utils import load_json

ZOMBIE_DATA: dict[str, dict] = load_json(S.ZOMBIES_FILE, {
    "normal": {"name": "Zombie", "hp": 100, "speed": 90, "damage": 10,
               "radius": 16, "attack_range": 40, "attack_cooldown": 1.0,
               "detection_range": 430, "score": 100, "coins": 10, "xp": 20},
})
ZOMBIE_COLORS = {
    "normal": S.color("zombie_normal"),
    "fast": S.color("zombie_fast"),
    "tank": S.color("zombie_tank"),
    "exploder": S.color("zombie_exploder"),
    "ranged": S.color("zombie_ranged"),
    "boss": S.color("zombie_boss"),
    "crawler": (110, 130, 70),
    "necromancer": (140, 80, 180),
    "necromancer_boss": (170, 90, 220),
}


class Zombie:
    """Base zombie with state machine AI:

    Idle -> Detect -> Chase -> Attack -> Recover (cooldown) -> Chase...
    Movement uses axis-separated obstacle sliding; never walks through walls.
    """
    KIND = "normal"
    ignores_obstacles: bool = True

    def __init__(self, pos: pygame.Vector2, hp_mult: float = 1.0,
                 speed_mult: float = 1.0, dmg_mult: float = 1.0) -> None:
        d = ZOMBIE_DATA.get(self.KIND, ZOMBIE_DATA["normal"])
        self.data = d
        self.pos = pygame.Vector2(pos)
        self.vel = pygame.Vector2(0, 0)
        self.hp = float(d["hp"]) * hp_mult
        self.max_hp = self.hp
        self.speed = float(d["speed"]) * speed_mult
        self.damage = float(d["damage"]) * dmg_mult
        self.radius = float(d["radius"])
        self.attack_range = float(d.get("attack_range", 40))
        self.attack_cooldown_max = float(d.get("attack_cooldown", 1.0))
        self.detection_range = float(d.get("detection_range", 430))
        self.score_value = int(d.get("score", 100))
        self.coin_value = int(d.get("coins", 10))
        self.xp_value = int(d.get("xp", 20))
        self.ignores_obstacles = bool(d.get("ignores_obstacles",
                                            self.ignores_obstacles))

        self.state = "idle"
        self.face_angle = 0.0
        self.attack_timer = random.uniform(0, self.attack_cooldown_max)
        self.flash = 0.0
        self.knockback = pygame.Vector2(0, 0)
        self.wander_angle = random.uniform(0, math.tau)
        self.wander_timer = 0.0
        self.growl_cd = random.uniform(2.0, 8.0)
        self.walk_phase = random.uniform(0, math.tau)
        self.last_pos = pygame.Vector2(pos)
        self.moving_recently = False

    # ------------------------------------------------------------- update --
    def update(self, dt: float, game) -> None:
        player = game.player
        to_p = player.pos - self.pos
        dist = to_p.length()
        night = game.night_factor
        speed = self.speed * (1.0 + S.NIGHT_SPEED_BONUS * night)
        damage = self.damage * (1.0 + S.NIGHT_DAMAGE_BONUS * night)

        # --- perception -------------------------------------------------
        if dist > 0.001:
            self.face_angle = math.atan2(to_p.y, to_p.x)
        if dist <= self.detection_range or self.hp < self.max_hp:
            if self.state == "idle":
                self.state = "chase"
                if random.random() < 0.3:
                    game.audio.play("zombie_hit")
        else:
            self.state = "idle"

        move = pygame.Vector2(0, 0)
        if self.state == "idle":
            self.wander_timer -= dt
            if self.wander_timer <= 0:
                self.wander_timer = random.uniform(1.5, 3.5)
                self.wander_angle += random.uniform(-2.0, 2.0)
            move = pygame.Vector2(math.cos(self.wander_angle),
                                  math.sin(self.wander_angle)) * (speed * 0.25)
        else:
            self.growl_cd -= dt
            if self.growl_cd <= 0 and dist < 600:
                self.growl_cd = random.uniform(4.0, 9.0)

            if self._wants_to_stop(dist):
                pass                                    # hold position & shoot
            elif dist > self.attack_range * 0.85:
                if to_p.length_squared() > 0:
                    move = to_p.normalize() * speed

            # --- melee attack -------------------------------------------
            reach = self.attack_range + self.radius + player.radius * 0.5
            self.attack_timer -= dt
            if dist <= reach and self.attack_timer <= 0:
                self.attack_timer = self.attack_cooldown_max
                player.take_damage(damage, game)
                self._on_attack(game)

        self._extra_behaviour(dt, game, dist, damage)

        # --- separation from other zombies ------------------------------
        sep = self._separation(game)
        move += sep

        # --- apply knockback + movement with obstacle sliding ------------
        kb = self.knockback * dt
        self.knockback *= max(0.0, 1.0 - dt * 6.0)
        total = move * dt + kb
        if total.length_squared() > 0:
            if self.ignores_obstacles:
                rects = game.map.get_near_phasing(self.pos, self.radius + 4)
            else:
                rects = game.map.get_near(self.pos, self.radius + 4)
            move_circle(self.pos, total, self.radius, rects)
            self.pos.x = clamp(self.pos.x, self.radius, S.WORLD_WIDTH - self.radius)
            self.pos.y = clamp(self.pos.y, self.radius, S.WORLD_HEIGHT - self.radius)
        moved = self.pos.distance_to(self.last_pos)
        self.moving_recently = moved > 0.5
        if self.moving_recently:
            self.walk_phase += dt * (speed / max(1.0, self.radius)) * 2.0
        self.last_pos.update(self.pos)
        self.flash = max(0.0, self.flash - dt)

    # ---- hooks for subclasses --------------------------------------------
    def _separation(self, game) -> pygame.Vector2:
        """Push away from nearby zombies using the frame's spatial hash."""
        px = self.pos.x
        py = self.pos.y
        min_d = self.radius * 1.9
        push_x = 0.0
        push_y = 0.0
        gx = int(px) // 128
        gy = int(py) // 128
        grid = getattr(game, "zgrid", None)
        if not grid:
            return pygame.Vector2(0, 0)
        for cx in (gx - 1, gx, gx + 1):
            for cy in (gy - 1, gy, gy + 1):
                bucket = grid.get((cx, cy))
                if not bucket:
                    continue
                for other in bucket:
                    if other is self:
                        continue
                    dx = px - other.pos.x
                    dy = py - other.pos.y
                    d2 = dx * dx + dy * dy
                    md = min_d + other.radius * 0.4
                    if 0.001 < d2 < md * md:
                        d = max(0.05, d2 ** 0.5)
                        f = min(8.0, (md - d) / d)
                        push_x += dx * f
                        push_y += dy * f
        return pygame.Vector2(push_x * 2.0, push_y * 2.0)

    def _wants_to_stop(self, dist: float) -> bool:
        return False

    def _on_attack(self, game) -> None:
        pass

    def _extra_behaviour(self, dt: float, game, dist: float,
                         damage: float) -> None:
        pass

    # ------------------------------------------------------------ damage ---
    def take_damage(self, amount: float, crit: bool, game) -> None:
        self.hp -= amount
        self.flash = 0.12
        self.state = "chase"                       # getting shot angers it
        game.particles.blood(self.pos, 6)
        game.particles.damage_number(self.pos, amount, crit)
        game.audio.play("zombie_hit")
        if self.hp <= 0:
            self.die(game)

    def die(self, game) -> None:
        if getattr(self, "_dying", False):
            return
        self._dying = True
        game.on_zombie_killed(self)
        game.particles.death_burst(self.pos, ZOMBIE_COLORS.get(
            self.KIND, S.color("zombie_normal")))
        game.audio.play("zombie_die")

    # --------------------------------------------------------------- draw --
    def draw(self, surface: pygame.Surface, cam) -> None:
        sp = cam.apply(self.pos)
        col = ZOMBIE_COLORS.get(self.KIND, S.color("zombie_normal"))
        sprite = get_zombie_sprite(self.KIND, col)
        walk = math.sin(self.walk_phase) * 1.5 if self.moving_recently else 0
        scale = max(0.5, self.radius / 16.0)
        scaled = pygame.transform.rotozoom(sprite, 0, scale) \
            if abs(scale - 1.0) > 0.05 else sprite
        rot = pygame.transform.rotate(
            scaled, -math.degrees(self.face_angle))
        rect = rot.get_rect(center=(int(sp.x), int(sp.y) + int(walk)))
        if self.flash > 0 and int(self.flash * 40) % 2 == 0:
            tinted = rot.copy()
            white = pygame.Surface(tinted.get_size(), pygame.SRCALPHA)
            white.fill((255, 255, 255, 100))
            tinted.blit(white, (0, 0))
            surface.blit(tinted, rect)
        else:
            surface.blit(rot, rect)

        if self.hp < self.max_hp:
            r = int(self.radius)
            w = r * 2
            frac = max(0.0, self.hp / self.max_hp)
            bar_y = rect.top - 8
            pygame.draw.rect(surface, (30, 30, 30),
                             (rect.centerx - r, bar_y, w, 5))
            bar_color = (220, 50, 50) if self.KIND != "boss" else (255, 200, 60)
            pygame.draw.rect(surface, bar_color,
                             (rect.centerx - r, bar_y, int(w * frac), 5))
            pygame.draw.rect(surface, (10, 10, 12),
                             (rect.centerx - r, bar_y, w, 5), 1)


class NormalZombie(Zombie):
    KIND = "normal"


class FastZombie(Zombie):
    KIND = "fast"


class TankZombie(Zombie):
    KIND = "tank"


class ExploderZombie(Zombie):
    KIND = "exploder"

    def die(self, game) -> None:
        if getattr(self, "_dying", False):
            return
        self._dying = True
        d = self.data
        radius = float(d.get("explosion_radius", 140))
        boom_dmg = float(d.get("explosion_damage", 55)) * \
            (1.0 + S.NIGHT_DAMAGE_BONUS * game.night_factor)
        game.particles.explosion(self.pos, big=True)
        game.shake_camera(14)
        game.audio.play("explosion")
        pdist = game.player.pos.distance_to(self.pos)
        if pdist < radius:
            falloff = 1.0 - pdist / radius
            game.player.take_damage(max(6.0, boom_dmg * falloff), game)
        for z in game.zombies:                     # friendly fire is fun
            if z is not self and z.pos.distance_to(self.pos) < radius:
                z.take_damage(boom_dmg * 0.5, False, game)
        game.on_zombie_killed(self)


class RangedZombie(Zombie):
    KIND = "ranged"
    PREFERRED_DIST = 280.0

    def _wants_to_stop(self, dist: float) -> bool:
        return dist < self.attack_range

    def _extra_behaviour(self, dt: float, game, dist: float,
                         damage: float) -> None:
        if dist > self.PREFERRED_DIST * 0.7 and dist < self.attack_range \
                and self.state != "idle":
            self.attack_timer -= 0                 # timer already ticked in base
            if self.attack_timer <= 0:
                self.attack_timer = self.attack_cooldown_max
                from bullet import Bullet
                angle = math.atan2(game.player.pos.y - self.pos.y,
                                   game.player.pos.x - self.pos.x)
                muzzle = self.pos + pygame.Vector2(math.cos(angle),
                                                   math.sin(angle)) * self.radius
                game.enemy_bullets.append(Bullet(
                    muzzle, angle, float(self.data.get("projectile_speed", 420)),
                    damage, owner="enemy"))
                game.particles.muzzle_flash(muzzle, angle)


class BossZombie(Zombie):
    """Boss: phase system + radial bullet barrage."""
    KIND = "boss"

    def __init__(self, pos: pygame.Vector2, hp_mult: float = 1.0,
                 speed_mult: float = 1.0, dmg_mult: float = 1.0) -> None:
        super().__init__(pos, hp_mult, speed_mult, dmg_mult)
        self.phase = 1
        self.barrage_timer = 3.0
        self.detection_range = 100000.0

    @property
    def phase_count(self) -> int:
        return 3

    def _current_phase(self) -> int:
        frac = self.hp / self.max_hp
        if frac > 0.66:
            return 1
        if frac > 0.33:
            return 2
        return 3

    def _extra_behaviour(self, dt: float, game, dist: float,
                         damage: float) -> None:
        new_phase = self._current_phase()
        if new_phase != self.phase:
            self.phase = new_phase
            game.shake_camera(18)
            game.audio.play("boss_roar")
            game.toast(f"BOSS PHASE {self.phase}!")
        if self.phase >= 2:
            self.barrage_timer -= dt
            interval = float(self.data.get("barrage_interval", 6.0))
            if self.phase >= 3:
                interval *= 0.5
            if self.barrage_timer <= 0:
                self.barrage_timer = interval
                self._barrage(game)

    def _barrage(self, game) -> None:
        from bullet import Bullet
        n = int(self.data.get("barrage_bullets", 14)) + (self.phase - 1) * 3
        for i in range(n):
            ang = math.tau * i / n
            game.enemy_bullets.append(Bullet(
                self.pos.copy(), ang, 300.0, self.damage * 0.6, owner="enemy"))
        game.shake_camera(8)

    def draw(self, surface: pygame.Surface, cam) -> None:
        super().draw(surface, cam)
        sp = cam.apply(self.pos)
        r = int(self.radius)
        pulse = 0.5 + 0.5 * math.sin(pygame.time.get_ticks() / 250)
        aura = pygame.Surface((r * 4, r * 4), pygame.SRCALPHA)
        pygame.draw.circle(aura, (255, 80, 80, int(60 + 40 * pulse)),
                           (r * 2, r * 2), r + 14)
        pygame.draw.circle(aura, (255, 180, 60, int(40 + 30 * pulse)),
                           (r * 2, r * 2), r + 8)
        surface.blit(aura, aura.get_rect(center=(int(sp.x), int(sp.y))))
        pygame.draw.circle(surface, (255, 200, 60), (int(sp.x), int(sp.y)),
                           r + 6, 3)
        font = pygame.font.SysFont("consolas", 13, bold=True)
        img = font.render(f"P{self.phase}", True, (255, 210, 80))
        surface.blit(img, img.get_rect(center=(int(sp.x), int(sp.y) - r - 16)))


class CrawlerZombie(Zombie):
    """Crawler: low profile, fast on straight lines, low HP. Hard to hit."""
    KIND = "crawler"

    def __init__(self, pos: pygame.Vector2, hp_mult: float = 1.0,
                 speed_mult: float = 1.0, dmg_mult: float = 1.0) -> None:
        super().__init__(pos, hp_mult, speed_mult, dmg_mult)
        self.crawl_burst = 0.0


class NecromancerZombie(Zombie):
    """Necromancer: ranged summoner; periodically spawns crawlers."""
    KIND = "necromancer"
    PREFERRED_DIST = 320.0

    def _wants_to_stop(self, dist: float) -> bool:
        return dist < self.attack_range

    def _extra_behaviour(self, dt: float, game, dist: float,
                         damage: float) -> None:
        self.summon_cd = getattr(self, "summon_cd", 6.0) - dt
        if self.summon_cd <= 0 and len(game.zombies) < S.MAX_ALIVE_ZOMBIES:
            self.summon_cd = 8.0
            for i in range(2):
                offset = pygame.Vector2(
                    (i - 0.5) * 30,
                    (i - 0.5) * 30)
                from zombie import create_zombie
                if hasattr(game, "spawner"):
                    pos = game.spawner.spawn_position(self.pos, game.map)
                else:
                    pos = self.pos + offset
                if pos is not None:
                    game.zombies.append(create_zombie(
                        "crawler", pos,
                        game.wave_manager.hp_mult,
                        game.wave_manager.speed_mult * 0.9,
                        game.wave_manager.dmg_mult * 0.6))
                    game.particles.heal(pos)
            game.audio.play("zombie_hit")
            game.shake_camera(2)


class NecromancerBossZombie(BossZombie):
    """Boss variant for wave >=15: Necromancer. Summons minions, ranged AoE."""
    KIND = "necromancer_boss"

    def __init__(self, pos: pygame.Vector2, hp_mult: float = 1.0,
                 speed_mult: float = 1.0, dmg_mult: float = 1.0) -> None:
        super().__init__(pos, hp_mult, speed_mult, dmg_mult)
        self.summon_cd = 4.0

    def _barrage(self, game) -> None:
        from bullet import Bullet
        n = 10
        for i in range(n):
            ang = math.tau * i / n + pygame.time.get_ticks() / 1000
            game.enemy_bullets.append(Bullet(
                self.pos.copy(), ang, 280.0, self.damage * 0.7, owner="enemy"))

    def _extra_behaviour(self, dt: float, game, dist: float,
                         damage: float) -> None:
        super()._extra_behaviour(dt, game, dist, damage)
        self.summon_cd -= dt
        if self.summon_cd <= 0:
            self.summon_cd = 5.5
            from zombie import create_zombie
            for _ in range(3):
                pos = game.spawner.spawn_position(self.pos, game.map)
                if pos is not None:
                    game.zombies.append(create_zombie(
                        "crawler", pos,
                        game.wave_manager.hp_mult,
                        game.wave_manager.speed_mult,
                        game.wave_manager.dmg_mult))
            game.audio.play("zombie_hit")
            game.toast("MINIONS SUMMONED!")

    def draw(self, surface: pygame.Surface, cam) -> None:
        super().draw(surface, cam)
        sp = cam.apply(self.pos)
        r = int(self.radius)
        pulse = 0.5 + 0.5 * math.sin(pygame.time.get_ticks() / 300)
        aura = pygame.Surface((r * 4, r * 4), pygame.SRCALPHA)
        pygame.draw.circle(aura, (170, 90, 220, int(60 + 40 * pulse)),
                           (r * 2, r * 2), r + 14)
        pygame.draw.circle(aura, (220, 150, 255, int(40 + 30 * pulse)),
                           (r * 2, r * 2), r + 8)
        surface.blit(aura, aura.get_rect(center=(int(sp.x), int(sp.y))))
        pygame.draw.circle(surface, (170, 90, 220),
                           (int(sp.x), int(sp.y)), int(self.radius) + 10, 2)


ZOMBIE_CLASSES: dict[str, type[Zombie]] = {
    "normal": NormalZombie,
    "fast": FastZombie,
    "tank": TankZombie,
    "exploder": ExploderZombie,
    "ranged": RangedZombie,
    "boss": BossZombie,
    "crawler": CrawlerZombie,
    "necromancer": NecromancerZombie,
    "necromancer_boss": NecromancerBossZombie,
}


def create_zombie(kind: str, pos: pygame.Vector2, hp_mult: float = 1.0,
                  speed_mult: float = 1.0, dmg_mult: float = 1.0) -> Zombie:
    cls = ZOMBIE_CLASSES.get(kind, NormalZombie)
    return cls(pos, hp_mult, speed_mult, dmg_mult)
