"""Game orchestrator: state machine, world update, rendering, day/night."""
from __future__ import annotations

import math
import random

import pygame

import settings as S
from achievement import AchievementSystem
from audio import AudioManager
from camera import Camera
from input_manager import InputManager
from level_transition import (
    APPLYING_UPGRADE,
    GAMEPLAY,
    LEVEL_UP,
    STARTING_NEXT_LEVEL,
    LevelTransitionManager,
)
from lighting import LightingSystem
from loot import Loot, drops_for
from map import GameMap
from menu import MenuSystem
from particle import ParticleSystem
from player import Player
from quest import QuestSystem
from save_manager import SaveManager
from shop import Shop
from spawner import ZombieSpawner
from supply_crate import SupplyCrateManager
from ui import draw_crosshair, draw_hud, draw_minimap, draw_text, draw_toasts, get_font
from upgrade import UpgradeSystem
from wave_manager import WaveManager

MENU = "MENU"
PLAYING = "PLAYING"
PAUSED = "PAUSED"
SHOP = "SHOP"
UPGRADE = "UPGRADE"
UPGRADE_INFO = "UPGRADE_INFO"
SKILL_TREE = "SKILL_TREE"
SETTINGS = "SETTINGS"
GAME_OVER = "GAME_OVER"


class Game:
    """Owns every system; run() is the main loop."""

    def __init__(self, screen: pygame.Surface) -> None:
        self.screen = screen
        self.clock = pygame.time.Clock()
        self.dt = 0.0
        self.running = True
        self.state = MENU
        self.return_state = MENU
        self.in_run_context = False

        self.input = InputManager()
        self.save = SaveManager()
        self.audio = AudioManager()
        st = self.save.settings
        self.audio.load(st["master_volume"], st["music_volume"],
                        st["sfx_volume"])
        self.menus = MenuSystem()
        self.menus.set_profile(self.save.high_score, self.save.total_kills)
        # Apply saved resolution/fullscreen before anything renders.
        idx = int(self.save.settings.get("resolution_index", 0))
        if 0 <= idx < len(S.RESOLUTIONS):
            S.SCREEN_WIDTH, S.SCREEN_HEIGHT = S.RESOLUTIONS[idx]
        self.apply_display()

        # Pause Menu sub-view: 'menu' | 'settings' | 'controls' | 'leave'.
        # PAUSED itself is the only game state — sub-views are UI-only and
        # never change which systems are frozen.
        self.pause_view: str = "menu"

        self.shop = Shop()
        self.upgrades = UpgradeSystem()
        self.level_transition = LevelTransitionManager(self.upgrades)
        self.lighting = LightingSystem()
        # supply_crates is created per-run in new_run() once the map exists.
        self.supply_crates: SupplyCrateManager | None = None

        # Per-run systems (built in new_run()).
        self.player: Player | None = None
        self.map: GameMap | None = None
        self.camera = Camera(*self.screen.get_size())
        self.spawner = ZombieSpawner()
        self.wave_manager = WaveManager()
        self.particles = ParticleSystem()
        # ParticleSystem reads `damage_numbers` / `hit_effects` from settings
        # when present. Default is "all on" so behaviour is unchanged for
        # players who never touch the toggle.
        self.particles.settings = self.save.settings
        self.quests = QuestSystem()
        self.achievements = AchievementSystem(list(self.save.achievements))

        self.zombies: list = []
        self.bullets: list = []
        self.enemy_bullets: list = []
        self.loots: list[Loot] = []

        self.score = 0
        self.combo = 0
        self.combo_timer = 0.0
        self.elapsed = 0.0
        self.time_of_day = 10.0            # cosmetic HUD clock (no day/night)
        self.stats: dict = {}
        self.toasts: list[list] = []       # [text, remaining seconds]
        self.wave_banner: list | None = None   # [text, timer, boss]
        # Weapon switch feedback: [text, remaining seconds]
        self.switch_banner: list | None = None
        self.new_high = False
        self.show_fps = bool(st["show_fps"])
        self.fps_display = 0

    # ================================================================ run ==
    def run(self) -> None:
        while self.running:
            self.dt = min(0.05, self.clock.tick(S.FPS) / 1000.0)
            self.fps_display = int(self.clock.get_fps())
            for event in pygame.event.get():
                self.handle_event(event)
            self.update()
            self.draw()
            self.input.end_frame()
        self.commit_run(save_always=True)
        self.save.settings["show_fps"] = self.show_fps
        self.save.save()

    # ============================================================== events =
    def handle_event(self, event: pygame.event.Event) -> None:
        self.input.handle_event(event)
        if event.type == pygame.QUIT:
            self.running = False
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_F11:
                self.toggle_fullscreen()
            elif event.key == pygame.K_F3:
                S.DEBUG = not S.DEBUG
            elif event.key == pygame.K_ESCAPE:
                if self.state == PLAYING:
                    # Enter pause; reset sub-view so the player always sees
                    # the main menu first.
                    self.pause_view = "menu"
                    self.state = PAUSED
                elif self.state == PAUSED:
                    # Sub-view aware: leave-confirm is also closed by ESC.
                    if self.pause_view in ("settings", "controls", "leave"):
                        self.pause_view = "menu"
                    else:
                        # Main pause view -> resume.
                        self.pause_view = "menu"
                        self.state = PLAYING
                elif self.state in (SETTINGS, SHOP, UPGRADE_INFO, SKILL_TREE):
                    self.do_action("back")
                elif self.state == UPGRADE and self.level_transition.choices:
                    self.do_action(
                        f"upgrade:{self.level_transition.choices[0]}")
            elif self.state == UPGRADE and event.key in (
                    pygame.K_1, pygame.K_2, pygame.K_3):
                idx = event.key - pygame.K_1
                if idx < len(self.level_transition.choices):
                    self.do_action(
                        f"upgrade:{self.level_transition.choices[idx]}")

    def toggle_fullscreen(self) -> None:
        st = self.save.settings
        st["fullscreen"] = not st["fullscreen"]
        self.apply_display()
        self.save.save()

    def cycle_resolution(self) -> None:
        """Switch between supported logical resolutions."""
        st = self.save.settings
        idx = (int(st.get("resolution_index", 0)) + 1) % len(S.RESOLUTIONS)
        st["resolution_index"] = idx
        self.apply_display()
        self.save.save()

    def apply_display(self) -> None:
        """(Re)create the display from current settings.

        SCALED keeps UI coordinates logical while allowing any window size.
        """
        st = self.save.settings
        idx = int(st.get("resolution_index", 0))
        w, h = S.RESOLUTIONS[idx] if 0 <= idx < len(S.RESOLUTIONS) \
            else (S.SCREEN_WIDTH, S.SCREEN_HEIGHT)
        S.SCREEN_WIDTH, S.SCREEN_HEIGHT = w, h
        if st.get("fullscreen"):
            flags = pygame.FULLSCREEN | pygame.SCALED
        else:
            flags = pygame.RESIZABLE | pygame.SCALED
        self.screen = pygame.display.set_mode((w, h), flags)
        pygame.display.set_caption(S.WINDOW_TITLE)
        if getattr(self, "camera", None) is not None:
            self.camera.view_w, self.camera.view_h = w, h

    # ============================================================= update ==
    def update(self) -> None:
        if self.state == PLAYING:
            self.update_playing(self.dt)

    def update_playing(self, dt: float) -> None:
        p = self.player

        # Level transition state machine drives when world simulation runs.
        lt = self.level_transition

        # Detect "level just completed" -> transition into LEVEL_UP exactly once.
        if lt.state == GAMEPLAY and p.pending_levels > 0 \
                and self._enter_level_up():
            return  # transitioned this frame; pause world updates.

        if lt.is_gameplay_paused:
            # World frozen while the player chooses / applies an upgrade.
            return

        p.update(dt, self)
        self.elapsed += dt
        self.time_of_day += dt
        self.stats["survival_time"] = self.elapsed

        # Supply crates: tick + handle E-key interaction.
        if self.supply_crates is not None:
            self.supply_crates.update(dt, self)
            self.supply_crates.handle_interact(self)

        self.wave_manager.update(dt, self)

        # Spatial hash for cheap zombie-vs-zombie separation.
        self.zgrid: dict[tuple[int, int], list] = {}
        for z in self.zombies:
            self.zgrid.setdefault(
                (int(z.pos.x) // 128, int(z.pos.y) // 128), []).append(z)

        for z in self.zombies:
            z.update(dt, self)
        self.zombies = [z for z in self.zombies if z.hp > 0]

        for b in self.bullets:
            b.update(dt, self)
        self.bullets = [b for b in self.bullets if not b.dead]
        for b in self.enemy_bullets:
            b.update(dt, self)
        self.enemy_bullets = [b for b in self.enemy_bullets if not b.dead]

        for loot in self.loots:
            loot.update(dt, self)
        self.loots = [l for l in self.loots if not l.dead]

        self.particles.update(dt)
        self.camera.update(p.pos, dt)

        self.combo_timer -= dt
        if self.combo_timer <= 0:
            self.combo = 0

        self.quests.update(self)
        self.achievements.update(self)
        self._tick_toasts(dt)

        if p.dead:
            self.game_over()
            return

    # ============================================================ actions ==
    def do_action(self, action: str) -> None:
        self.audio.play("click")
        prev = self.state

        if action == "start":
            self.new_run()
        elif action == "quit":
            self.running = False
        elif action == "resume":
            self.pause_view = "menu"
            self.state = PLAYING
        elif action == "menu":
            self.commit_run(save_always=True)
            self.in_run_context = False
            self.level_transition.reset()
            if self.supply_crates is not None:
                self.supply_crates.clear()
            self.audio.stop_music()
            self.menus.set_profile(self.save.high_score,
                                   self.save.total_kills)
            self.state = MENU
        elif action == "settings":
            self.return_state = prev
            self.state = SETTINGS
        elif action == "pause_settings":
            # PAUSED stays the only game state; we only swap sub-view.
            self.pause_view = "settings"
        elif action == "pause_controls":
            self.pause_view = "controls"
        elif action == "pause_back":
            # From any sub-view, snap back to the main pause menu.
            self.pause_view = "menu"
        elif action == "pause_leave":
            self.pause_view = "leave"
        elif action == "pause_cancel_leave":
            self.pause_view = "menu"
        elif action == "pause_confirm_leave":
            # Same as `menu`: drop the run but preserve the save file.
            self.pause_view = "menu"
            self.commit_run(save_always=True)
            self.in_run_context = False
            self.level_transition.reset()
            if self.supply_crates is not None:
                self.supply_crates.clear()
            self.audio.stop_music()
            self.menus.set_profile(self.save.high_score,
                                   self.save.total_kills)
            self.state = MENU
        elif action == "back":
            self.state = self.return_state
        elif action == "shop":
            self.return_state = prev
            if self.player is None:
                self._create_preview_player()
            self.state = SHOP
        elif action == "shop_from_over":
            self.return_state = GAME_OVER
            self.state = SHOP
        elif action == "upgrades_info":
            self.return_state = prev
            if self.player is None:
                self._create_preview_player()
            self.state = UPGRADE_INFO
        elif action == "skill_tree":
            self.return_state = prev
            if self.player is None:
                self._create_preview_player()
            self.state = SKILL_TREE
        elif action == "restart":
            self.new_run()
        elif action.startswith("buy:"):
            if not self.shop.buy(action.split(":", 1)[1], self):
                self.toast("NOT ENOUGH COINS!")
        elif action.startswith("upgrade:"):
            uid = action.split(":", 1)[1]
            self._apply_upgrade_choice(uid)
        elif action.startswith("skill:"):
            uid = action.split(":", 1)[1]
            if self.player.skill_points > 0:
                self.upgrades.apply(uid, self.player, self)
                self.player.skill_points -= 1
                self.save.coins = self.player.coins
                self.save.save()
                self.audio.play("levelup")
                self.toast(f"SKILL: {uid.upper()}")
        elif action.startswith(("inc:", "dec:")):
            key = action.split(":", 1)[1]
            step = 0.1 if action.startswith("inc") else -0.1
            st = self.save.settings
            st[key] = max(0.0, min(1.0, round(st[key] + step, 2)))
            self.audio.set_volumes(st["master_volume"], st["music_volume"],
                                   st["sfx_volume"])
            self.save.save()
        elif action == "toggle_fullscreen":
            self.toggle_fullscreen()
        elif action == "cycle_resolution":
            self.cycle_resolution()
            self.toast(f"RESOLUTION {S.SCREEN_WIDTH}x{S.SCREEN_HEIGHT}")
        elif action == "toggle_fps":
            st = self.save.settings
            st["show_fps"] = not st["show_fps"]
            self.show_fps = st["show_fps"]
            self.save.save()
        elif action.startswith("toggle:"):
            # Generic gameplay-toggles used by the Pause Settings panel:
            #   screen_shake, damage_numbers, hit_effects, show_fps.
            key = action.split(":", 1)[1]
            st = self.save.settings
            st[key] = not bool(st.get(key, False))
            if key == "show_fps":
                self.show_fps = st["show_fps"]
            self.save.save()

    # ======================================================== run control ==
    def _create_preview_player(self) -> None:
        """Lightweight player for Shop/Upgrades screens outside a run.

        Built from the persistent profile; purchases made here write
        straight to save.json (shop.buy already persists).
        """
        unlocked = list(dict.fromkeys(["pistol"]
                                      + self.save.unlocked_weapons))
        self.player = Player(
            pygame.Vector2(S.WORLD_WIDTH / 2, S.WORLD_HEIGHT / 2),
            unlocked=unlocked, coins=self.save.coins,
            level=int(self.save.data.get("player_level", 1)),
            xp=int(self.save.data.get("xp", 0)))
        self.player.max_hp += int(self.save.data.get("permanent_max_hp", 0))
        self.player.hp = self.player.max_hp
        self.player.armor = int(self.save.data.get("permanent_armor", 0))
        self.player.preview_only = True

    def new_run(self) -> None:
        self.map = GameMap()
        start = pygame.Vector2(S.WORLD_WIDTH / 2, S.WORLD_HEIGHT / 2)
        if self.map.blocked(start, 40):
            alt = self.map.random_free_point(random.Random(7))
            if alt is not None:
                start = alt
        unlocked = list(dict.fromkeys(["pistol"]
                                      + self.save.unlocked_weapons))
        self.player = Player(
            start, unlocked=unlocked, coins=self.save.coins,
            level=int(self.save.data.get("player_level", 1)),
            xp=int(self.save.data.get("xp", 0)))
        self.player.max_hp += int(self.save.data.get("permanent_max_hp", 0))
        self.player.hp = self.player.max_hp
        self.player.armor = int(self.save.data.get("permanent_armor", 0))
        for wid, wpn in self.player.weapons.weapons.items():
            wpn.add_reserve(int(wpn.magazine_size * 2))
        # Wire the manager's switch hook into Game so weapon switches
        # show a short on-screen banner without coupling Player ↔ Game.
        self.player.weapons.switch_notify = self._on_weapon_switch
        self.camera = Camera(*self.screen.get_size())
        self.camera.offset.update(max(0, start.x - self.camera.view_w / 2),
                                  max(0, start.y - self.camera.view_h / 2))
        self.particles.clear()
        self.zombies = []
        self.bullets = []
        self.enemy_bullets = []
        self.loots = []
        self.wave_manager = WaveManager()
        # Wire supply crates into the wave-complete hook so a fresh batch
        # of crates can appear after each cleared wave.
        self.wave_manager.on_wave_complete = self._on_wave_complete
        self.active_modifier = None
        self.score = 0
        self.combo = 0
        self.combo_timer = 0.0
        self.elapsed = 0.0
        self.time_of_day = 10.0
        self.new_high = False
        self.stats = {"kills": 0, "kills_by_type": {}, "boss_kills": 0,
                      "survival_time": 0.0, "shots_by_weapon": {}}
        self.toasts = []
        self.wave_banner = None
        self.quests.bind(self)
        self.achievements = AchievementSystem(list(self.save.achievements))
        self.level_transition.reset()
        # Supply crates live in world space; create the manager now that
        # the map is built and seed it with the initial batch.
        self.supply_crates = SupplyCrateManager(self.map)
        self.supply_crates.spawn_initial(around=start)
        self.in_run_context = True
        self.state = PLAYING
        self.audio.start_music()
        self.toast("SURVIVE THE HORDE!")

    def _enter_level_up(self) -> bool:
        """GAMEPLAY -> LEVEL_UP. Idempotent. Returns True on transition."""
        lt = self.level_transition
        if lt.state != GAMEPLAY:
            return False
        if not lt.request_level_up(self.player):
            return False
        self.state = UPGRADE
        self.audio.play("levelup")
        return True

    def _apply_upgrade_choice(self, uid: str) -> None:
        """Apply the picked upgrade and either roll the next batch or
        resume gameplay. Single source of truth for upgrade consumption."""
        lt = self.level_transition
        if not lt.choose_upgrade(uid):
            return  # ignored: not in LEVEL_UP, already applied, bad id

        # Side effect: actually apply the upgrade.
        self.upgrades.apply(uid, self.player, self)
        self.player.pending_levels = max(0, self.player.pending_levels - 1)
        self.save.data["player_level"] = self.player.level
        self.save.data["xp"] = self.player.xp
        self.save.coins = self.player.coins
        self.save.save()

        lt.finish_applying()

        # More pending levels? Roll the next batch and stay in LEVEL_UP.
        if self.player.pending_levels > 0:
            lt.start_next_batch(self.player)
        else:
            self._start_next_level()

    def _start_next_level(self) -> None:
        """Resume gameplay. Wave timer continues — WaveManager is NOT
        recreated; only state-machine bookkeeping runs here.

        NOTE: ``lt.finish_applying()`` was already called by
        ``_apply_upgrade_choice``; calling it again here would no-op.
        We go straight to ``resume_gameplay()`` which is valid from
        either APPLYING_UPGRADE or STARTING_NEXT_LEVEL.
        """
        lt = self.level_transition
        lt.resume_gameplay()
        self.state = PLAYING

    def _on_wave_complete(self, game) -> None:
        """WaveManager hook fired when a wave is fully cleared.

        Rolls a chance to drop additional supply crates around the player.
        Existing crates stay — the player may not have grabbed them yet.
        """
        if self.supply_crates is None:
            return
        spawned = self.supply_crates.spawn_post_wave(
            around=self.player.pos, player=self.player)
        if spawned:
            self.toast(f"SUPPLY DROP: +{len(spawned)} CRATE"
                      f"{'S' if len(spawned) > 1 else ''}")

    def _on_weapon_switch(self, weapon_id: str, slot: int) -> None:
        """Called by WeaponManager when the player changes weapons.

        Stores a short-lived banner for the HUD to render. ~0.9s is long
        enough to read but short enough not to obscure gameplay.
        """
        try:
            from weapon import WEAPON_DATA
            name = WEAPON_DATA.get(weapon_id, {}).get("name",
                                                     weapon_id.upper())
        except Exception:
            name = weapon_id.upper()
        self.switch_banner = [f"{name}", 0.9, slot]

    def game_over(self) -> None:
        self.level_transition.reset()
        if self.supply_crates is not None:
            self.supply_crates.clear()
        self.new_high = self.commit_run()
        self.menus.set_profile(self.save.high_score, self.save.total_kills)
        self.state = GAME_OVER

    def commit_run(self, save_always: bool = False) -> bool:
        """Persist progress. Returns True when a new high score was set."""
        if self.player is None:
            return False
        if not save_always and self.state != GAME_OVER:
            return False
        return self.save.record_run(
            self.score, self.stats.get("kills", 0), self.player.coins,
            self.player.level, self.player.xp)

    # ======================================================== game events ==
    def on_level_up(self) -> None:
        self.particles.heal(self.player.pos)
        self.toast(f"LEVEL UP!  LV {self.player.level}")

    def on_zombie_killed(self, zombie) -> None:
        kind = zombie.KIND
        if kind in ("boss", "necromancer_boss"):
            self.stats["boss_kills"] = self.stats.get("boss_kills", 0) + 1
            self.wave_manager.boss_alive = False
        self.combo += 1
        self.combo_timer = S.COMBO_WINDOW
        mult = self.combo_multiplier()
        self.score += int(zombie.score_value * mult)
        self.stats["kills"] = self.stats.get("kills", 0) + 1
        by_type = self.stats.setdefault("kills_by_type", {})
        by_type[kind] = by_type.get(kind, 0) + 1
        self.player.coins += zombie.coin_value
        self.player.add_xp(zombie.xp_value, self)
        self.loots.extend(drops_for(zombie, random.Random()))
        self.shake_camera(6 if kind == "boss" else 2)
        if self.player.life_steal > 0:
            steal = self.player.life_steal * zombie.max_hp
            self.player.heal(steal)

    def combo_multiplier(self) -> int:
        return min(S.COMBO_MAX_MULT,
                   1 + self.combo // S.COMBO_KILLS_PER_STEP)

    def wave_announce(self, text: str, boss: bool = False) -> None:
        self.wave_banner = [text, 3.0, boss]

    def toast(self, text: str) -> None:
        self.toasts.append([text, 4.0])

    def _tick_toasts(self, dt: float) -> None:
        for t in self.toasts:
            t[1] -= dt
        self.toasts = [t for t in self.toasts if t[1] > 0]
        if self.wave_banner is not None:
            self.wave_banner[1] -= dt
            if self.wave_banner[1] <= 0:
                self.wave_banner = None
        if self.switch_banner is not None:
            self.switch_banner[1] -= dt
            if self.switch_banner[1] <= 0:
                self.switch_banner = None

    # --------------------------------------------- settings-aware helpers --
    def shake_camera(self, magnitude: float) -> None:
        """Centralised screen-shake call: honours the `screen_shake`
        setting. Default is True, so behaviour matches the old direct
        ``self.camera.shake(...)`` call when the player never touches it."""
        self.camera.shake(magnitude,
                          enabled=bool(self.save.settings["screen_shake"]))

    # -------------------------------------------------------- day / night --
    @property
    def is_night(self) -> bool:
        return False

    @property
    def night_factor(self) -> float:
        """0..1 darkness factor. Day/night cycle is disabled by design —
        the map stays at full daylight brightness; time_of_day keeps
        counting only for the HUD clock and any future timed events.
        """
        return 0.0

    # =============================================================== draw ==
    def draw(self) -> None:
        surf = self.screen
        action: str | None = None

        # World renders for every state where the player is still inside
        # the run context — including LEVEL_UP. Brightness is locked at
        # 100%; no full-screen darkening is ever applied.
        if self.in_run_context and self.state in (
                PLAYING, PAUSED, UPGRADE, SETTINGS, GAME_OVER):
            self.draw_world()

        if self.state == PLAYING:
            draw_toasts(surf, self)
        elif self.state == MENU:
            action, _ = self.menus.draw_main_menu(
                surf, self.dt, pygame.time.get_ticks() / 1000)
        elif self.state == PAUSED:
            action, _ = self.menus.draw_pause(surf, self)
        elif self.state == SETTINGS:
            action, _ = self.menus.draw_settings(surf, self)
        elif self.state == SHOP:
            entries = self.shop.get_entries(self)
            action, _ = self.menus.draw_shop(surf, self, entries)
        elif self.state == UPGRADE:
            texts = {u["id"]: u["text"] for u in UpgradeSystem.CATALOG}
            descs = {u["id"]: u["desc"] for u in UpgradeSystem.CATALOG}
            choices = self.level_transition.choices
            action, _ = self.menus.draw_upgrade(
                surf, self, choices, texts, descs)
        elif self.state == UPGRADE_INFO:
            action, _ = self.menus.draw_upgrades_info(surf, self)
        elif self.state == SKILL_TREE:
            action, _ = self.menus.draw_skill_tree(surf, self)
        elif self.state == GAME_OVER:
            stats = dict(self.stats)
            stats.update(coins=self.player.coins, level=self.player.level,
                         score=self.score,
                         wave=max(1, self.wave_manager.wave))
            action, _ = self.menus.draw_game_over(surf, stats, self.new_high)

        if action:
            self.do_action(action)
        pygame.display.flip()

    # ------------------------------------------------------------ world ----
    def draw_world(self) -> None:
        cam = self.camera
        surf = self.screen
        self.map.draw_ground(surf, cam, biome=self.wave_manager.biome)
        self.map.draw_obstacles(surf, cam, settings=self.save.settings)
        view = cam.view_rect
        # Supply crates — render before zombies/loot so moving entities
        # can stack on top. Highlight the one the player can interact with.
        if self.supply_crates is not None:
            target = self.supply_crates.nearest_in_range(self.player)
            for c in self.supply_crates.crates:
                if not view.collidepoint(c.pos.x, c.pos.y):
                    continue
                c.draw(surf, cam, nearby=(c is target))
        for loot in self.loots:
            if view.collidepoint(loot.pos.x, loot.pos.y):
                loot.draw(surf, cam)
        for z in self.zombies:
            if view.colliderect(z.pos.x - 60, z.pos.y - 60, 120, 120):
                z.draw(surf, cam)
        self.player.draw(surf, cam)
        for b in self.bullets:
            b.draw(surf, cam)
        for b in self.enemy_bullets:
            b.draw(surf, cam)
        self.particles.draw(surf, cam)
        # Brightness is locked at 100% — no overlay ever darkens the world.
        # LightingSystem.render() is a hard no-op (see lighting.py).

        draw_hud(surf, self)
        draw_minimap(surf, self)
        self._draw_damage_vignette(surf)

        # Skip crosshair + wave banner during UPGRADE so the upgrade
        # card reads cleanly. The world underneath stays at 100% brightness.
        if not self.level_transition.is_level_up_active:
            spread = 6 + self.player.weapons.current.spread_deg * 1.5
            draw_crosshair(surf, pygame.mouse.get_pos(), spread)
            if self.wave_banner is not None:
                self.menus.draw_wave_announce(surf, self.wave_banner[0],
                                              self.wave_banner[1],
                                              self.wave_banner[2])

        # Supply-crate proximity hint. Drawn above HUD so the player
        # always sees it, but small enough not to obstruct gameplay.
        if (self.state == PLAYING
                and self.supply_crates is not None
                and not self.level_transition.is_level_up_active):
            target = self.supply_crates.nearest_in_range(self.player)
            if target is not None:
                self._draw_crate_hint(surf, target)

        if S.DEBUG:
            self._draw_debug_shapes(surf, cam)
            self._draw_debug(surf)

    def _draw_damage_vignette(self, surface: pygame.Surface) -> None:
        """No-op: damage vignette disabled — brightness locked at 100%."""
        return

    def _draw_crate_hint(self, surface: pygame.Surface, crate) -> None:
        """Floating '[E] PICK UP - <label>' above a crate when the player
        is in interaction range. Anchored to the crate's screen position."""
        from supply_crate import SupplyCrate
        label = SupplyCrate.KIND_LABELS.get(crate.kind, "SUPPLY CRATE")
        text = f"[E]  PICK UP  -  {label}"
        sp = self.camera.apply(crate.pos + pygame.Vector2(0, -42))
        font = get_font(15, bold=True)
        img = font.render(text, True, (235, 235, 225))
        rect = img.get_rect(center=(int(sp.x), int(sp.y)))
        pad = pygame.Rect(rect.x - 10, rect.y - 4,
                          rect.width + 20, rect.height + 8)
        bg = pygame.Surface(pad.size, pygame.SRCALPHA)
        bg.fill((14, 18, 28, 200))
        pygame.draw.rect(bg, (*SupplyCrate.KIND_COLORS.get(crate.kind,
                                                           (200, 200, 200)),
                               220),
                         bg.get_rect(), 2, border_radius=6)
        surface.blit(bg, pad.topleft)
        surface.blit(img, rect)

    def _draw_debug_shapes(self, surface: pygame.Surface, cam) -> None:
        """Collision boxes, attack & detection ranges, obstacle outlines."""
        view = cam.view_rect
        # Obstacle collision boxes.
        for rect in self.map.get_near(self.player.pos, 1200):
            if view.colliderect(rect):
                pygame.draw.rect(surface, (255, 0, 255),
                                 cam.apply_rect(rect), 1)
        # Zombies: radius / attack range / detection range.
        for z in self.zombies:
            if not view.colliderect(z.pos.x - 600, z.pos.y - 600, 1200, 1200):
                continue
            sp = cam.apply(z.pos)
            pygame.draw.circle(surface, (255, 255, 255), (int(sp.x), int(sp.y)),
                               int(z.radius), 1)
            pygame.draw.circle(surface, (255, 140, 0), (int(sp.x), int(sp.y)),
                               int(z.attack_range + z.radius), 1)
            if z.state == "idle":
                pygame.draw.circle(surface, (0, 160, 255),
                                   (int(sp.x), int(sp.y)),
                                   int(z.detection_range), 1)
        # Player.
        psp = cam.apply(self.player.pos)
        pygame.draw.circle(surface, (0, 255, 0), (int(psp.x), int(psp.y)),
                           self.player.radius + 2, 1)
        # Pathfinding hint: straight line player -> nearest zombie.
        if self.zombies:
            near = min(self.zombies,
                       key=lambda z: z.pos.distance_squared_to(self.player.pos))
            nsp = cam.apply(near.pos)
            pygame.draw.line(surface, (255, 60, 60), psp, nsp, 1)

    def _draw_darkness(self, surface: pygame.Surface, cam) -> None:
        # Brightness locked at 100% — no overlay is applied regardless of
        # wave, time of day, fog modifier, streetlamps or player torch.
        self.lighting.render(surface, cam, 0.0, self.player.pos)

    def _draw_debug(self, surface: pygame.Surface) -> None:
        lines = [
            f"FPS: {self.fps_display}",
            f"player pos: ({int(self.player.pos.x)}, "
            f"{int(self.player.pos.y)})",
            f"zombies: {len(self.zombies)}  bullets: {len(self.bullets)}"
            f"  enemy: {len(self.enemy_bullets)}",
            f"particles: {self.particles.count}  loot: {len(self.loots)}",
            f"wave: {self.wave_manager.wave} ({self.wave_manager.state})"
            f"  to_spawn: {self.wave_manager.to_spawn}",
            f"spawn interval: {self.wave_manager.spawn_interval:.2f}s",
            f"combo: {self.combo} (x{self.combo_multiplier()})",
        ]
        panel = pygame.Rect(12, 150, 360, len(lines) * 20 + 14)
        bg = pygame.Surface(panel.size, pygame.SRCALPHA)
        bg.fill((0, 25, 0, 175))
        surface.blit(bg, panel)
        for i, line in enumerate(lines):
            draw_text(surface, line, 13, 22, 158 + i * 20,
                      color=(140, 255, 140))
