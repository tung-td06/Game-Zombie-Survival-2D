"""Global configuration constants for Zombie Survival."""
from __future__ import annotations

import os

# ---------------------------------------------------------------- window ---
SCREEN_WIDTH = 1280
SCREEN_HEIGHT = 720
FPS = 60
WINDOW_TITLE = "ZOMBIE SURVIVAL"
RESOLUTIONS = [(1280, 720), (1600, 900), (1920, 1080)]

# ----------------------------------------------------------------- world ---
WORLD_WIDTH = 4000
WORLD_HEIGHT = 4000
MAP_SEED = 20260823          # change for a different procedural city
MINIMAP_SIZE = 160

# ------------------------------------------------------------- gameplay ----
PLAYER_RADIUS = 16
PLAYER_BASE_SPEED = 230.0
PLAYER_BASE_MAX_HP = 100.0
BULLET_LIFETIME = 1.6
MAX_PARTICLES = 900
MAX_ALIVE_ZOMBIES = 200

# ----------------------------------------------------------------- waves ---
BASE_WAVE_SIZE = 10
WAVE_SIZE_GROWTH = 5
WAVE_INTERMISSION = 5.0
HP_GROWTH_PER_WAVE = 0.08
SPEED_GROWTH_PER_WAVE = 0.02
DAMAGE_GROWTH_PER_WAVE = 0.04
SPAWN_MIN_DIST = 500.0       # zombies never spawn closer than this to player
SPAWN_MAX_DIST = 950.0
BOSS_EVERY_N_WAVES = 5

# ------------------------------------------------------------ biomes ---
BIOMES = ["city", "industrial", "suburbs", "park"]
BIOME_TINT = {
    "city":       ((40, 46, 54),   (66, 74, 88),   "city"),
    "industrial": ((58, 46, 38),   (84, 70, 56),   "industrial"),
    "suburbs":    ((40, 56, 40),   (60, 84, 60),   "suburbs"),
    "park":       ((36, 60, 44),   (58, 96, 70),   "park"),
}

# -------------------------------------------------------- modifiers ----
MODIFIERS = ["none", "blood_moon", "swarm", "frenzy", "fog"]
MODIFIER_PER_WAVE = 7

# ------------------------------------------------------------ day / night --
DAY_LENGTH = 120.0           # cosmetic only — counter advances but
                                # lighting stays constant (no day/night).
NIGHT_LENGTH = 0.0            # disabled
NIGHT_TRANSITION = 0.0        # disabled
NIGHT_SPEED_BONUS = 0.0       # disabled
NIGHT_DAMAGE_BONUS = 0.0      # disabled
NIGHT_SPAWN_MULT = 1.0        # disabled
NIGHT_VIS_MULT = 1.0          # disabled
DAY_VIS_BONUS = 0.0           # disabled

# ---------------------------------------------------------------- scoring --
COMBO_WINDOW = 3.0           # seconds to keep a kill combo alive
COMBO_KILLS_PER_STEP = 10    # every N kills => multiplier +1 (max x5)
COMBO_MAX_MULT = 5

XP_BASE_REQUIREMENT = 100    # required_xp = XP_BASE_REQUIREMENT * level

# ----------------------------------------------------------------- debug ---
DEBUG = False                # F3 toggles at runtime; default from here

# ---------------------------------------------------------------- paths ----
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
ASSETS_DIR = os.path.join(BASE_DIR, "assets")
SAVE_FILE = os.path.join(DATA_DIR, "save.json")
WEAPONS_FILE = os.path.join(DATA_DIR, "weapons.json")
ZOMBIES_FILE = os.path.join(DATA_DIR, "zombies.json")
UPGRADES_FILE = os.path.join(DATA_DIR, "upgrades.json")

# ---------------------------------------------------------------- colors ---
COLORS = {
    "bg": (38, 42, 36),
    "grid": (52, 58, 50),
    "road": (62, 62, 64),
    "road_line": (230, 210, 110),
    "building": (88, 86, 96),
    "building_roof": (104, 102, 114),
    "house": (116, 86, 66),
    "house_roof": (140, 104, 78),
    "tree": (50, 110, 56),
    "tree_dark": (36, 80, 44),
    "car_red": (170, 60, 60),
    "car_blue": (70, 96, 170),
    "car_yellow": (200, 170, 70),
    "container": (74, 130, 130),
    "crate": (160, 122, 70),
    "barricade": (140, 140, 142),
    "border": (70, 70, 74),

    "player": (110, 230, 255),
    "player_dark": (50, 140, 180),
    "zombie_normal": (110, 180, 80),
    "zombie_fast": (200, 210, 90),
    "zombie_tank": (130, 100, 160),
    "zombie_exploder": (220, 140, 70),
    "zombie_ranged": (90, 170, 170),
    "zombie_boss": (200, 60, 66),

    "bullet": (255, 240, 150),
    "enemy_bullet": (255, 130, 110),
    "blood": (170, 30, 36),
    "xp": (130, 240, 140),

    "ui_bg": (14, 14, 16),
    "ui_panel": (32, 32, 38),
    "ui_text": (235, 235, 225),
    "ui_dim": (150, 150, 146),
    "ui_accent": (255, 70, 80),
    "ui_gold": (250, 210, 90),
    "ui_green": (130, 240, 150),
    "ui_blue": (110, 200, 255),
}


def color(name: str) -> tuple[int, int, int]:
    return COLORS.get(name, (255, 0, 255))
