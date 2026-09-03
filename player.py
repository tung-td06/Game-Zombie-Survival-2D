"""Player: movement, aiming, shooting, XP/level, upgrades, damage."""
from __future__ import annotations

import math

import pygame

import settings as S
import weapon as wp_mod
from collision import move_circle
from sprite.sprite_cache import get_player_sprite
from weapon import WeaponManager
from utils import clamp as S_clamp


class Player:
    radius = S.PLAYER_RADIUS
    XP_BASE = S.XP_BASE_REQUIREMENT

    def __init__(self, pos: pygame.Vector2, unlocked: list[str] | None = None,
                 coins: int = 0, level: int = 1, xp: int = 0) -> None:
        self.pos = pygame.Vector2(pos)
        self.vel = pygame.Vector2(0, 0)
        self.angle = 0.0

        self.max_hp = S.PLAYER_BASE_MAX_HP
        self.hp = self.max_hp
        self.armor = 0.0
        self.base_speed = S.PLAYER_BASE_SPEED
        self.coins = int(coins)

        self.level = max(1, int(level))
        self.xp = int(xp)
        self.pending_levels = 0
        self.upgrade_levels: dict[str, int] = {}

        # Upgrade multipliers (stacked by UpgradeSystem).
        self.damage_mult = 1.0
        self.fire_rate_mult = 1.0     # cooldown is divided by this
        self.reload_mult = 1.0        # reload time multiplied by this
        self.speed_mult = 1.0
        self.crit_bonus = 0.0
        self.crit_mult_bonus = 0.0
        self.regen = 0.0
        self.magnet_mult = 1.0
        self.life_steal = 0.0
        self.pierce_bonus = 0
        self.skill_points = 0

        self.weapons = WeaponManager(unlocked or ["pistol"])

        self.flash_timer = 0.0
        self.invuln = 0.0
        self.walk_cycle = 0.0
        self.moving = False
        self.dead = False
        self.drone_angle = 0.0
        self.drone_cooldown = 0.0
        self.drone_damage = 18.0

    # ------------------------------------------------------------ helpers --
    @property
    def xp_needed(self) -> int:
        return self.XP_BASE * self.level

    @property
    def speed(self) -> float:
        return self.base_speed * self.speed_mult

    def heal(self, amount: float) -> None:
        self.hp = min(self.max_hp, self.hp + amount)

    def add_armor(self, amount: float) -> None:
        self.armor = min(100.0, self.armor + amount)

    # ------------------------------------------------------------- update --
    def update(self, dt: float, game) -> None:
        inp = game.input

        move = pygame.Vector2(
            (1 if inp.is_down("move_right") else 0) -
            (1 if inp.is_down("move_left") else 0),
            (1 if inp.is_down("move_down") else 0) -
            (1 if inp.is_down("move_up") else 0),
        )
        self.moving = move.length_squared() > 0
        if self.moving:
            move.normalize()
            rects = game.map.get_near(self.pos, self.radius + 4)
            move_circle(self.pos, move * self.speed * dt, self.radius, rects)
            self.pos.x = S_clamp(self.pos.x, self.radius,
                                 S.WORLD_WIDTH - self.radius)
            self.pos.y = S_clamp(self.pos.y, self.radius,
                                 S.WORLD_HEIGHT - self.radius)
            self.walk_cycle += dt * 10

        mouse_world = cam_aim(game)
        self.angle = math.atan2(mouse_world.y - self.pos.y,
                                mouse_world.x - self.pos.x)

        # Weapon switching. Routed through a single switchWeapon() entry
        # point so reload cancellation, validation and HUD feedback all
        # run through the same code path. Only listen during gameplay;
        # when paused / leveling up the parent loop has already returned
        # before reaching Player.update(), but we also gate by game.state
        # so an in-flight key event from the upgrade menu never leaks
        # into a switch on the first frame back in PLAYING.
        if getattr(game, "state", None) == "PLAYING":
            for slot in range(1, 6):
                action = f"weapon_{slot}"
                if inp.is_pressed(action) or inp.key_pressed(
                        pygame.K_1 + slot - 1):
                    self.switchWeapon(slot)
            if inp.key_pressed(pygame.K_q):     # Q to cycle weapon
                self.weapons.cycle()

        w = self.weapons.current
        want_fire = 1 in inp.mouse_down
        if inp.is_pressed("reload") or (
                want_fire and not w.reloading and w.ammo == 0 and w.reserve > 0):
            if w.start_reload(self.reload_mult):
                game.audio.play("reload")
        if want_fire and w.can_fire(want_fire or w.auto):
            self._fire(game)
        self.weapons.update(dt)

        self.flash_timer = max(0.0, self.flash_timer - dt)
        self.invuln = max(0.0, self.invuln - dt)
        if self.regen > 0 and not self.dead:
            self.heal(self.regen * dt)
        if self.moving and not self.dead:
            # Respect the `footstep_dust` setting so players can turn off
            # the moving dust puffs if they find them distracting. The
            # setting defaults to False (off) to avoid a swarm of bright
            # dots orbiting the player every 0.18s.
            _footstep_on = bool(
                (getattr(game, "save", None) is not None)
                and game.save.settings.get("footstep_dust", False)
            )
            if _footstep_on:
                self._dust_cd = getattr(self, "_dust_cd", 0.0) - dt
                if self._dust_cd <= 0:
                    self._dust_cd = 0.18
                    offset = pygame.Vector2(
                        math.cos(self.walk_cycle + math.pi) * 8,
                        math.sin(self.walk_cycle + math.pi) * 8)
                    game.particles.dust(self.pos + offset)
        self._drone_tick(dt, game)

    def _fire(self, game) -> None:
        from bullet import Bullet
        w = self.weapons.current
        muzzle = self.pos + pygame.Vector2(math.cos(self.angle),
                                           math.sin(self.angle)) * 24
        shots = w.fire(self.angle,
                       damage_mult=self.damage_mult,
                       crit_bonus=self.crit_bonus,
                       crit_mult_bonus=self.crit_mult_bonus)
        w.cooldown = w.fire_rate / max(0.01, self.fire_rate_mult)
        for spec in shots:
            radius = 6.0 if w.id in ("flamethrower",) else 4.0
            b = Bullet(muzzle.copy(), spec["angle"],
                       spec["speed"], spec["damage"],
                       owner="player", crit=spec["crit"], radius=radius)
            if w.id == "flamethrower":
                b.elem = "fire"
                b.lifetime = 0.55
            elif w.id == "plasma":
                b.elem = "plasma"
                b.radius = 7.0
            elif w.id == "crossbow":
                b.elem = "pierce"
            game.bullets.append(b)
        if w.id == "flamethrower":
            game.particles.burn_trail(muzzle, self.angle, 8)
            game.lighting.add_light(muzzle, 120, (255, 130, 60), 0.8)
        elif w.id == "plasma":
            game.particles.muzzle_flash(muzzle, self.angle)
            game.lighting.add_light(muzzle, 90, (170, 100, 255), 0.6)
        else:
            game.particles.muzzle_flash(muzzle, self.angle)
            game.lighting.add_light(muzzle, 70, (255, 220, 130), 0.4)
        game.shake_camera(1.5 if w.pellets == 1 else 4.0)
        game.stats["shots_by_weapon"][w.id] = \
            game.stats["shots_by_weapon"].get(w.id, 0) + 1
        sound_map = {
            "shotgun": "shotgun", "sniper": "sniper",
            "smg": "smg", "rifle": "rifle",
            "flamethrower": "shoot", "plasma": "rifle",
            "crossbow": "sniper",
        }
        game.audio.play(sound_map.get(w.id, "shoot"))

    # ----------------------------------------------------------- switch ----
    def switchWeapon(self, slot: int) -> bool:
        """Public entry point for weapon switching.

        1 <= slot <= 5. Locked / out-of-range slots fall back silently
        to the current weapon so pressing a wrong key never crashes and
        never deselects the active gun. Cancel any in-progress reload
        on the previous weapon so ammo doesn't bleed into the new one.
        """
        try:
            slot_i = int(slot)
        except (TypeError, ValueError):
            return False
        if not (1 <= slot_i <= 5):
            return False
        changed = self.weapons.switch_weapon(slot_i)
        # After switch: only the new weapon's cooldown is ticked by
        # update(), so a stale cooldown on the old weapon is harmless
        # — but we still clear it so the old gun is "fresh" when the
        # player comes back to it.
        if changed:
            old_ids = [wid for wid in self.weapons.unlocked_in_order()
                       if wid != self.weapons.current_id]
            for wid in old_ids:
                wp = self.weapons.weapons.get(wid)
                if wp is not None:
                    wp.cooldown = 0.0
            w = self.weapons.current
            if w.ammo > 0:
                w.cooldown = 0.0
        return changed

    # ------------------------------------------------------------- combat --
    def take_damage(self, amount: float, game) -> None:
        if self.invuln > 0 or self.dead:
            return
        absorbed = min(self.armor, amount)
        self.armor -= absorbed
        hp_loss = amount - absorbed
        self.hp -= hp_loss
        self.flash_timer = 0.25
        self.invuln = 0.15
        game.particles.blood(self.pos, 6)
        game.particles.damage_number(self.pos, hp_loss + absorbed, False)
        game.shake_camera(min(10, 2 + amount * 0.15))
        game.audio.play("player_hit")
        if self.hp <= 0:
            self.hp = 0
            self.dead = True

    def add_xp(self, amount: int, game) -> None:
        self.xp += amount
        while self.xp >= self.xp_needed:
            self.xp -= self.xp_needed
            self.level += 1
            self.pending_levels += 1
            self.skill_points += 1
            game.on_level_up()
        game.save.data["player_level"] = self.level
        game.save.data["xp"] = self.xp

    # ----------------------------------------------------------- drone ----
    def _drone_tick(self, dt: float, game) -> None:
        self.drone_angle += dt * 1.6
        self.drone_cooldown -= dt
        if self.drone_cooldown > 0:
            return
        for z in game.zombies:
            if z.pos.distance_to(self.pos) < 280:
                from bullet import Bullet
                muzzle = self.pos + pygame.Vector2(
                    math.cos(self.drone_angle + math.pi),
                    math.sin(self.drone_angle + math.pi)) * 36
                angle = math.atan2(z.pos.y - muzzle.y,
                                   z.pos.x - muzzle.x)
                game.bullets.append(Bullet(muzzle, angle, 1200,
                                           self.drone_damage,
                                           owner="player"))
                game.particles.muzzle_flash(muzzle, angle)
                self.drone_cooldown = 0.55
                break

    # --------------------------------------------------------------- draw --
    def draw(self, surface: pygame.Surface, cam) -> None:
        sp = cam.apply(self.pos)
        bob = math.sin(self.walk_cycle) * 1.5 if self.moving else 0
        frame = int(self.walk_cycle) % 4 if self.moving else 0
        sprite = get_player_sprite(frame)
        flash = (self.flash_timer > 0
                 and int(self.flash_timer * 20) % 2 == 0)
        if flash:
            tinted = sprite.copy()
            white = pygame.Surface(tinted.get_size(), pygame.SRCALPHA)
            white.fill((255, 255, 255, 110))
            tinted.blit(white, (0, 0))
            sprite = tinted
        rotated = pygame.transform.rotate(sprite, -math.degrees(self.angle))
        rect = rotated.get_rect(center=(int(sp.x), int(sp.y) - int(bob)))
        surface.blit(rotated, rect)

        if self.invuln > 0 and int(self.invuln * 20) % 2 == 0:
            ring = pygame.Surface((self.radius * 4, self.radius * 4),
                                  pygame.SRCALPHA)
            pygame.draw.circle(ring, (180, 220, 255, 160),
                               (self.radius * 2, self.radius * 2),
                               self.radius + 4, 2)
            surface.blit(ring, ring.get_rect(center=(int(sp.x), int(sp.y))))

        if self.armor > 0:
            ax = sp.x + math.cos(self.angle) * 18
            ay = sp.y + math.sin(self.angle) * 18 - 18
            pygame.draw.circle(surface, (90, 180, 255), (int(ax), int(ay)), 6)
            pygame.draw.circle(surface, (220, 240, 255), (int(ax), int(ay)), 3)

        drone_x = sp.x + math.cos(self.drone_angle) * 38
        drone_y = sp.y + math.sin(self.drone_angle) * 38 - 16
        pygame.draw.circle(surface, (60, 60, 70), (int(drone_x), int(drone_y)),
                           9, 2)
        pygame.draw.circle(surface, (140, 220, 255), (int(drone_x), int(drone_y)),
                           6)
        pygame.draw.circle(surface, (220, 240, 255), (int(drone_x - 2),
                                                       int(drone_y - 2)), 2)


def cam_aim(game) -> pygame.Vector2:
    """Mouse position converted to world coordinates."""
    return game.camera.screen_to_world(pygame.mouse.get_pos())
