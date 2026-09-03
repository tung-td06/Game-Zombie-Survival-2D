"""WaveManager: wave progression, difficulty scaling, boss waves, biomes,
and rotating wave modifiers (Blood Moon, Swarm, Frenzy, Fog)."""
from __future__ import annotations

import random

import pygame

import settings as S
from loot import Loot
from zombie import create_zombie


class WaveManager:
    """States: 'intermission' -> 'active' -> complete -> intermission...

    Difficulty scales per wave: count, HP, speed, damage, spawn rate.
    Every BOSS_EVERY_N_WAVES a boss joins the wave. Every MODIFIER_PER_WAVE
    a global modifier is rolled (announced at wave start). Biomes rotate
    in a 4-step cycle.
    """

    def __init__(self) -> None:
        self.wave = 0
        self.state = "intermission"          # 'intermission' | 'active'
        self.timer = 3.0                     # seconds until next phase
        self.to_spawn = 0
        self.spawned_this_wave = 0
        self.spawn_timer = 0.0
        self.spawn_interval = 1.5
        self.hp_mult = 1.0
        self.speed_mult = 1.0
        self.dmg_mult = 1.0
        self.boss_alive = False
        self.boss_spawned_this_wave = False
        self.modifier = "none"
        self.biome = "city"
        # External listeners (set by Game if it cares about wave events).
        self.on_wave_complete = None     # callable(game) -> None

    # ------------------------------------------------------------ scaling --
    @property
    def wave_size(self) -> int:
        base = S.BASE_WAVE_SIZE + max(0, self.wave - 1) * S.WAVE_SIZE_GROWTH
        if self.modifier == "swarm":
            return int(base * 1.7)
        return base

    def _apply_scaling(self) -> None:
        w = max(0, self.wave - 1)
        self.hp_mult = 1.0 + S.HP_GROWTH_PER_WAVE * w
        self.speed_mult = 1.0 + S.SPEED_GROWTH_PER_WAVE * w
        self.dmg_mult = 1.0 + S.DAMAGE_GROWTH_PER_WAVE * w
        if self.modifier == "frenzy":
            self.speed_mult *= 1.35
        if self.modifier == "blood_moon":
            self.hp_mult *= 1.4
            self.dmg_mult *= 1.25
        self.spawn_interval = max(0.18, 1.5 - self.wave * 0.08)
        if self.modifier == "swarm":
            self.spawn_interval *= 0.55

    @property
    def current_biome(self) -> str:
        return S.BIOMES[(self.wave // 5) % len(S.BIOMES)]

    def _roll_modifier(self) -> str:
        opts = ["blood_moon", "swarm", "frenzy", "fog", "none", "none"]
        return random.choice(opts)

    # ------------------------------------------------------------- update --
    def update(self, dt: float, game) -> None:
        if self.state == "intermission":
            self.timer -= dt
            if self.timer <= 0:
                self._start_next_wave(game)
        else:
            self._update_active(dt, game)

    def _start_next_wave(self, game) -> None:
        self.wave += 1
        self.state = "active"
        self.biome = self.current_biome
        if self.wave > 1 and self.wave % S.MODIFIER_PER_WAVE == 0:
            self.modifier = self._roll_modifier()
        else:
            self.modifier = "none"
        self._apply_scaling()
        self.to_spawn = self.wave_size
        self.spawned_this_wave = 0
        self.spawn_timer = 0.5
        self.boss_alive = False
        self.boss_spawned_this_wave = False
        boss = self.is_boss_wave
        text = f"WAVE {self.wave}"
        if self.modifier != "none":
            text += f"  -  {self.modifier.upper().replace('_', ' ')}"
        game.wave_announce(text, boss=boss)
        if hasattr(game, "active_modifier"):
            game.active_modifier = self.modifier
        if self.modifier == "blood_moon":
            game.toast("BLOOD MOON: +40% HP, +25% DMG")
        elif self.modifier == "swarm":
            game.toast("SWARM: more zombies, faster spawns")
        elif self.modifier == "frenzy":
            game.toast("FRENZY: zombies move much faster")
        elif self.modifier == "fog":
            game.toast("HEAVY FOG: vision reduced")

    @property
    def is_boss_wave(self) -> bool:
        return self.wave > 0 and self.wave % S.BOSS_EVERY_N_WAVES == 0

    def _update_active(self, dt: float, game) -> None:
        night_mult = 1.0 + (S.NIGHT_SPAWN_MULT - 1.0) * game.night_factor
        self.spawn_timer -= dt * night_mult

        alive_ok = len(game.zombies) < S.MAX_ALIVE_ZOMBIES
        spawn_attempts = 0
        while self.spawn_timer <= 0 and self.to_spawn > 0 \
                and alive_ok and spawn_attempts < 20:
            spawn_attempts += 1
            kind = game.spawner.pick_type(self.wave, self.modifier)
            pos = game.spawner.spawn_position(game.player.pos, game.map)
            if pos is not None:
                game.zombies.append(create_zombie(
                    kind, pos, self.hp_mult, self.speed_mult, self.dmg_mult))
                self.to_spawn -= 1
                self.spawned_this_wave += 1
                self.spawn_timer += self.spawn_interval
            else:
                self.spawn_timer += 0.4

        if self.is_boss_wave and not self.boss_spawned_this_wave and \
                len(game.zombies) < S.MAX_ALIVE_ZOMBIES:
            boss_kind = "boss"
            if self.wave >= 15:
                boss_kind = "necromancer_boss"
            from zombie import ZOMBIE_DATA
            boss_radius = float(ZOMBIE_DATA.get(boss_kind, {}).get("radius", 42.0))
            pos = game.spawner.spawn_position(game.player.pos, game.map, boss_radius)
            if pos is not None:
                game.zombies.append(create_zombie(
                    boss_kind, pos, self.hp_mult, self.speed_mult, self.dmg_mult))
                self.boss_alive = True
                self.boss_spawned_this_wave = True
                game.audio.play("boss_roar")
                if boss_kind == "boss":
                    game.toast("!! THE ABOMINATION HAS AWAKENED !!")
                else:
                    game.toast("!! NECROMANCER RISES FROM THE DEAD !!")

        if self.to_spawn == 0 and not game.zombies:
            reward_coins = 50 + self.wave * 15
            reward_xp = 40 + self.wave * 20
            if self.is_boss_wave:
                reward_coins += 300
                reward_xp += 200
                game.loots.append(Loot(game.player.pos + pygame.Vector2(0, -40),
                                       "chest"))
            game.player.coins += reward_coins
            game.player.add_xp(reward_xp, game)
            game.toast(f"WAVE {self.wave} COMPLETE!  +${reward_coins}")
            # Fire the external wave-complete hook (used by Game to
            # spawn supply crates, etc.). The Game owns the callback.
            if self.on_wave_complete is not None:
                try:
                    self.on_wave_complete(game)
                except Exception as exc:
                    print(f"on_wave_complete hook raised: {exc}")
            self.state = "intermission"
            self.timer = S.WAVE_INTERMISSION
