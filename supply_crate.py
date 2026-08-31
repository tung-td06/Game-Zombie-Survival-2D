"""Supply Crates — world-placed loot containers requiring player interaction.

These are distinct from the auto-magnet ``Loot`` pickups in ``loot.py``:

* ``SupplyCrate`` is a real world object at a fixed (x, y) position.
* Player must press ``E`` (the existing ``interact`` action) to open it.
* On open the crate's pre-rolled contents are applied (ammo / HP / armor /
  weapon / mixed), the crate is marked dead and disappears.

The class deliberately reuses the existing systems (WeaponManager, Player,
ParticleSystem.float_text, AudioManager, Map.random_free_point) — no new
loops, no global state, no second renderer.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import pygame

if TYPE_CHECKING:
    pass


# ----------------------------------------------------------------- contents --
@dataclass
class SupplyContents:
    """What a crate will give when opened.

    ``kind`` is the broad class ('ammo' | 'health' | 'armor' | 'weapon' |
    'mixed'); the numeric fields are applied when the crate is opened.
    ``weapon_id`` is only used when kind == 'weapon'.
    """
    kind: str
    amount: int = 0
    weapon_id: str | None = None
    extras: list[tuple[str, int]] = field(default_factory=list)


# ----------------------------------------------------------------- crate ---
class SupplyCrate:
    """A stationary world object the player can open by pressing E."""

    RADIUS = 18.0          # collision / proximity
    INTERACT_RANGE = 46.0  # player must be inside this to open

    # Visual outline colour per kind.
    KIND_COLORS = {
        "ammo":   (220, 220, 230),
        "health": (220, 80, 90),
        "armor":  (110, 200, 255),
        "weapon": (255, 140, 220),
        "mixed":  (220, 180, 80),
    }

    # Per-kind label that shows in the proximity hint.
    KIND_LABELS = {
        "ammo":   "AMMO CRATE",
        "health": "MEDICAL CRATE",
        "armor":  "ARMOR CRATE",
        "weapon": "WEAPON CRATE",
        "mixed":  "SUPPLY CRATE",
    }

    def __init__(self, pos: pygame.Vector2, contents: SupplyContents,
                 rng: random.Random | None = None) -> None:
        self.pos = pygame.Vector2(pos)
        self.contents = contents
        self.kind = contents.kind
        self.dead = False
        self.age = 0.0
        self._rng = rng or random.Random()

    # -------------------------------------------------------------- query --
    def contains_point(self, pos: pygame.Vector2, pad: float = 0.0) -> bool:
        return self.pos.distance_to(pos) <= self.RADIUS + pad

    def in_interact_range(self, player) -> bool:
        return self.pos.distance_to(player.pos) <= self.INTERACT_RANGE

    # -------------------------------------------------------------- update --
    def update(self, dt: float, game) -> None:
        """Crate is stationary. Only the age tick is needed for the idle
        bob / glow animation. Interaction is handled by the manager."""
        self.age += dt

    # ---------------------------------------------------------- interaction --
    def try_open(self, game) -> bool:
        """Open the crate (apply contents + mark dead). Returns True if
        the crate was actually opened this call."""
        if self.dead:
            return False
        if not self.in_interact_range(game.player):
            return False
        self._apply_contents(game)
        self.dead = True
        return True

    def _apply_contents(self, game) -> None:
        """Hand the contents to the player via existing systems."""
        from weapon import WEAPON_ORDER

        p = game.player
        kind = self.contents.kind
        amt = self.contents.amount
        particles = game.particles
        audio = game.audio

        if kind == "ammo":
            # Fill reserve for every weapon the player owns; primary weapon
            # gets the bulk. The existing ``Weapon.add_reserve`` is reused.
            primary_share = int(amt * 0.6)
            per_other = max(1, (amt - primary_share)
                            // max(1, len(p.weapons.weapons) - 1))
            primary = p.weapons.current
            primary.add_reserve(primary_share)
            for wid, w in p.weapons.weapons.items():
                if wid != primary.id:
                    w.add_reserve(per_other)
            particles.float_text(self.pos, f"+{amt} AMMO",
                                 (220, 220, 230))
            audio.play("pickup")

        elif kind == "health":
            actual = min(amt, int(p.max_hp - p.hp))
            p.heal(amt)
            particles.float_text(self.pos, f"+{actual} HP",
                                 S_color_green())
            audio.play("pickup")

        elif kind == "armor":
            cap = 100.0
            before = p.armor
            p.add_armor(amt)
            actual = max(0, int(p.armor - before))
            particles.float_text(self.pos, f"+{actual} ARMOR",
                                 S_color_blue())
            audio.play("pickup")

        elif kind == "weapon":
            # Pick the first weapon the player doesn't already own; if
            # they have everything, fall back to ammo refill for current.
            wid = self.contents.weapon_id
            if wid is None:
                for cand in WEAPON_ORDER:
                    if cand not in p.weapons.weapons:
                        wid = cand
                        break
            if wid and p.weapons.give(wid):
                p.weapons.current_id = wid
                from weapon import WEAPON_DATA
                wname = WEAPON_DATA.get(wid, {}).get("name", wid.upper())
                particles.float_text(self.pos, f"+{wname}",
                                     (255, 140, 220))
                audio.play("pickup")
            else:
                # Already owned → convert into ammo refill.
                p.weapons.current.add_reserve(int(
                    p.weapons.current.magazine_size * 4))
                particles.float_text(self.pos, "AMMO PACK",
                                     (220, 220, 230))
                audio.play("pickup")

        elif kind == "mixed":
            # Apply the rolled extras one by one (each gets its own
            # feedback so the player can see what they got).
            for sub_kind, sub_amount in self.contents.extras:
                self._apply_single(game, sub_kind, sub_amount,
                                   show_label=False)
            # Plus a header feedback.
            particles.float_text(self.pos, "SUPPLY",
                                 (220, 180, 80))
            audio.play("pickup")

        # Visual feedback for opening — small burst, no screen shake.
        particles.explosion(self.pos, big=False)
        audio.play("pickup")

    def _apply_single(self, game, kind: str, amount: int,
                      show_label: bool = True) -> None:
        """Helper used by the 'mixed' crate to roll individual items."""
        from weapon import WEAPON_DATA
        p = game.player
        particles = game.particles
        audio = game.audio

        if kind == "ammo":
            p.weapons.current.add_reserve(amount)
            if show_label:
                particles.float_text(self.pos + pygame.Vector2(0, -16),
                                     f"+{amount} AMMO",
                                     (220, 220, 230))
        elif kind == "health":
            p.heal(amount)
            if show_label:
                particles.float_text(
                    self.pos + pygame.Vector2(0, -16),
                    f"+{amount} HP", S_color_green())
        elif kind == "armor":
            p.add_armor(amount)
            if show_label:
                particles.float_text(
                    self.pos + pygame.Vector2(0, -16),
                    f"+{amount} ARMOR", S_color_blue())
        elif kind == "weapon":
            if p.weapons.give(amount):
                p.weapons.current_id = amount
                if show_label:
                    wname = WEAPON_DATA.get(amount, {}).get(
                        "name", amount.upper())
                    particles.float_text(
                        self.pos + pygame.Vector2(0, -16),
                        f"+{wname}", (255, 140, 220))

    # --------------------------------------------------------------- draw --
    def draw(self, surface: pygame.Surface, cam,
             nearby: bool = False) -> None:
        from sprite.sprite_cache import get_supply_crate_sprite
        sprite = get_supply_crate_sprite(self.kind)
        # Idle bob: tiny up-down movement.
        phase = (self.age * 1.6) % 6.283
        bob = -2 + 2 * abs(((phase / 6.283) * 2) - 1)
        sp = cam.apply(self.pos + pygame.Vector2(0, bob))

        # Soft glow under the crate — radius grows slightly when player
        # is nearby so the crate visibly "wakes up".
        glow_r = 26 + (6 if nearby else 0)
        glow = pygame.Surface((glow_r * 2, glow_r * 2), pygame.SRCALPHA)
        color = self.KIND_COLORS.get(self.kind, (200, 200, 200))
        pygame.draw.circle(glow, (*color, 70),
                           (glow_r, glow_r), glow_r)
        pygame.draw.circle(glow, (*color, 40),
                           (glow_r, glow_r), glow_r - 4)
        surface.blit(glow, (int(sp.x) - glow_r, int(sp.y) - glow_r))

        # Drop shadow first (offset down/right) then sprite on top.
        shadow = pygame.Surface(sprite.get_size(), pygame.SRCALPHA)
        pygame.draw.ellipse(shadow, (0, 0, 0, 110),
                            (4, sprite.get_height() - 10,
                             sprite.get_width() - 8, 8))
        surface.blit(shadow, (int(sp.x) - sprite.get_width() // 2,
                              int(sp.y) - sprite.get_height() // 2))
        surface.blit(sprite,
                     sprite.get_rect(center=(int(sp.x), int(sp.y))))

        # Subtle outline pulse when player is nearby.
        if nearby:
            outline = pygame.Surface(
                (sprite.get_width() + 6, sprite.get_height() + 6),
                pygame.SRCALPHA)
            r = pygame.Rect(0, 0, outline.get_width(),
                            outline.get_height())
            pygame.draw.rect(outline, (*color, 180),
                             r, 2, border_radius=6)
            surface.blit(outline, (int(sp.x) - outline.get_width() // 2,
                                   int(sp.y) - outline.get_height() // 2))


# ----------------------------------------------------------- helpers -----
def S_color_green():
    import settings as S
    return S.color("ui_green")


def S_color_blue():
    import settings as S
    return S.color("ui_blue")


# ----------------------------------------------------------- manager -----
class SupplyCrateManager:
    """Owns the list of active crates in a run.

    * Spawns N crates around the player at run start.
    * Re-spawns after each wave-complete via ``on_wave_complete``.
    * Caps total live crates so the map never floods.
    * Reuses ``map.random_free_point`` so spawns never land in walls.
    """

    MAX_CRATES = 6
    START_COUNT_RANGE = (2, 4)
    POST_WAVE_COUNT_RANGE = (1, 2)
    POST_WAVE_CHANCE = 0.55       # chance to spawn extras per wave clear

    def __init__(self, game_map) -> None:
        self.crates: list[SupplyCrate] = []
        self._map = game_map
        self._rng = random.Random()

    # ----------------------------------------------------------- spawn --
    def spawn_initial(self, count_range: tuple[int, int] | None = None,
                      around: pygame.Vector2 | None = None,
                      away_from: pygame.Vector2 | None = None,
                      min_dist: float = 220.0,
                      max_dist: float = 700.0) -> list[SupplyCrate]:
        n_lo, n_hi = count_range or self.START_COUNT_RANGE
        return self._spawn_n(
            self._rng.randint(n_lo, n_hi), around=around,
            away_from=away_from, min_dist=min_dist, max_dist=max_dist)

    def spawn_post_wave(self, around: pygame.Vector2,
                        player) -> list[SupplyCrate]:
        if self._rng.random() > self.POST_WAVE_CHANCE:
            return []
        if len(self.crates) >= self.MAX_CRATES:
            return []
        n_lo, n_hi = self.POST_WAVE_COUNT_RANGE
        return self._spawn_n(
            self._rng.randint(n_lo, n_hi), around=around,
            away_from=player.pos, min_dist=180.0, max_dist=650.0)

    def _spawn_n(self, n: int, *, around: pygame.Vector2 | None = None,
                 away_from: pygame.Vector2 | None = None,
                 min_dist: float = 200.0,
                 max_dist: float = 700.0
                 ) -> list[SupplyCrate]:
        spawned: list[SupplyCrate] = []
        attempts = 0
        while len(spawned) < n and len(self.crates) < self.MAX_CRATES \
                and attempts < 80:
            attempts += 1
            pos = self._map.random_free_point(
                self._rng, min_dist=min_dist, max_dist=max_dist,
                away_from=away_from, radius=22.0, tries=40)
            if pos is None:
                continue
            # Avoid stacking on existing crates.
            if any(c.pos.distance_to(pos) < 80 for c in self.crates):
                continue
            contents = self._roll_contents(self._rng)
            crate = SupplyCrate(pos, contents, self._rng)
            self.crates.append(crate)
            spawned.append(crate)
        return spawned

    @staticmethod
    def _roll_contents(rng: random.Random) -> SupplyContents:
        """Roll a single crate's contents.

        Weight table:
            ammo   35
            health 20
            armor  15
            mixed  18
            weapon 12
        """
        roll = rng.random() * 100
        if roll < 35:
            return SupplyContents(
                kind="ammo",
                amount=rng.randint(18, 36))
        if roll < 55:
            return SupplyContents(
                kind="health",
                amount=rng.randint(20, 35))
        if roll < 70:
            return SupplyContents(
                kind="armor",
                amount=rng.randint(15, 28))
        if roll < 88:
            return SupplyContents(
                kind="mixed",
                extras=SupplyCrateManager._roll_mixed_extras(rng))
        # Weapon (rare).
        from weapon import WEAPON_ORDER
        wid = rng.choice(WEAPON_ORDER)
        return SupplyContents(kind="weapon", weapon_id=wid)

    @staticmethod
    def _roll_mixed_extras(rng: random.Random
                           ) -> list[tuple[str, int]]:
        n = rng.randint(1, 3)
        out: list[tuple[str, int]] = []
        for _ in range(n):
            r = rng.random()
            if r < 0.5:
                out.append(("ammo", rng.randint(10, 22)))
            elif r < 0.8:
                out.append(("health", rng.randint(10, 22)))
            else:
                out.append(("armor", rng.randint(8, 16)))
        return out

    # --------------------------------------------------------- lifecycle --
    def update(self, dt: float, game) -> None:
        for c in self.crates:
            c.update(dt, game)
        self.crates = [c for c in self.crates if not c.dead]

    def clear(self) -> None:
        """Wipe all crates (new run / game over)."""
        self.crates.clear()

    # ---------------------------------------------------- interaction --
    def handle_interact(self, game) -> bool:
        """Open the nearest crate inside interaction range, if any.

        Returns True if a crate was opened this frame.
        """
        if not game.input.is_pressed("interact"):
            return False
        p = game.player
        target: SupplyCrate | None = None
        best_d = float("inf")
        for c in self.crates:
            if c.dead:
                continue
            d = c.pos.distance_squared_to(p.pos)
            if d < best_d and d <= (c.INTERACT_RANGE + 1) ** 2:
                best_d = d
                target = c
        if target is None:
            return False
        return target.try_open(game)

    def nearest_in_range(self, player) -> SupplyCrate | None:
        """Crate inside interaction range, if any — used for the [E] hint."""
        best: SupplyCrate | None = None
        best_d = float("inf")
        for c in self.crates:
            if c.dead:
                continue
            d = c.pos.distance_squared_to(player.pos)
            if d < best_d and d <= (c.INTERACT_RANGE + 1) ** 2:
                best_d = d
                best = c
        return best