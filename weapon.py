"""Data-driven weapons (stats from data/weapons.json) + WeaponManager."""
from __future__ import annotations

import math
import random

import pygame

import settings as S
from utils import load_json

WEAPON_DATA: dict[str, dict] = load_json(S.WEAPONS_FILE, {
    "pistol": {"name": "PISTOL", "damage": 25, "magazine": 12, "fire_rate": 0.3,
               "reload_time": 1.2, "bullet_speed": 1000, "spread_deg": 2.5,
               "pellets": 1, "critical_chance": 0.10, "critical_multiplier": 2.0,
               "auto": False, "price": 0, "start_reserve": 96},
})
WEAPON_ORDER = ["pistol", "shotgun", "smg", "rifle", "sniper",
                 "flamethrower", "plasma", "crossbow"]


class Weapon:
    """Runtime weapon instance: holds ammo state for one weapon type."""

    def __init__(self, weapon_id: str) -> None:
        self.id = weapon_id
        data = WEAPON_DATA.get(weapon_id)
        if data is None:                       # fallback: clone pistol
            data = dict(WEAPON_DATA["pistol"])
            self.id = "pistol"
        self.name: str = data.get("name", weapon_id.upper())
        self.damage: float = float(data.get("damage", 25))
        self.magazine_size: int = int(data.get("magazine", 12))
        self.fire_rate: float = float(data.get("fire_rate", 0.3))
        self.reload_time: float = float(data.get("reload_time", 1.2))
        self.bullet_speed: float = float(data.get("bullet_speed", 1000))
        self.spread_deg: float = float(data.get("spread_deg", 3))
        self.pellets: int = int(data.get("pellets", 1))
        self.critical_chance: float = float(data.get("critical_chance", 0.1))
        self.critical_multiplier: float = float(data.get("critical_multiplier", 2))
        self.auto: bool = bool(data.get("auto", False))
        self.price: int = int(data.get("price", 0))

        self.ammo = self.magazine_size
        self.reserve: int = int(data.get("start_reserve", 48))
        self.cooldown = 0.0
        self.reloading = False
        self.reload_timer = 0.0
        self.reload_total = self.reload_time

    # -------------------------------------------------------------- combat -
    def can_fire(self, want_held_down: bool) -> bool:
        if not want_held_down and not self.auto:
            return False
        return (self.cooldown <= 0 and not self.reloading
                and self.ammo > 0)

    def fire(self, base_angle: float, damage_mult: float = 1.0,
             crit_bonus: float = 0.0, crit_mult_bonus: float = 0.0
             ) -> list[dict]:
        """Fire one shot; returns bullet specs (angle, damage, crit)."""
        self.ammo -= 1
        self.cooldown = self.fire_rate
        shots: list[dict] = []
        for _ in range(max(1, self.pellets)):
            angle = base_angle + math.radians(
                random.uniform(-self.spread_deg, self.spread_deg))
            crit = random.random() < min(0.9, self.critical_chance + crit_bonus)
            mult = self.critical_multiplier + crit_mult_bonus if crit else 1.0
            shots.append({
                "angle": angle,
                "damage": self.damage * damage_mult * mult,
                "crit": crit,
                "speed": self.bullet_speed,
            })
        return shots

    def start_reload(self, mult: float = 1.0) -> bool:
        if self.reloading or self.ammo >= self.magazine_size or self.reserve <= 0:
            return False
        self.reloading = True
        self.reload_total = self.reload_time * mult
        self.reload_timer = self.reload_total
        return True

    def update(self, dt: float) -> None:
        self.cooldown = max(0.0, self.cooldown - dt)
        if self.reloading:
            self.reload_timer -= dt
            if self.reload_timer <= 0:
                need = self.magazine_size - self.ammo
                take = min(need, self.reserve)
                self.ammo += take
                self.reserve -= take
                self.reloading = False

    def add_reserve(self, amount: int) -> None:
        self.reserve += max(0, int(amount))


class WeaponManager:
    """Owns the player's unlocked weapons and the active selection."""

    def __init__(self, unlocked_ids: list[str] | None = None) -> None:
        self.weapons: dict[str, Weapon] = {}
        for wid in unlocked_ids or ["pistol"]:
            self.give(wid)
        if not self.weapons:
            self.give("pistol")
        self.current_id = next(iter(self.weapons))
        # Optional callback: host game sets this to receive switch events
        # (slot_index, weapon_id) for HUD feedback. Keeping it on the
        # manager avoids a back-reference cycle into Player.
        self.switch_notify = None

    def give(self, weapon_id: str) -> bool:
        """Add a new weapon type. Returns True if it was newly added."""
        if weapon_id in self.weapons:
            return False
        self.weapons[weapon_id] = Weapon(weapon_id)
        return True

    @property
    def current(self) -> Weapon:
        return self.weapons[self.current_id]

    def unlocked_in_order(self) -> list[str]:
        """Weapon ids unlocked by the player, in canonical display order."""
        return [w for w in WEAPON_ORDER if w in self.weapons]

    def select_slot(self, slot: int) -> bool:
        """Legacy alias kept for backwards compatibility."""
        return self.switch_weapon(slot, announce=False)

    def switch_weapon(self, slot: int, announce: bool = True) -> bool:
        """Switch active weapon by 1..5 slot index.

        Validates the slot, falls back gracefully when the slot is locked,
        cancels any in-progress reload so the new weapon starts clean, and
        notifies the host game (via ``switch_notify``) so it can show a
        short feedback banner. Returns True iff the active weapon changed.
        """
        if not isinstance(slot, int):
            return False
        ids = self.unlocked_in_order()
        if not (1 <= slot <= len(ids)):
            return False  # slot locked / out of range → keep current weapon
        new_id = ids[slot - 1]
        old_id = self.current_id
        if new_id == old_id:
            # Same weapon pressed again: still cancel a stale reload so
            # the magazine state stays consistent.
            cur = self.current
            if cur.reloading:
                cur.reloading = False
                cur.reload_timer = 0.0
            return False
        # Cancel reload on the OLD weapon so we don't carry its timer over
        # into the new one and so ammo doesn't get applied to the wrong gun.
        old = self.weapons.get(old_id)
        if old is not None and old.reloading:
            old.reloading = False
            old.reload_timer = 0.0
        # Defensive: also clear any stale reload on weapons the player
        # is *not* currently holding — prevents the previous weapon
        # from sneaking its reload-completion into the new weapon's ammo.
        for wid, wp in self.weapons.items():
            if wid != new_id and wp.reloading:
                wp.reloading = False
                wp.reload_timer = 0.0
        self.current_id = new_id
        if announce and self.switch_notify is not None:
            try:
                self.switch_notify(new_id, slot)
            except Exception:
                pass
        return True

    def cycle(self, direction: int = 1) -> None:
        ids = self.unlocked_in_order()
        if not ids:
            return
        idx = ids.index(self.current_id)
        self.switch_weapon(((idx + direction) % len(ids)) + 1)

    def update(self, dt: float) -> None:
        self.current.update(dt)

    def draw_muzzle_hint(self) -> None:  # kept for API symmetry / future use
        pass
