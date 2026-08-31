"""HUD, minimap, crosshair, buttons and shared text helpers."""
from __future__ import annotations

import math

import pygame

import settings as S
from typing import Any
from utils import format_time

_font_cache: dict[int, pygame.font.Font] = {}


def get_font(size: int, bold: bool = False) -> pygame.font.Font:
    key = size * 2 + (1 if bold else 0)
    if key not in _font_cache:
        try:
            font = pygame.font.SysFont("consolas", size, bold=bold)
        except Exception:
            font = pygame.font.SysFont(None, size)
        if bold:
            font.set_bold(True)
        _font_cache[key] = font
    return _font_cache[key]


def draw_text(surface: pygame.Surface, text: str, size: int, x: int, y: int,
              color: tuple = S.color("ui_text"), align: str = "topleft",
              bold: bool = False) -> pygame.Rect:
    img = get_font(size, bold).render(text, True, color)
    rect = img.get_rect(**{align: (int(x), int(y))})
    surface.blit(img, rect)
    return rect


class Button:
    """Hover/click-animated immediate-mode button."""

    def __init__(self, text: str, center: tuple[int, int], action: str,
                 width: int = 300, height: int = 54,
                 accent: tuple | None = None) -> None:
        self.text = text
        self.rect = pygame.Rect(0, 0, width, height)
        self.rect.center = center
        self.action = action
        self.accent = accent or S.color("ui_accent")
        self.hover_t = 0.0          # 0..1 hover animation
        self.pressed_t = 0.0

    def update(self, dt: float, mouse_pos: tuple[int, int]) -> None:
        hovered = self.rect.collidepoint(mouse_pos)
        target = 1.0 if hovered else 0.0
        speed = 8.0
        self.hover_t += (target - self.hover_t) * min(1.0, dt * speed)
        self.pressed_t = max(0.0, self.pressed_t - dt * 5.0)

    def is_clicked(self, mouse_pressed: bool) -> bool:
        if mouse_pressed and self.rect.collidepoint(pygame.mouse.get_pos()):
            self.pressed_t = 1.0
            return True
        return False

    def draw(self, surface: pygame.Surface) -> None:
        h = self.hover_t
        grow = h * 6 - self.pressed_t * 8
        rect = self.rect.inflate(grow, grow * 0.5)
        base = (44, 44, 54)
        bg = tuple(int(b + (a - b) * h * 0.6) for b, a in zip(base, self.accent))
        pygame.draw.rect(surface, bg, rect, border_radius=10)
        pygame.draw.rect(surface,
                         tuple(min(255, int(c * (0.7 + h))) for c in self.accent),
                         rect, 2, border_radius=10)
        color = S.color("ui_text") if h < 0.4 else (255, 255, 255)
        draw_text(surface, self.text, 22, rect.centerx, rect.centery,
                  color=color, align="center", bold=True)


# ------------------------------------------------------------------ HUD ----
def draw_hud(surface: pygame.Surface, game) -> None:
    p = game.player
    w, hgt = S.SCREEN_WIDTH, S.SCREEN_HEIGHT

    # --- left: HP / armor / level+XP -----------------------------------
    panel = pygame.Rect(16, 14, 330, 118)
    pygame.draw.rect(surface, (*S.color("ui_panel"),), panel, border_radius=8)
    pygame.draw.rect(surface, (90, 90, 100), panel, 2, border_radius=8)

    hp_frac = max(0.0, p.hp / p.max_hp)
    bar = pygame.Rect(28, 26, 306, 24)
    pygame.draw.rect(surface, (40, 16, 18), bar, border_radius=5)
    pygame.draw.rect(surface, (220, 50, 60),
                     (bar.x, bar.y, int(bar.w * hp_frac), bar.h), border_radius=5)
    draw_text(surface, f"HP {int(p.hp)} / {int(p.max_hp)}", 17,
              bar.x + bar.w / 2, bar.y + bar.h / 2, align="center", bold=True)

    armor_frac = p.armor / 100.0
    abar = pygame.Rect(28, 56, 306, 14)
    pygame.draw.rect(surface, (16, 30, 44), abar, border_radius=5)
    pygame.draw.rect(surface, S.color("ui_blue"),
                     (abar.x, abar.y, int(abar.w * armor_frac), abar.h),
                     border_radius=5)
    draw_text(surface, f"ARMOR {int(p.armor)}", 13,
              abar.x + abar.w - 6, abar.y + abar.h / 2,
              align="midright", bold=True)

    draw_text(surface, f"LV {p.level}", 17, 30, 82, bold=True)
    xp_frac = p.xp / p.xp_needed
    xbar = pygame.Rect(78, 86, 256, 12)
    pygame.draw.rect(surface, (20, 36, 22), xbar, border_radius=4)
    pygame.draw.rect(surface, S.color("xp"),
                     (xbar.x, xbar.y, int(xbar.w * xp_frac), xbar.h),
                     border_radius=4)

    # --- right: score / coins / wave clock ------------------------------
    rpanel = pygame.Rect(w - 179, 14, 166, 40)
    pygame.draw.rect(surface, S.color("ui_panel"), rpanel, border_radius=8)
    pygame.draw.rect(surface, (90, 90, 100), rpanel, 2, border_radius=8)
    cy = rpanel.centery
    lbl_rect = draw_text(surface, "SCORE", 12, rpanel.x + 12, cy,
                         color=S.color("ui_dim"), align="midleft", bold=True)
    draw_text(surface, str(game.score), 17, lbl_rect.right + 6, cy,
              color=S.color("ui_gold"), align="midleft", bold=True)
    draw_text(surface, f"${p.coins}", 17, rpanel.right - 12, cy,
              color=S.color("ui_green"), align="midright", bold=True)

    # --- bottom-left: weapon + ammo -------------------------------------
    wep = p.weapons.current
    wpanel = pygame.Rect(16, hgt - 100, 360, 84)
    pygame.draw.rect(surface, S.color("ui_panel"), wpanel, border_radius=8)
    pygame.draw.rect(surface, (90, 90, 100), wpanel, 2, border_radius=8)
    slots = [wid for wid in wp_order() if wid in p.weapons.weapons]
    cur_idx = slots.index(wep.id) if wep.id in slots else 0
    # Per-slot row, each rendered separately so the active one can be
    # highlighted without changing the surrounding visual style.
    slot_x = 30
    slot_y = hgt - 34
    for i in range(5):
        is_active = (i == cur_idx)
        unlocked = i < len(slots)
        if unlocked:
            wid = slots[i]
            label = f"[{i + 1}] {wid[:3].upper()}"
            color = (235, 235, 225) if is_active else S.color("ui_dim")
        else:
            label = f"[{i + 1}] ---"
            color = (90, 90, 100)
        img = get_font(13, bold=is_active).render(label, True, color)
        surface.blit(img, (slot_x, slot_y))
        slot_x += img.get_width() + 10
        if is_active:
            # Underline the active slot.
            pygame.draw.line(surface, S.color("ui_accent"),
                             (slot_x - img.get_width() - 4, slot_y + 16),
                             (slot_x - 4, slot_y + 16), 2)
    wep_icon = _weapon_icon(wep.id)
    surface.blit(wep_icon, wep_icon.get_rect(center=(36, hgt - 58)))
    draw_text(surface, wep.name, 19, 64, hgt - 76, bold=True)
    if wep.reloading:
        t = 1.0 - wep.reload_timer / max(0.01, getattr(wep, "reload_total", 1.0))
        draw_text(surface, f"RELOADING {int(t * 100)}%", 15,
                  wpanel.right - 16, hgt - 78, align="topright",
                  color=(255, 180, 60), bold=True)
        pygame.draw.rect(surface, (60, 30, 20),
                         (60, hgt - 50, wpanel.width - 76, 8), border_radius=3)
        pygame.draw.rect(surface, (255, 180, 60),
                         (60, hgt - 50, int((wpanel.width - 76) * t), 8),
                         border_radius=3)
    else:
        draw_text(surface, f"{wep.ammo} / {wep.reserve}", 22,
                  wpanel.right - 16, hgt - 78, align="topright", bold=True)

    # --- switch feedback banner ----------------------------------------
    sb = getattr(game, "switch_banner", None)
    if sb is not None:
        text, remain, slot_idx = sb
        alpha = max(0.0, min(1.0, remain / 0.9))
        # Smooth ease-out alpha for the last 0.3s.
        if remain < 0.3:
            alpha *= remain / 0.3
        big = get_font(34, bold=True).render(text, True, (255, 235, 170))
        small = get_font(16, bold=False).render(
            f"SLOT {slot_idx}", True, (200, 200, 210))
        for img in (big, small):
            img.set_alpha(int(255 * alpha))
        # Position: centre of the screen, slightly above the weapon HUD.
        pad = 16
        w_total = max(big.get_width(), small.get_width()) + pad * 2
        h_total = big.get_height() + small.get_height() + pad
        cx = S.SCREEN_WIDTH / 2
        cy = hgt / 2 - 60
        bg = pygame.Surface((w_total, h_total), pygame.SRCALPHA)
        bg.fill((14, 18, 28, int(180 * alpha)))
        pygame.draw.rect(bg, (*S.color("ui_accent"), int(220 * alpha)),
                         bg.get_rect(), 2, border_radius=8)
        bg_rect = bg.get_rect(center=(int(cx), int(cy)))
        surface.blit(bg, bg_rect)
        surface.blit(big, big.get_rect(
            midbottom=(int(cx), bg_rect.y + big.get_height() + pad // 2)))
        surface.blit(small, small.get_rect(
            midtop=(int(cx), bg_rect.bottom - small.get_height() - pad // 2)))

    # --- bottom-right: survival time ---------------------------------
    draw_text(surface, format_time(game.elapsed),
              16, w - 20, hgt - 40, align="bottomright",
              color=S.color("ui_blue"), bold=True)
    if game.show_fps:
        draw_text(surface, f"FPS {game.fps_display}", 14, w - 20, hgt - 62,
                  align="bottomright", color=S.color("ui_dim"))

    # --- top-center: wave banner -----------------------------------------
    wm = game.wave_manager
    sub = ""
    if wm.state == "active":
        remaining = wm.to_spawn + len(game.zombies)
        sub = f"{remaining} LEFT"
    else:
        sub = f"NEXT IN {max(0, int(wm.timer))}s"
    biome_label = wm.biome.upper()
    modifier_label = wm.modifier.upper().replace("_", " ") \
        if wm.modifier != "none" else ""
    header = f"WAVE {max(1, wm.wave)}"
    if modifier_label:
        header += f"  -  {modifier_label}"
    draw_text(surface, header, 24, w / 2, 18,
              align="center", bold=True, color=(235, 235, 225))
    draw_text(surface, f"{biome_label}  -  {sub}", 14, w / 2, 48,
              align="center", color=S.color("ui_dim"))

    # combo
    if game.combo >= 5:
        mult = game.combo_multiplier()
        pulse = 1.0 + 0.08 * abs(math.sin(game.elapsed * 8))
        size = int(20 * pulse)
        draw_text(surface, f"COMBO x{mult}  ({game.combo})",
                  size, w / 2, 76, align="center", color=S.color("ui_gold"),
                  bold=True)

    if p.skill_points > 0:
        pulse = 1.0 + 0.08 * abs(math.sin(game.elapsed * 6))
        size = int(16 * pulse)
        draw_text(surface, f"+ {p.skill_points} SKILL POINT"
                  f"{'S' if p.skill_points > 1 else ''} (PAUSE)",
                  size, w / 2, 96, align="center",
                  color=(170, 230, 255), bold=True)


def wp_order():
    from weapon import WEAPON_ORDER
    return WEAPON_ORDER


_WEAPON_ICONS: dict[str, pygame.Surface] = {}


def _weapon_icon(wid: str) -> pygame.Surface:
    if wid in _WEAPON_ICONS:
        return _WEAPON_ICONS[wid]
    s = pygame.Surface((36, 36), pygame.SRCALPHA)
    cx, cy = 18, 18
    if wid == "pistol":
        pygame.draw.rect(s, (60, 60, 70), (cx - 4, cy - 10, 8, 14),
                         border_radius=2)
        pygame.draw.rect(s, (40, 40, 50), (cx - 6, cy + 2, 12, 6),
                         border_radius=2)
    elif wid == "shotgun":
        pygame.draw.rect(s, (50, 50, 60), (cx - 14, cy - 4, 24, 6),
                         border_radius=2)
        pygame.draw.rect(s, (60, 60, 70), (cx - 6, cy + 2, 12, 6),
                         border_radius=2)
        pygame.draw.rect(s, (100, 70, 40), (cx + 8, cy - 8, 4, 14))
    elif wid == "smg":
        pygame.draw.rect(s, (60, 60, 70), (cx - 10, cy - 4, 18, 6),
                         border_radius=2)
        pygame.draw.rect(s, (40, 40, 50), (cx - 4, cy + 2, 8, 8),
                         border_radius=2)
        pygame.draw.rect(s, (90, 90, 100), (cx - 14, cy - 2, 4, 4))
    elif wid == "rifle":
        pygame.draw.rect(s, (60, 60, 70), (cx - 14, cy - 4, 26, 6),
                         border_radius=2)
        pygame.draw.rect(s, (40, 40, 50), (cx - 4, cy + 2, 8, 8),
                         border_radius=2)
        pygame.draw.rect(s, (90, 70, 40), (cx - 12, cy - 8, 18, 4))
    elif wid == "sniper":
        pygame.draw.rect(s, (40, 60, 80), (cx - 16, cy - 3, 30, 5),
                         border_radius=2)
        pygame.draw.rect(s, (30, 40, 60), (cx - 4, cy + 2, 8, 8),
                         border_radius=2)
        pygame.draw.circle(s, (200, 200, 210),
                           (int(cx + 14), int(cy - 1)), 2)
    elif wid == "flamethrower":
        pygame.draw.rect(s, (100, 60, 40), (cx - 14, cy - 4, 22, 8),
                         border_radius=2)
        pygame.draw.rect(s, (40, 40, 50), (cx - 4, cy + 2, 8, 8),
                         border_radius=2)
        pygame.draw.polygon(s, (255, 130, 60),
                           [(cx + 8, cy - 2), (cx + 16, cy - 4),
                            (cx + 14, cy), (cx + 16, cy + 4),
                            (cx + 8, cy + 2)])
    elif wid == "plasma":
        pygame.draw.rect(s, (80, 60, 140), (cx - 14, cy - 4, 24, 6),
                         border_radius=2)
        pygame.draw.rect(s, (40, 40, 50), (cx - 4, cy + 2, 8, 8),
                         border_radius=2)
        pygame.draw.circle(s, (170, 100, 255),
                           (int(cx + 10), int(cy - 1)), 4)
        pygame.draw.circle(s, (220, 180, 255),
                           (int(cx + 10), int(cy - 1)), 2)
    elif wid == "crossbow":
        pygame.draw.line(s, (140, 90, 40), (cx - 12, cy - 8),
                         (cx + 12, cy + 8), 4)
        pygame.draw.line(s, (140, 90, 40), (cx + 12, cy - 8),
                         (cx - 12, cy + 8), 4)
        pygame.draw.line(s, (220, 220, 220), (cx - 8, cy + 8),
                         (cx + 8, cy - 8), 1)
    else:
        pygame.draw.rect(s, (90, 90, 100), (cx - 10, cy - 6, 20, 12),
                         border_radius=2)
    _WEAPON_ICONS[wid] = s
    return s


# -------------------------------------------------------------- minimap ---
MINIMAP_SIZE = S.MINIMAP_SIZE
MM_SCALE = MINIMAP_SIZE / S.WORLD_WIDTH


def draw_minimap(surface: pygame.Surface, game) -> None:
        x0 = S.SCREEN_WIDTH - MINIMAP_SIZE - 16
        y0 = 62
        box = pygame.Rect(x0 - 3, y0 - 3, MINIMAP_SIZE + 6, MINIMAP_SIZE + 6)
        pygame.draw.rect(surface, (10, 10, 12), box, border_radius=8)
        pygame.draw.rect(surface, (90, 90, 100), box, 2, border_radius=8)
        if game.map.minimap is not None:
            surface.blit(game.map.minimap, (x0, y0))

        vr = game.camera.view_rect
        view = pygame.Rect(x0 + vr.x * MM_SCALE, y0 + vr.y * MM_SCALE,
                           vr.w * MM_SCALE, vr.h * MM_SCALE).clip(box)
        pygame.draw.rect(surface, (140, 140, 160), view, 1)

        for pos, _ in game.map.lamp_light_positions():
            lx = x0 + pos.x * MM_SCALE
            ly = y0 + pos.y * MM_SCALE
            pygame.draw.circle(surface, (255, 220, 110),
                               (int(lx), int(ly)), 1)

        for loot in game.loots:
            lx = x0 + loot.pos.x * MM_SCALE
            ly = y0 + loot.pos.y * MM_SCALE
            if loot.kind == "chest":
                pygame.draw.circle(surface, (220, 180, 80),
                                   (int(lx), int(ly)), 3)
            else:
                surface.set_at((int(lx), int(ly)), S.color("ui_gold"))

        # Supply crates — small distinct square markers so the player can
        # spot them on the minimap without it looking noisy.
        sc = getattr(game, "supply_crates", None)
        if sc is not None:
            from supply_crate import SupplyCrate
            for c in sc.crates:
                lx = x0 + c.pos.x * MM_SCALE
                ly = y0 + c.pos.y * MM_SCALE
                col = SupplyCrate.KIND_COLORS.get(c.kind, (220, 180, 80))
                pygame.draw.rect(surface, col,
                                 (int(lx) - 2, int(ly) - 2, 4, 4))

        for z in game.zombies:
            zx = x0 + z.pos.x * MM_SCALE
            zy = y0 + z.pos.y * MM_SCALE
            if z.KIND == "boss":
                pygame.draw.circle(surface, (255, 210, 80),
                                   (int(zx), int(zy)), 4)
                pygame.draw.circle(surface, (10, 10, 12),
                                   (int(zx), int(zy)), 4, 1)
            elif z.KIND == "necromancer_boss":
                pygame.draw.circle(surface, (200, 100, 255),
                                   (int(zx), int(zy)), 4)
                pygame.draw.circle(surface, (10, 10, 12),
                                   (int(zx), int(zy)), 4, 1)
            else:
                pygame.draw.circle(surface, (210, 50, 50),
                                   (int(zx), int(zy)), 2)

        px = x0 + game.player.pos.x * MM_SCALE
        py = y0 + game.player.pos.y * MM_SCALE
        pygame.draw.circle(surface, (10, 10, 12), (int(px), int(py)), 4, 1)
        pygame.draw.circle(surface, (240, 250, 255), (int(px), int(py)), 3)
        import math as _m
        pa = game.player.angle
        ax = px + _m.cos(pa) * 6
        ay = py + _m.sin(pa) * 6
        pygame.draw.line(surface, (255, 240, 100),
                         (int(px), int(py)), (int(ax), int(ay)), 2)


def draw_crosshair(surface: pygame.Surface, pos: tuple[int, int],
                   spread_px: float = 6.0) -> None:
    x, y = int(pos[0]), int(pos[1])
    outline = (10, 10, 14)
    col = (250, 250, 240)
    gap = 4 + spread_px
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        start = (x + dx * gap, y + dy * gap)
        end = (x + dx * (gap + 8), y + dy * (gap + 8))
        pygame.draw.line(surface, outline, start, end, 4)
        pygame.draw.line(surface, col, start, end, 2)
    pygame.draw.circle(surface, outline, (x, y), 3)
    pygame.draw.circle(surface, col, (x, y), 1)


def draw_toasts(surface: pygame.Surface, game) -> None:
    y = S.SCREEN_HEIGHT - 110
    for text, remain in reversed(game.toasts[-5:]):
        alpha = min(1.0, remain / 0.5)
        img = get_font(16, True).render(text, True, (255, 235, 170))
        img.set_alpha(int(255 * alpha))
        pad_rect = img.get_rect(midright=(S.SCREEN_WIDTH - 224, int(y)))
        bg = pad_rect.inflate(18, 10)
        bsurf = pygame.Surface(bg.size, pygame.SRCALPHA)
        bsurf.fill((20, 20, 24, int(220 * alpha)))
        surface.blit(bsurf, bg)
        surface.blit(img, pad_rect)
        y -= 32


def draw_debug(surface: pygame.Surface, info: dict[str, Any]) -> None:
    """Draw a debug overlay with performance and state info."""
    y = 10
    for key, val in info.items():
        if isinstance(val, float):
            txt = f"{key}: {val:.1f}"
        else:
            txt = f"{key}: {val}"
        img = get_font(14, True).render(txt, True, (0, 255, 0))
        bg_rect = img.get_rect(topleft=(10, y)).inflate(6, 4)
        bg_surf = pygame.Surface(bg_rect.size, pygame.SRCALPHA)
        bg_surf.fill((0, 0, 0, 160))
        surface.blit(bg_surf, bg_rect)
        surface.blit(img, (13, y + 2))
        y += 22
