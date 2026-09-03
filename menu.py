"""All menu screens: main, pause, settings, shop, upgrade, game over."""
from __future__ import annotations

import math
import random

import pygame

import settings as S
from ui import Button, draw_text, get_font
from utils import format_time


class MenuSystem:
    """Immediate-mode screens; each draw_* returns an action str or None."""

    def __init__(self) -> None:
        self.embers: list[list[float]] = []
        for _ in range(60):
            self.embers.append([
                random.uniform(0, S.SCREEN_WIDTH),
                random.uniform(0, S.SCREEN_HEIGHT),
                random.uniform(12, 40), random.uniform(0.3, 1.0)])
        self.tree_offsets: dict[str, list[int]] = {}
        
        self.logo: pygame.Surface | None = None
        try:
            import os
            logo_path = os.path.join(S.ASSETS_DIR, "images", "logo_transparent.png")
            if os.path.exists(logo_path):
                raw_logo = pygame.image.load(logo_path).convert_alpha()
                w, h = raw_logo.get_size()
                target_w = 380
                target_h = int(h * (target_w / w))
                self.logo = pygame.transform.smoothscale(raw_logo, (target_w, target_h))
        except Exception as e:
            print(f"Error loading logo: {e}")

    # ------------------------------------------------------ background fx --
    def draw_background(self, surface: pygame.Surface, dt: float,
                        dim: float = 0.0) -> None:
        surface.fill(S.color("ui_bg"))
        vignette = pygame.Surface((S.SCREEN_WIDTH, S.SCREEN_HEIGHT))
        vignette.fill((30, 8, 8))
        surface.blit(vignette, (0, 0),
                     special_flags=pygame.BLEND_RGBA_ADD)
        for e in self.embers:
            e[1] -= e[2] * dt
            if e[1] < -10:
                e[0] = random.uniform(0, S.SCREEN_WIDTH)
                e[1] = S.SCREEN_HEIGHT + 10
            alpha = int(120 * e[3])
            col = (180 + int(60 * e[3]), 60, 40)
            pygame.draw.circle(surface, col, (int(e[0]), int(e[1])),
                               2 if e[3] > 0.6 else 1)

    def draw_title(self, surface: pygame.Surface, t: float) -> None:
        bob = math.sin(t * 1.6) * 3
        if self.logo:
            rect = self.logo.get_rect(center=(S.SCREEN_WIDTH / 2, 135 + bob))
            surface.blit(self.logo, rect)
            tag = "- POST-APOCALYPTIC TOP-DOWN SHOOTER -"
            draw_text(surface, tag, 15, S.SCREEN_WIDTH / 2,
                      rect.bottom + 10, align="center", color=S.color("ui_dim"))
        else:
            draw_text(surface, "ZOMBIE SURVIVAL", 64, S.SCREEN_WIDTH / 2,
                      90 + bob, align="center", bold=True,
                      color=(230, 60, 66))
            tag = "- POST-APOCALYPTIC TOP-DOWN SHOOTER -"
            draw_text(surface, tag, 15, S.SCREEN_WIDTH / 2,
                      150 + bob, align="center", color=S.color("ui_dim"))

    # ---------------------------------------------------------- main menu --
    def draw_main_menu(self, surface: pygame.Surface, dt: float,
                       t: float) -> tuple[str | None, list[Button]]:
        self.draw_background(surface, dt)
        self.draw_title(surface, t)
        cx = S.SCREEN_WIDTH / 2
        buttons = [
            Button("PLAY", (cx, 320), "start", accent=(200, 40, 50)),
            Button("SHOP", (cx, 384), "shop"),
            Button("SKILL TREE", (cx, 448), "skill_tree",
                   accent=(80, 160, 255)),
            Button("UPGRADES", (cx, 512), "upgrades_info"),
            Button("SETTINGS", (cx, 576), "settings"),
            Button("EXIT", (cx, 640), "quit", accent=(120, 120, 130)),
        ]
        hs = f"HIGH SCORE: {self._high_score}    TOTAL KILLS: {self._kills}"
        draw_text(surface, hs, 15, cx, S.SCREEN_HEIGHT - 40, align="center",
                  color=S.color("ui_dim"))
        return self._handle(buttons), buttons

    # -------------------------------------------------------------- pause --
    # Pause Menu sub-views. PAUSED is a single game state; the sub-view is
    # stored on Game.pause_view. All four screens render as OVERLAY only —
    # the world canvas underneath stays at 100% brightness, and the overlay
    # alpha is light enough that game rendering is unchanged in practice.

    def _draw_pause_overlay(self, surface: pygame.Surface) -> None:
        """Light dim layer over gameplay. Brightness stays 100% — this only
        gives enough contrast for the UI text without darkening the world."""
        overlay = pygame.Surface((S.SCREEN_WIDTH, S.SCREEN_HEIGHT),
                                 pygame.SRCALPHA)
        overlay.fill((8, 10, 14, 110))
        surface.blit(overlay, (0, 0))

    def _draw_pause_frame(self, surface: pygame.Surface, title: str,
                          subtitle: str = "",
                          panel_h: int | None = None) -> pygame.Rect:
        """Draw the standard pause header + frame. Returns the inner
        content rect (centered, responsive to screen width).

        ``panel_h`` lets callers request a taller card (e.g. the Settings
        sub-view needs extra room for the full GAMEPLAY + DISPLAY blocks
        now that FOOTSTEP DUST is in the toggle list).
        """
        sw, sh = S.SCREEN_WIDTH, S.SCREEN_HEIGHT
        cx = sw / 2

        # Outer frame card.
        panel_w = min(640, sw - 80)
        if panel_h is None:
            panel_h = min(560, sh - 120)
        panel = pygame.Rect(0, 0, panel_w, panel_h)
        panel.center = (cx, sh / 2)
        psurf = pygame.Surface(panel.size, pygame.SRCALPHA)
        psurf.fill((14, 16, 22, 230))
        pygame.draw.rect(psurf, (90, 90, 100), psurf.get_rect(),
                         2, border_radius=10)
        # Red accent stripe on the left edge — post-apoc identity.
        pygame.draw.rect(psurf, (200, 60, 70),
                         (0, 0, 6, panel_h), border_radius=3)
        surface.blit(psurf, panel.topleft)

        # Title (PAUSED always; sub-views override the title text).
        draw_text(surface, "PAUSED", 44, cx, panel.top + 50,
                  align="center", bold=True, color=(235, 235, 225))
        # Section subtitle inside the card.
        if subtitle:
            draw_text(surface, subtitle, 16, cx, panel.top + 92,
                      align="center", color=S.color("ui_gold"), bold=True)
        else:
            draw_text(surface, "// GAME SUSPENDED", 14, cx, panel.top + 92,
                      align="center", color=S.color("ui_dim"))
        # Divider.
        pygame.draw.line(surface, (70, 70, 78),
                       (panel.left + 24, panel.top + 116),
                       (panel.right - 24, panel.top + 116), 1)
        return panel

    def draw_pause(self, surface: pygame.Surface, game,
                   ) -> tuple[str | None, list[Button]]:
        """Dispatcher — keeps `game.draw()` calling one entry point."""
        view = getattr(game, "pause_view", "menu")
        if view == "settings":
            return self.draw_pause_settings(surface, game)
        if view == "controls":
            return self.draw_pause_controls(surface, game)
        if view == "leave":
            return self.draw_pause_leave_confirm(surface, game)
        return self.draw_pause_menu(surface, game)

    def draw_pause_menu(self, surface: pygame.Surface, game,
                        ) -> tuple[str | None, list[Button]]:
        self._draw_pause_overlay(surface)
        panel = self._draw_pause_frame(surface, "PAUSED")
        cx = S.SCREEN_WIDTH / 2

        # Buttons stacked inside the card, evenly spaced.
        bh = 56
        gap = 14
        n = 4
        total_h = bh * n + gap * (n - 1)
        start_y = panel.top + 150 + (panel.height - 150 - total_h) // 2

        buttons = [
            Button("RESUME GAME", (cx, start_y + 0 * (bh + gap)),
                   "resume", width=360, height=bh,
                   accent=S.color("ui_green")),
            Button("SETTINGS", (cx, start_y + 1 * (bh + gap)),
                   "pause_settings", width=360, height=bh),
            Button("CONTROLS", (cx, start_y + 2 * (bh + gap)),
                   "pause_controls", width=360, height=bh,
                   accent=(80, 160, 255)),
            Button("RETURN TO LOBBY", (cx, start_y + 3 * (bh + gap)),
                   "pause_leave", width=360, height=bh,
                   accent=S.color("ui_accent")),
        ]
        # Footer hint.
        draw_text(surface, "[ESC] RESUME", 13, cx, panel.bottom - 24,
                  align="center", color=S.color("ui_dim"))
        return self._handle(buttons), buttons

    def draw_pause_settings(self, surface: pygame.Surface, game,
                            ) -> tuple[str | None, list[Button]]:
        """Pause-scoped settings (overlay). Reuses the existing audio keys
        and adds gameplay toggles. All values persist to save.json."""
        self._draw_pause_overlay(surface)
        # Taller card: the GAMEPLAY section now lists 5 toggles
        # (SCREEN SHAKE, DAMAGE NUMBERS, HIT EFFECTS, FOOTSTEP DUST,
        # SHOW FPS) plus the DISPLAY block. The default 560px panel
        # overflows on a 720-tall screen, so request a 680px card so
        # every row — including FOOTSTEP DUST — sits inside the frame.
        panel = self._draw_pause_frame(
            surface, "PAUSED", "// SETTINGS", panel_h=680)
        cx = S.SCREEN_WIDTH / 2
        st = game.save.settings
        buttons: list[Button] = []

        # --- AUDIO block -------------------------------------------------
        audio_rows = [
            ("master_volume", "MASTER VOLUME", st["master_volume"]),
            ("music_volume",  "MUSIC VOLUME",  st["music_volume"]),
            ("sfx_volume",    "SFX VOLUME",    st["sfx_volume"]),
        ]
        y = panel.top + 138
        draw_text(surface, "AUDIO", 16, panel.left + 28, y,
                  color=S.color("ui_gold"), bold=True)
        y += 24
        for key, label, val in audio_rows:
            draw_text(surface, label, 15, panel.left + 28, y + 12, bold=True)
            bar = pygame.Rect(panel.left + 28, y + 34,
                              panel.width - 200, 12)
            pygame.draw.rect(surface, (40, 40, 46), bar, border_radius=4)
            pygame.draw.rect(surface, S.color("ui_accent"),
                             (bar.x, bar.y, int(bar.w * val), bar.h),
                             border_radius=4)
            draw_text(surface, f"{int(val * 100)}%", 13,
                      panel.right - 110, y + 18, align="center")
            buttons.append(Button("-", (panel.right - 160, y + 22),
                                  f"dec:{key}", width=38, height=28))
            buttons.append(Button("+", (panel.right - 60, y + 22),
                                  f"inc:{key}", width=38, height=28))
            y += 60

        # --- GAMEPLAY block ---------------------------------------------
        draw_text(surface, "GAMEPLAY", 16, panel.left + 28, y,
                  color=S.color("ui_gold"), bold=True)
        y += 26
        # Build toggle rows from a single source so adding a new toggle is
        # just appending to this list.
        toggles = [
            ("screen_shake",    "SCREEN SHAKE"),
            ("damage_numbers",  "DAMAGE NUMBERS"),
            ("hit_effects",     "HIT EFFECTS"),
            ("footstep_dust",   "FOOTSTEP DUST"),
            ("show_fps",        "SHOW FPS"),
        ]
        for key, label in toggles:
            val = bool(st.get(key, False))
            txt = f"{label}: {'ON' if val else 'OFF'}"
            btn = Button(txt, (panel.left + 28 + (panel.width - 56) / 2, y),
                         f"toggle:{key}",
                         width=panel.width - 56, height=30,
                         accent=S.color("ui_green") if val
                                else (90, 90, 96))
            buttons.append(btn)
            y += 34

        # --- DISPLAY block ----------------------------------------------
        draw_text(surface, "DISPLAY", 16, panel.left + 28, y,
                  color=S.color("ui_gold"), bold=True)
        y += 26
        fs_val = bool(st.get("fullscreen", False))
        fs_btn = Button(
            f"FULLSCREEN: {'ON' if fs_val else 'OFF'}",
            (panel.left + 28 + (panel.width - 56) / 2, y),
            "toggle_fullscreen",
            width=panel.width - 56, height=30,
            accent=S.color("ui_green") if fs_val else (90, 90, 96))
        buttons.append(fs_btn)
        y += 34

        idx = int(st.get("resolution_index", 0))
        if 0 <= idx < len(S.RESOLUTIONS):
            res = S.RESOLUTIONS[idx]
        else:
            res = (S.SCREEN_WIDTH, S.SCREEN_HEIGHT)
        res_btn = Button(
            f"RESOLUTION: {res[0]}x{res[1]}",
            (panel.left + 28 + (panel.width - 56) / 2, y),
            "cycle_resolution",
            width=panel.width - 56, height=30,
            accent=(80, 160, 255))
        buttons.append(res_btn)
        y += 38

        # Brightness is a permanent fixture — display-only label, never
        # affects actual rendering. Locked at 100% by design.
        bright_w = panel.width - 56
        bright = pygame.Rect(panel.left + 28, y, bright_w, 14)
        pygame.draw.rect(surface, (40, 40, 46), bright, border_radius=4)
        pygame.draw.rect(surface, S.color("ui_accent"), bright,
                         border_radius=4)  # full bar = 100%
        draw_text(surface, "BRIGHTNESS  100%", 13,
                  panel.left + 28 + bright_w / 2, y + 7,
                  align="center", bold=True)
        y += 32

        # Footer: BACK button + ESC hint, side-by-side.
        buttons.append(Button("BACK", (cx, panel.bottom - 32),
                              "pause_back", width=200, height=32,
                              accent=S.color("ui_dim")))
        draw_text(surface, "[ESC] BACK", 12,
                  panel.left + 28, panel.bottom - 22,
                  color=S.color("ui_dim"))
        return self._handle(buttons), buttons

    def draw_pause_controls(self, surface: pygame.Surface, game,
                            ) -> tuple[str | None, list[Button]]:
        """Read-only controls reference rendered over the gameplay overlay."""
        self._draw_pause_overlay(surface)
        panel = self._draw_pause_frame(surface, "PAUSED", "// CONTROLS")

        rows = [
            ("WASD",        "MOVE"),
            ("MOUSE",       "AIM"),
            ("LEFT CLICK",  "SHOOT"),
            ("R",           "RELOAD"),
            ("1 - 5",       "SWITCH WEAPON"),
            ("E (HOLD)",    "COLLECT LOOT"),
            ("ESC",         "PAUSE / RESUME"),
            ("F3",          "DEBUG OVERLAY"),
            ("F11",         "FULLSCREEN"),
        ]
        cx = S.SCREEN_WIDTH / 2
        col_key_x = panel.left + 60
        col_act_x = panel.left + 260
        y = panel.top + 140
        for key, action in rows:
            draw_text(surface, key, 17, col_key_x, y,
                      color=S.color("ui_gold"), bold=True)
            draw_text(surface, action, 17, col_act_x, y,
                      color=(235, 235, 225))
            y += 28

        buttons = [
            Button("BACK", (cx, panel.bottom - 32),
                   "pause_back", width=200, height=32,
                   accent=S.color("ui_dim")),
        ]
        draw_text(surface, "[ESC] BACK", 12,
                  panel.left + 28, panel.bottom - 22,
                  color=S.color("ui_dim"))
        return self._handle(buttons), buttons

    def draw_pause_leave_confirm(self, surface: pygame.Surface, game,
                                 ) -> tuple[str | None, list[Button]]:
        self._draw_pause_overlay(surface)
        panel = self._draw_pause_frame(surface, "PAUSED", "// CONFIRM")

        cx = S.SCREEN_WIDTH / 2
        # Centered text.
        ty = panel.top + 160
        draw_text(surface, "LEAVE GAME?", 30, cx, ty,
                  align="center", bold=True, color=S.color("ui_accent"))
        ty += 56
        draw_text(surface,
                  "Your current progress will be lost.",
                  16, cx, ty, align="center", color=S.color("ui_dim"))
        ty += 22
        draw_text(surface,
                  "(Your save and unlocks stay intact.)",
                  13, cx, ty, align="center", color=S.color("ui_dim"))

        # CANCEL + LEAVE side by side.
        by = panel.top + 300
        bw = 200
        gap = 40
        cancel_x = cx - bw - gap // 2
        leave_x = cx + gap // 2
        buttons = [
            Button("CANCEL", (cancel_x, by),
                   "pause_cancel_leave", width=bw, height=44,
                   accent=(120, 120, 130)),
            Button("LEAVE", (leave_x, by),
                   "pause_confirm_leave", width=bw, height=44,
                   accent=S.color("ui_accent")),
        ]
        draw_text(surface, "[ESC] CANCEL", 12,
                  panel.left + 28, panel.bottom - 22,
                  color=S.color("ui_dim"))
        return self._handle(buttons), buttons

    # ------------------------------------------------------------ settings --
    def draw_settings(self, surface: pygame.Surface, game,
                      ) -> tuple[str | None, list[Button]]:
        self.draw_background(surface, game.dt)
        draw_text(surface, "SETTINGS", 46, S.SCREEN_WIDTH / 2, 90,
                  align="center", bold=True)
        cx = S.SCREEN_WIDTH / 2
        st = game.save.settings
        buttons: list[Button] = []

        rows = [
            ("master_volume", "MASTER VOLUME", st["master_volume"]),
            ("music_volume", "MUSIC VOLUME", st["music_volume"]),
            ("sfx_volume", "SFX VOLUME", st["sfx_volume"]),
        ]
        y = 170
        for key, label, val in rows:
            draw_text(surface, label, 20, cx - 260, y + 14, bold=True)
            bar = pygame.Rect(cx - 40, y + 8, 240, 18)
            pygame.draw.rect(surface, (40, 40, 46), bar, border_radius=5)
            pygame.draw.rect(surface, S.color("ui_accent"),
                             (bar.x, bar.y, int(bar.w * val), bar.h),
                             border_radius=5)
            draw_text(surface, f"{int(val * 100)}%", 18, cx + 250, y + 17,
                      align="center")
            buttons.append(Button("-", (cx - 60, y + 16), f"dec:{key}",
                                  width=44, height=36))
            buttons.append(Button("+", (cx + 310, y + 16), f"inc:{key}",
                                  width=44, height=36))
            y += 70

        # GAMEPLAY toggles — share the same backing settings the Pause
        # Menu uses, so toggling in either place updates everywhere.
        toggles = [
            ("screen_shake",    "SCREEN SHAKE"),
            ("damage_numbers",  "DAMAGE NUMBERS"),
            ("hit_effects",     "HIT EFFECTS"),
            ("footstep_dust",   "FOOTSTEP DUST"),
        ]
        for key, label in toggles:
            val = bool(st.get(key, False))
            txt = f"{label}: {'ON' if val else 'OFF'}"
            buttons.append(Button(txt, (cx, y + 18), f"toggle:{key}",
                                  width=400, height=36,
                                  accent=S.color("ui_green") if val
                                         else (90, 90, 96)))
            y += 44

        fs = "FULLSCREEN: ON" if st["fullscreen"] else "FULLSCREEN: OFF"
        buttons.append(Button(fs, (cx - 100, y + 26), "toggle_fullscreen",
                              width=360))
        idx = int(st.get("resolution_index", 0))
        res = S.RESOLUTIONS[idx] if 0 <= idx < len(S.RESOLUTIONS) \
            else (S.SCREEN_WIDTH, S.SCREEN_HEIGHT)
        buttons.append(Button(f"RESOLUTION: {res[0]}x{res[1]}",
                              (cx + 290, y + 26), "cycle_resolution",
                              width=280))
        fps = "SHOW FPS: ON" if st["show_fps"] else "SHOW FPS: OFF"
        buttons.append(Button(fps, (cx - 195, y + 96), "toggle_fps",
                              width=280))
        buttons.append(Button("BACK", (cx + 195, y + 96), "back"))
        return self._handle(buttons), buttons

    # ---------------------------------------------------------------- shop --
    def draw_shop(self, surface: pygame.Surface, game,
                  entries: list[dict]) -> tuple[str | None, list[Button]]:
        self.draw_background(surface, game.dt)
        draw_text(surface, "SHOP", 42, S.SCREEN_WIDTH / 2, 56,
                  align="center", bold=True)
        draw_text(surface, f"COINS: ${game.player.coins}", 22,
                  S.SCREEN_WIDTH / 2, 104, align="center",
                  color=S.color("ui_green"), bold=True)
        buttons: list[Button] = []
        y = 150
        for entry in entries:
            price_txt = "OWNED" if entry["owned"] else f"${entry['price']}"
            affordable = entry["owned"] or game.player.coins >= entry["price"]
            col = S.color("ui_dim") if entry["owned"] else (
                S.color("ui_green") if affordable else S.color("ui_accent"))
            draw_text(surface, entry["label"], 19, 140, y + 24, bold=True)
            draw_text(surface, entry["detail"], 13, 380, y + 26,
                      color=S.color("ui_dim"))
            draw_text(surface, price_txt, 18, 900, y + 25, align="center",
                      color=col, bold=True)
            if not entry["owned"]:
                btn = Button("BUY", (1080, y + 25), f"buy:{entry['key']}",
                             width=110, height=40,
                             accent=S.color("ui_green") if affordable
                             else (90, 90, 96))
                buttons.append(btn)
            y += 64
        buttons.append(Button("BACK", (S.SCREEN_WIDTH / 2, y + 30), "back"))
        action = self._handle(buttons)
        return action, buttons

    # ------------------------------------------------------------- upgrade --
    def draw_upgrade(self, surface: pygame.Surface, game,
                     choices: list[str], texts: dict[str, str],
                     descs: dict[str, str] | None = None
                     ) -> tuple[str | None, list[Button]]:
        """Level Up screen.

        Brightness is locked at 100%: the world canvas stays fully visible
        behind this screen. We only paint a soft card panel behind the
        title + buttons so the text reads clearly. NO full-screen black
        overlay, NO fade-to-black, NO brightness reduction.
        """
        cx = S.SCREEN_WIDTH / 2

        n = max(1, len(choices))
        card_w = 640
        card_h = 60 + 92 * n + 30
        card = pygame.Rect(0, 0, card_w, card_h)
        card.center = (cx, S.SCREEN_HEIGHT / 2)

        card_surf = pygame.Surface(card.size, pygame.SRCALPHA)
        card_surf.fill((14, 18, 28, 170))
        pygame.draw.rect(card_surf, (80, 160, 255, 200),
                         card_surf.get_rect(), 2, border_radius=12)
        surface.blit(card_surf, card.topleft)

        accent = (90, 230, 130)
        title_y = card.top + 48
        draw_text(surface, "LEVEL UP!", 52, cx, title_y,
                  align="center", bold=True, color=accent)
        draw_text(surface,
                  f"LEVEL {game.player.level}  -  CHOOSE ONE"
                  f"  (press 1/2/3 or click)",
                  18, cx, title_y + 50, align="center",
                  color=S.color("ui_dim"))

        buttons: list[Button] = []
        descs = descs or {}
        y = card.top + 130
        for i, uid in enumerate(choices):
            label = texts.get(uid, uid)
            desc = descs.get(uid, "")
            btn = Button(label,
                         (cx, y), f"upgrade:{uid}",
                         width=560, height=70, accent=(80, 160, 255))
            buttons.append(btn)
            if desc:
                draw_text(surface, desc, 14, cx, y + 22,
                          align="center", color=S.color("ui_dim"))
            draw_text(surface, f"[{i + 1}]", 20, cx - 305, y,
                      align="center", color=(170, 230, 255), bold=True)
            y += 92
        return self._handle(buttons), buttons

    def draw_skill_tree(self, surface: pygame.Surface, game
                       ) -> tuple[str | None, list[Button]]:
        from upgrade import SKILL_BRANCHES
        self.draw_background(surface, game.dt)
        draw_text(surface, "SKILL TREE", 42, S.SCREEN_WIDTH / 2, 56,
                  align="center", bold=True)
        draw_text(surface, f"SKILL POINTS: {game.player.skill_points}",
                  22, S.SCREEN_WIDTH / 2, 104, align="center",
                  color=(170, 230, 255) if game.player.skill_points > 0
                  else S.color("ui_dim"), bold=True)
        buttons: list[Button] = []
        cx = S.SCREEN_WIDTH / 2
        branches = list(SKILL_BRANCHES.items())
        col_w = 360
        gap = 80
        start_x = (S.SCREEN_WIDTH - (col_w * len(branches) + gap * (len(branches) - 1))) // 2
        y = 170
        for i, (branch_name, skills) in enumerate(branches):
            bx = start_x + i * (col_w + gap)
            draw_text(surface, branch_name.upper(), 22, bx + col_w // 2, y,
                      align="center",
                      color=(255, 200, 80) if branch_name == "Combat"
                      else (110, 220, 130) if branch_name == "Survival"
                      else (90, 180, 255),
                      bold=True)
            row_y = y + 40
            for uid in skills:
                text = self._skill_text(uid)
                cur_lvl = game.player.upgrade_levels.get(uid, 0)
                limit = self._skill_limit(uid)
                maxed = limit and cur_lvl >= limit
                can_buy = game.player.skill_points > 0 and not maxed
                color = (170, 230, 255) if can_buy else S.color("ui_dim")
                draw_text(surface, text, 16, bx + 16, row_y + 14,
                          color=color, bold=can_buy)
                draw_text(surface, f"x{cur_lvl}"
                          + (f"/{limit}" if limit else ""),
                          14, bx + col_w - 14, row_y + 14,
                          align="topright",
                          color=S.color("ui_dim") if not maxed else (255, 200, 80))
                if can_buy:
                    btn = Button("LEARN", (bx + col_w - 70, row_y + 36),
                                 f"skill:{uid}", width=90, height=28,
                                 accent=(110, 220, 130))
                    buttons.append(btn)
                row_y += 64
        buttons.append(Button("BACK", (cx, S.SCREEN_HEIGHT - 60), "back"))
        return self._handle(buttons), buttons

    def _skill_text(self, uid: str) -> str:
        from upgrade import UpgradeSystem
        for u in UpgradeSystem.CATALOG:
            if u["id"] == uid:
                return u["text"]
        return uid

    def _skill_limit(self, uid: str) -> int | None:
        from upgrade import UpgradeSystem
        return UpgradeSystem.LIMITS.get(uid)

    def draw_upgrades_info(self, surface: pygame.Surface, game) -> \
            tuple[str | None, list[Button]]:
        from upgrade import UpgradeSystem
        self.draw_background(surface, game.dt)
        draw_text(surface, "UPGRADES & ACHIEVEMENTS", 34,
                  S.SCREEN_WIDTH / 2, 70, align="center", bold=True)
        p_lvls = getattr(game.player, "upgrade_levels", {})
        y = 130
        draw_text(surface, "-- UPGRADE LEVELS --", 17,
                  S.SCREEN_WIDTH / 2, y, align="center",
                  color=S.color("ui_dim"), bold=True)
        y += 32
        for u in UpgradeSystem.CATALOG:
            n = p_lvls.get(u["id"], 0)
            col = S.color("ui_green") if n else S.color("ui_dim")
            draw_text(surface, f"{u['text']:<22}", 15,
                      S.SCREEN_WIDTH / 2 - 20, y, align="topleft")
            draw_text(surface, f"x{n}", 15, S.SCREEN_WIDTH / 2 + 160, y,
                      align="topright", color=col)
            y += 26
        achievements = game.achievements
        total, got = achievements.count
        y += 16
        draw_text(surface, f"-- ACHIEVEMENTS {got}/{total} --", 17,
                  S.SCREEN_WIDTH / 2, y, align="center",
                  color=S.color("ui_gold"), bold=True)
        y += 32
        for d in achievements.DEFINITIONS:
            got_it = d["id"] in achievements.unlocked
            draw_text(surface,
                      f"[{'OK' if got_it else '  '}] {d['name']} - {d['desc']}",
                      13, S.SCREEN_WIDTH / 2, y, align="center",
                      color=S.color("ui_green") if got_it else S.color("ui_dim"))
            y += 22
        buttons = [Button("BACK", (S.SCREEN_WIDTH / 2, min(y + 30, 660)), "back")]
        return self._handle(buttons), buttons

    # ----------------------------------------------------------- game over --
    def draw_game_over(self, surface: pygame.Surface, stats: dict,
                       new_high: bool) -> tuple[str | None, list[Button]]:
        overlay = pygame.Surface((S.SCREEN_WIDTH, S.SCREEN_HEIGHT),
                                 pygame.SRCALPHA)
        overlay.fill((30, 6, 8, 215))
        surface.blit(overlay, (0, 0))
        draw_text(surface, "GAME OVER", 58, S.SCREEN_WIDTH / 2, 110,
                  align="center", bold=True, color=(230, 60, 66))
        if new_high:
            draw_text(surface, "NEW HIGH SCORE!", 20, S.SCREEN_WIDTH / 2, 165,
                      align="center", color=S.color("ui_gold"), bold=True)
        rows = [
            ("SCORE", stats.get("score", 0)),
            ("KILLS", stats.get("kills", 0)),
            ("WAVE", stats.get("wave", 1)),
            ("LEVEL", stats.get("level", 1)),
            ("TIME", format_time(stats.get("survival_time", 0))),
            ("COINS", f"${stats.get('coins', 0)}"),
        ]
        y = 210
        for label, val in rows:
            draw_text(surface, label, 20, S.SCREEN_WIDTH / 2 - 120, y,
                      align="midleft", color=S.color("ui_dim"))
            draw_text(surface, str(val), 22, S.SCREEN_WIDTH / 2 + 120, y,
                      align="midright", bold=True)
            y += 38
        cx = S.SCREEN_WIDTH / 2
        buttons = [
            Button("RESTART", (cx - 180, 560), "restart", accent=(80, 160, 255)),
            Button("SHOP", (cx, 560), "shop_from_over"),
            Button("MAIN MENU", (cx + 180, 560), "menu"),
        ]
        return self._handle(buttons), buttons

    # -------------------------------------------------------- wave banner --
    def draw_wave_announce(self, surface: pygame.Surface,
                           text: str, timer: float, boss: bool) -> None:
        alpha = min(1.0, timer / 0.5)
        scale_in = max(0.6, min(1.0, (2.5 - timer) * 2))
        size = int((54 if boss else 44) * scale_in)
        img = get_font(size, True).render(
            text, True, (255, 90, 80) if boss else (235, 235, 225))
        img.set_alpha(int(255 * alpha))
        sub = get_font(16).render(
            "!! BOSS WAVE !!" if boss else "GET READY", True,
            (255, 200, 90) if boss else S.color("ui_dim"))
        sub.set_alpha(int(255 * alpha))
        rect = img.get_rect(center=(S.SCREEN_WIDTH / 2, 240))
        surface.blit(img, rect)
        surface.blit(sub, sub.get_rect(center=(S.SCREEN_WIDTH / 2, 295)))

    # ------------------------------------------------------------ helpers --
    @staticmethod
    def _handle(buttons: list[Button]) -> str | None:
        """Update hover anim, draw, then return the clicked action."""
        action: str | None = None
        mp = pygame.mouse.get_pos()
        clicked = pygame.mouse.get_pressed(3)[0]
        surface = pygame.display.get_surface()
        for b in buttons:
            b.update(1 / 60.0, mp)
            b.draw(surface)
            if clicked and b.rect.collidepoint(mp):
                action = b.action
                b.pressed_t = 1.0
        return action

    _high_score = 0
    _kills = 0

    def set_profile(self, high_score: int, total_kills: int) -> None:
        MenuSystem._high_score = high_score
        MenuSystem._kills = total_kills
