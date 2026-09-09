// src/game/menu.ts
// MenuSystem: main / pause / settings / shop / upgrade / game over.
// Mirrors menu.py. Handles layouts, rendering button objects, and hover bounds.

import { AchievementSystem } from "./achievement";
import { formatTime } from "./utils";
import { drawText, Button, roundRect, drawShopIcon } from "./ui";
import { color } from "./colors";
import { renderScale } from "./pixelArt";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "./settings";
import { SKILL_BRANCHES, branchForSkill, LEVELUP_PICK_LOCK } from "./upgrade";
import { MOD_CATALOG } from "./mods";
import { BOMB_PACK_AMOUNT, BOMB_PACK_PRICE } from "./grenade";
import { MAX_UFO_OWNED, UFO_CATALOG } from "./ufo";
import type { IGame } from "./types";

interface Ember {
  x: number;
  y: number;
  r: number;
  a: number;
  v: number;
}

interface Embers {
  embers: Ember[];
  t: number;
}

function makeEmbers(): Embers {
  const embers: Ember[] = [];
  for (let i = 0; i < 60; i++) {
    embers.push({
      x: Math.random() * SCREEN_WIDTH,
      y: Math.random() * SCREEN_HEIGHT,
      r: 12 + Math.random() * 28,
      a: 0.3 + Math.random() * 0.7,
      v: 12 + Math.random() * 28,
    });
  }
  return { embers, t: 0 };
}

/** Split `text` into lines that fit `maxW` at the given drawText size. */
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  maxW: number,
): string[] {
  if (!text) return [];
  ctx.font = `bold ${size}px ui-monospace, monospace`;
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Draw `text` wrapped to `maxW` at (x, y): lines only break when the text
 * really runs out of horizontal space, and at most `maxLines` are drawn.
 * Returns how many lines were drawn. Text is measured with the actual
 * canvas font, so nothing can overflow the zone or clip mid-word.
 */
function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  maxW: number,
  maxLines: number,
  lineH: number,
  col: string,
): number {
  const lines = wrapLines(ctx, text, size, maxW).slice(0, maxLines);
  for (const line of lines) {
    drawText(ctx, line, x, y, size, col, "left", "top");
    y += lineH;
  }
  return lines.length;
}

export class MenuSystem {
  private embers: Embers = makeEmbers();
  static _highScore = 0;
  static _kills = 0;
  activeShopTab: "weapons" | "supplies" | "upgrades" | "mods" | "ufos" = "weapons";

  setProfile(highScore: number, totalKills: number): void {
    MenuSystem._highScore = highScore;
    MenuSystem._kills = totalKills;
  }

  private drawBackground(ctx: CanvasRenderingContext2D, dt: number): void {
    const width = ctx.canvas.width / renderScale();
    const height = ctx.canvas.height / renderScale();

    ctx.fillStyle = color("ui_bg");
    ctx.fillRect(0, 0, width, height);

    // Vignette
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      100,
      width / 2,
      height / 2,
      Math.max(width, height),
    );
    grad.addColorStop(0, "rgba(30,8,8,0)");
    grad.addColorStop(1, "rgba(30,8,8,0.6)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Embers
    this.embers.t += dt;
    for (const e of this.embers.embers) {
      e.y -= e.v * dt;
      if (e.y < -10) {
        e.x = Math.random() * width;
        e.y = height + 10;
      }
      ctx.globalAlpha = e.a * 0.6;
      ctx.fillStyle = `rgb(${180 + Math.floor(60 * e.a)}, 60, 40)`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.a > 0.6 ? 2 : 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawTitle(ctx: CanvasRenderingContext2D, t: number): void {
    const width = ctx.canvas.width / renderScale();
    const bob = Math.sin(t * 1.6) * 3;
    drawText(
      ctx,
      "ZOMBIE SURVIVAL",
      width / 2,
      90 + bob,
      64,
      "#E63C42",
      "center",
    );
    drawText(
      ctx,
      "- POST-APOCALYPTIC TOP-DOWN SHOOTER -",
      width / 2,
      150 + bob,
      15,
      color("ui_dim"),
      "center",
    );
  }

  drawMainMenu(
    ctx: CanvasRenderingContext2D,
    game: IGame,
    t: number,
  ): { action: string | null; buttons: Button[] } {
    const width = ctx.canvas.width / renderScale();
    const height = ctx.canvas.height / renderScale();
    const dt = game.dt;

    this.drawBackground(ctx, dt);
    this.drawTitle(ctx, t);
    const cx = width / 2;
    const buttons = [
      new Button("PLAY", cx - 150, 326, 300, 54, "start", "#C82832"),
      new Button("SHOP", cx - 150, 388, 300, 54, "shop"),
      new Button("UPGRADES", cx - 150, 450, 300, 54, "upgrades_info"),
      new Button("SETTINGS", cx - 150, 512, 300, 54, "settings"),
      new Button("↩ LOBBY", cx - 150, 574, 300, 54, "leave_to_lobby", "#787882"),
    ];
    for (const b of buttons) {
      b.update(dt, game.input.mouseX, game.input.mouseY, false);
      b.draw(ctx);
    }
    drawText(
      ctx,
      `HIGH SCORE: ${MenuSystem._highScore}    TOTAL KILLS: ${MenuSystem._kills}`,
      cx,
      height - 40,
      15,
      color("ui_dim"),
      "center",
    );
    return { action: null, buttons };
  }

  drawPause(ctx: CanvasRenderingContext2D, game: IGame): { action: string | null; buttons: Button[] } {
    const width = ctx.canvas.width / renderScale();
    const height = ctx.canvas.height / renderScale();
    const dt = game.dt;
    const mx = game.input.mouseX;
    const my = game.input.mouseY;

    this.drawPauseBackground(ctx, width, height);

    const cx = width / 2;
    const cy = height / 2;

    // ── Panel container ────────────────────────────────────────────────────
    const panelW = 360;
    const panelH = 451;
    const panelX = cx - panelW / 2;
    const panelY = cy - panelH / 2 - 10;

    // Panel shadow
    ctx.save();
    ctx.shadowColor = "rgba(200, 30, 40, 0.25)";
    ctx.shadowBlur = 30;
    ctx.fillStyle = "rgba(10, 10, 14, 0.92)";
    roundRect(ctx, panelX, panelY, panelW, panelH, 12);
    ctx.fill();
    ctx.restore();

    // Panel border
    ctx.strokeStyle = color("ui_accent");
    ctx.lineWidth = 2;
    roundRect(ctx, panelX, panelY, panelW, panelH, 12);
    ctx.stroke();

    // Corner accents were removed: the 4 gold corner brackets on the panel
    // border are no longer drawn (clean centered panel only).

    // ── Title ─────────────────────────────────────────────────────────────
    const titleY = panelY + 38;
    drawText(ctx, "PAUSED", cx, titleY, 38, "#E63C42", "center", "middle");

    // Separator line with centre glow
    const sepY = panelY + 66;
    const sepGrad = ctx.createLinearGradient(panelX + 20, sepY, panelX + panelW - 20, sepY);
    sepGrad.addColorStop(0, "rgba(200,40,50,0)");
    sepGrad.addColorStop(0.3, "rgba(200,40,50,0.6)");
    sepGrad.addColorStop(0.5, "rgba(230,60,66,1)");
    sepGrad.addColorStop(0.7, "rgba(200,40,50,0.6)");
    sepGrad.addColorStop(1, "rgba(200,40,50,0)");
    ctx.strokeStyle = sepGrad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(panelX + 20, sepY);
    ctx.lineTo(panelX + panelW - 20, sepY);
    ctx.stroke();

    // ── Buttons ───────────────────────────────────────────────────────────
    const btnW = 280;
    const btnH = 42;
    const btnX = cx - btnW / 2;
    const btnStartY = panelY + 82;
    const btnGap = 50;

    let saveBtnText = "💾 SAVE GAME";
    let saveBtnAction = "save_game";
    let saveBtnColor = color("ui_accent");

    if (game.saveButtonState === "saving") {
      saveBtnText = "SAVING...";
      saveBtnAction = "none";
      saveBtnColor = "#787882";
    } else if (game.saveButtonState === "success") {
      saveBtnText = "SAVED ✓";
      saveBtnAction = "none";
      saveBtnColor = color("ui_green");
    } else if (game.saveButtonState === "error") {
      saveBtnText = "SAVE FAILED";
      saveBtnAction = "none";
      saveBtnColor = "#FF3C46";
    }

    const hasPoints = (game.player?.skillPoints ?? 0) > 0;
    const buttons = [
      new Button("▶ RESUME GAME",     btnX, btnStartY + 0 * btnGap, btnW, btnH, "resume",        color("ui_green")),
      new Button(saveBtnText,         btnX, btnStartY + 1 * btnGap, btnW, btnH, saveBtnAction,   saveBtnColor),
      new Button("🛒 SHOP",            btnX, btnStartY + 2 * btnGap, btnW, btnH, "pause_shop",     color("ui_gold")),
      new Button("✨ SKILL TREE",      btnX, btnStartY + 3 * btnGap, btnW, btnH, "skill_tree",    hasPoints ? color("ui_blue") : "#5A5A62"),
      new Button("⚙ SETTINGS",        btnX, btnStartY + 4 * btnGap, btnW, btnH, "pause_settings"),
      new Button("🎮 CONTROLS",        btnX, btnStartY + 5 * btnGap, btnW, btnH, "pause_controls"),
      new Button("↩ RETURN TO LOBBY", btnX, btnStartY + 6 * btnGap, btnW, btnH, "pause_leave",   "#787882"),
    ];

    for (const b of buttons) {
      b.update(dt, mx, my, false);
      b.draw(ctx);
    }

    // ── ESC hint ──────────────────────────────────────────────────────────
    drawText(ctx, "ESC — RESUME", cx, panelY + panelH + 18, 12, color("ui_dim"), "center", "top");

    return { action: null, buttons };
  }

  drawPauseBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Lighter scrim than the old 0.85-black so the game remains visible behind
    // the menu. The scrim is pure UI — game rendering itself is never touched,
    // so brightness is always 100%.
    ctx.fillStyle = "rgba(8,8,10,0.45)";
    ctx.fillRect(0, 0, width, height);
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      80,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.7,
    );
    grad.addColorStop(0, "rgba(60,12,18,0.18)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }

  drawPauseSettings(
    ctx: CanvasRenderingContext2D,
    game: IGame,
  ): { action: string | null; buttons: Button[] } {
    const width = ctx.canvas.width / renderScale();
    const height = ctx.canvas.height / renderScale();
    const dt = game.dt;
    const mx = game.input.mouseX;
    const my = game.input.mouseY;

    this.drawPauseBackground(ctx, width, height);

    const cx = width / 2;
    const cy = height / 2;

    // ── Panel container ────────────────────────────────────────────────────
    const PANEL_W = Math.min(580, width - 40);
    const PANEL_X = (width - PANEL_W) / 2;
    // Six Gameplay toggles now (SCREEN SHAKE, DAMAGE NUMBERS, HIT EFFECTS,
    // FOOTSTEP DUST, WINDOW LIGHTS, SHOW FPS), so rows are compacted and the
    // panel grows to fit them inside the viewport.
    const ROW_H = 34;
    const AUDIO_ROWS = 4;
    const GAMEPLAY_ROWS = 6;
    const DISPLAY_ROWS = 2; // fullscreen + brightness (locked 100%)
    const estimatedContentH = 40 + (AUDIO_ROWS * (ROW_H + 6)) + 36 + (GAMEPLAY_ROWS * (ROW_H + 4)) + 22 + 36 + (DISPLAY_ROWS * (ROW_H + 4)) + 22 + 60;
    const panelH = Math.min(estimatedContentH, height - 30);
    const panelY = cy - panelH / 2;

    ctx.save();
    ctx.shadowColor = "rgba(200, 30, 40, 0.2)";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "rgba(10, 10, 14, 0.95)";
    roundRect(ctx, PANEL_X, panelY, PANEL_W, panelH, 12);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = color("ui_accent");
    ctx.lineWidth = 2;
    roundRect(ctx, PANEL_X, panelY, PANEL_W, panelH, 12);
    ctx.stroke();

    // ── Title ─────────────────────────────────────────────────────────────
    drawText(ctx, "SETTINGS", cx, panelY + 32, 28, "#E63C42", "center", "middle");
    // Separator
    ctx.strokeStyle = "rgba(200,40,50,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PANEL_X + 20, panelY + 52); ctx.lineTo(PANEL_X + PANEL_W - 20, panelY + 52); ctx.stroke();

    const buttons: Button[] = [];
    const st = game.save.settings;
    let y = panelY + 66;

    // ── AUDIO ──────────────────────────────────────────────────────────────
    drawText(ctx, "AUDIO", PANEL_X + 12, y + 8, 12, color("ui_gold"), "left", "middle");
    y += 26;
    for (const [key, label] of [
      ["master_volume", "MASTER VOLUME"],
      ["music_volume", "MUSIC VOLUME"],
      ["sfx_volume", "SFX VOLUME"],
    ] as const) {
      const val = st[key];
      const rowY = y;
      drawText(ctx, label, PANEL_X + 12, rowY + ROW_H / 2, 13, undefined, "left", "middle");
      const barX = PANEL_X + 210;
      const barW = PANEL_W - 210 - 120;
      // Bar track
      ctx.fillStyle = "#1E1E26";
      ctx.fillRect(barX, rowY + ROW_H / 2 - 6, barW, 12);
      // Bar fill with gradient
      if (val > 0) {
        const bgrad = ctx.createLinearGradient(barX, 0, barX + barW * val, 0);
        bgrad.addColorStop(0, "#992030");
        bgrad.addColorStop(1, color("ui_accent"));
        ctx.fillStyle = bgrad;
        ctx.fillRect(barX, rowY + ROW_H / 2 - 6, barW * val, 12);
      }
      // Value
      drawText(ctx, `${Math.floor(val * 100)}%`, barX + barW + 16, rowY + ROW_H / 2, 13, color("ui_gold"), "left", "middle");
      
      // −/+ buttons
      const decBtn = new Button("-", barX - 42, rowY + 4, 34, ROW_H - 8, `dec:${key}`);
      const incBtn = new Button("+", barX + barW + 54, rowY + 4, 34, ROW_H - 8, `inc:${key}`, color("ui_green"));
      decBtn.update(dt, mx, my, false); decBtn.draw(ctx);
      incBtn.update(dt, mx, my, false); incBtn.draw(ctx);
      buttons.push(decBtn, incBtn);

      // Virtual button covering the slider bar area for click/drag hit testing
      const sliderBtn = new Button("", barX, rowY + 4, barW, ROW_H - 8, `slider:${key}`);
      sliderBtn.update(dt, mx, my, false);
      buttons.push(sliderBtn);

      y += ROW_H + 4;
    }

    // MUTE ALL Row
    const isMuted = st.muted;
    drawText(ctx, "MUTE ALL", PANEL_X + 12, y + ROW_H / 2, 13, undefined, "left", "middle");
    const muteBtn = new Button(
      isMuted ? "MUTED" : "UNMUTE",
      PANEL_X + PANEL_W - 120,
      y + 4,
      108,
      ROW_H - 8,
      "toggle_mute",
      isMuted ? color("ui_green") : "#4A4A52"
    );
    // Status indicator dot
    ctx.fillStyle = isMuted ? color("ui_green") : "#4A4A52";
    ctx.beginPath();
    ctx.arc(PANEL_X + PANEL_W - 130, y + ROW_H / 2, 4, 0, Math.PI * 2);
    ctx.fill();

    muteBtn.update(dt, mx, my, false);
    muteBtn.draw(ctx);
    buttons.push(muteBtn);

    // Row divider
    ctx.strokeStyle = "rgba(60,60,70,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PANEL_X + 12, y + ROW_H + 2); ctx.lineTo(PANEL_X + PANEL_W - 12, y + ROW_H + 2); ctx.stroke();

    y += ROW_H + 6;

    // ── GAMEPLAY ───────────────────────────────────────────────────────────
    drawText(ctx, "GAMEPLAY", PANEL_X + 12, y + 8, 12, color("ui_gold"), "left", "middle");
    y += 26;

    const toggleRow = (label: string, on: boolean, action: string) => {
      drawText(ctx, label, PANEL_X + 12, y + ROW_H / 2, 13, undefined, "left", "middle");
      const toggleBtn = new Button(
        on ? "ON" : "OFF",
        PANEL_X + PANEL_W - 90,
        y + 4,
        78,
        ROW_H - 8,
        action,
        on ? color("ui_green") : "#4A4A52",
      );
      // Status indicator dot
      ctx.fillStyle = on ? color("ui_green") : "#4A4A52";
      ctx.beginPath();
      ctx.arc(PANEL_X + PANEL_W - 100, y + ROW_H / 2, 4, 0, Math.PI * 2);
      ctx.fill();
      toggleBtn.update(dt, mx, my, false);
      toggleBtn.draw(ctx);
      buttons.push(toggleBtn);
      // Row divider
      ctx.strokeStyle = "rgba(60,60,70,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PANEL_X + 12, y + ROW_H + 2); ctx.lineTo(PANEL_X + PANEL_W - 12, y + ROW_H + 2); ctx.stroke();
      y += ROW_H + 4;
    };

    toggleRow("SCREEN SHAKE",   st.screen_shake,    "toggle_screen_shake");
    toggleRow("DAMAGE NUMBERS", st.damage_numbers,  "toggle_damage_numbers");
    toggleRow("HIT EFFECTS",    st.hit_effects,     "toggle_hit_effects");
    toggleRow("FOOTSTEP DUST",  st.footstep_dust,   "toggle_footstep_dust");
    toggleRow("WINDOW LIGHTS",  st.window_lights,   "toggle_window_lights");
    toggleRow("SHOW FPS",       st.show_fps,        "toggle_fps");
    y += 8;

    // ── DISPLAY ────────────────────────────────────────────────────────────
    drawText(ctx, "DISPLAY", PANEL_X + 12, y + 8, 12, color("ui_gold"), "left", "middle");
    y += 26;
    toggleRow("FULLSCREEN", st.fullscreen, "toggle_fullscreen");

    // BRIGHTNESS — locked at 100% per spec. Read-only display.
    drawText(ctx, "BRIGHTNESS", PANEL_X + 12, y + ROW_H / 2, 13, undefined, "left", "middle");
    const bBarX = PANEL_X + 210;
    const bBarW = PANEL_W - 210 - 120;
    ctx.fillStyle = "#1E1E26";
    ctx.fillRect(bBarX, y + ROW_H / 2 - 6, bBarW, 12);
    // Full gold bar = 100% always
    const fullGrad = ctx.createLinearGradient(bBarX, 0, bBarX + bBarW, 0);
    fullGrad.addColorStop(0, "#8A6000");
    fullGrad.addColorStop(1, color("ui_gold"));
    ctx.fillStyle = fullGrad;
    ctx.fillRect(bBarX, y + ROW_H / 2 - 6, bBarW, 12);
    drawText(ctx, "100%", bBarX + bBarW + 16, y + ROW_H / 2, 13, color("ui_gold"), "left", "middle");
    drawText(ctx, "LOCKED", bBarX - 42, y + ROW_H / 2, 10, color("ui_dim"), "center", "middle");
    y += ROW_H + 12;

    // ── BACK button ────────────────────────────────────────────────────────
    const backBtn = new Button("BACK", cx - 110, y + 4, 220, 44, "pause_back");
    backBtn.update(dt, mx, my, false);
    backBtn.draw(ctx);
    buttons.push(backBtn);

    return { action: null, buttons };
  }

  drawPauseControls(ctx: CanvasRenderingContext2D, game: IGame): { action: string | null; buttons: Button[] } {
    const width = ctx.canvas.width / renderScale();
    const height = ctx.canvas.height / renderScale();
    const dt = game.dt;
    const mx = game.input.mouseX;
    const my = game.input.mouseY;

    this.drawPauseBackground(ctx, width, height);

    const cx = width / 2;
    const cy = height / 2;

    const rows: [string, string][] = [
      ["W A S D",   "Di chuyển"],
      ["MOUSE",     "Ngắm bắn"],
      ["LEFT CLICK","Bắn"],
      ["R",         "Thay đạn"],
      ["1 – 5",     "Đổi súng theo danh sách"],
      ["E  (HOLD)", "Hút nhanh Loot quanh người"],
      ["F",         "Ném bom (nổ theo vùng)"],
      ["ESC",       "Tạm dừng"],
    ];

    const ROW_H = 40;
    const PANEL_W = Math.min(500, width - 60);
    const PANEL_H = 60 + rows.length * ROW_H + 70;
    const PANEL_X = cx - PANEL_W / 2;
    const PANEL_Y = cy - PANEL_H / 2;

    // Panel background
    ctx.save();
    ctx.shadowColor = "rgba(200, 30, 40, 0.2)";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "rgba(10, 10, 14, 0.95)";
    roundRect(ctx, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 12);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = color("ui_accent");
    ctx.lineWidth = 2;
    roundRect(ctx, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 12);
    ctx.stroke();

    // Title
    drawText(ctx, "CONTROLS", cx, PANEL_Y + 30, 26, "#E63C42", "center", "middle");
    ctx.strokeStyle = "rgba(200,40,50,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PANEL_X + 20, PANEL_Y + 50); ctx.lineTo(PANEL_X + PANEL_W - 20, PANEL_Y + 50); ctx.stroke();

    let y = PANEL_Y + 64;
    for (const [key, action] of rows) {
      // Key badge
      const keyW = 130;
      const keyX = PANEL_X + 16;
      ctx.fillStyle = "#1E1E28";
      roundRect(ctx, keyX, y + 4, keyW, ROW_H - 8, 6);
      ctx.fill();
      ctx.strokeStyle = color("ui_gold");
      ctx.lineWidth = 1;
      roundRect(ctx, keyX, y + 4, keyW, ROW_H - 8, 6);
      ctx.stroke();
      drawText(ctx, key, keyX + keyW / 2, y + ROW_H / 2, 13, color("ui_gold"), "center", "middle");
      // Action label
      drawText(ctx, action, PANEL_X + PANEL_W - 16, y + ROW_H / 2, 14, "#DEDED6", "right", "middle");
      // Row divider
      ctx.strokeStyle = "rgba(50,50,60,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PANEL_X + 16, y + ROW_H); ctx.lineTo(PANEL_X + PANEL_W - 16, y + ROW_H); ctx.stroke();
      y += ROW_H;
    }

    const backBtn = new Button("BACK", cx - 110, y + 16, 220, 44, "pause_back");
    backBtn.update(dt, mx, my, false);
    backBtn.draw(ctx);

    const buttons = [backBtn];
    return { action: null, buttons };
  }

  drawPauseLeaveConfirm(ctx: CanvasRenderingContext2D, game: IGame): { action: string | null; buttons: Button[] } {
    const width = ctx.canvas.width / renderScale();
    const height = ctx.canvas.height / renderScale();
    const dt = game.dt;
    const mx = game.input.mouseX;
    const my = game.input.mouseY;

    this.drawPauseBackground(ctx, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const boxW = Math.min(480, width - 40);
    const boxH = 240;
    const boxX = cx - boxW / 2;
    const boxY = cy - boxH / 2;

    // Modal box with shadow
    ctx.save();
    ctx.shadowColor = "rgba(200, 30, 40, 0.35)";
    ctx.shadowBlur = 28;
    ctx.fillStyle = "#12121A";
    roundRect(ctx, boxX, boxY, boxW, boxH, 14);
    ctx.fill();
    ctx.restore();

    // Border
    ctx.strokeStyle = color("ui_accent");
    ctx.lineWidth = 2;
    roundRect(ctx, boxX, boxY, boxW, boxH, 14);
    ctx.stroke();

    // Top accent bar
    ctx.fillStyle = color("ui_accent");
    roundRect(ctx, boxX, boxY, boxW, 6, 14);
    ctx.fill();

    // Icon / warning symbol
    ctx.fillStyle = color("ui_accent");
    ctx.font = "bold 28px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", cx, boxY + 44);

    drawText(ctx, "LEAVE GAME?", cx, boxY + 80, 26, "#E63C42", "center", "middle");
    drawText(ctx, "Your current progress will be lost.", cx, boxY + 118, 13, color("ui_dim"), "center", "middle");
    drawText(ctx, "Are you sure?", cx, boxY + 140, 13, color("ui_dim"), "center", "middle");

    const cancelBtn = new Button("CANCEL", cx - boxW / 2 + 24, boxY + boxH - 74, (boxW / 2) - 34, 50, "pause_back", color("ui_gold"));
    const leaveBtn  = new Button("LEAVE",  cx + 10,              boxY + boxH - 74, (boxW / 2) - 34, 50, "leave_to_lobby", color("ui_accent"));

    cancelBtn.update(dt, mx, my, false); cancelBtn.draw(ctx);
    leaveBtn.update(dt, mx, my, false);  leaveBtn.draw(ctx);

    const buttons = [cancelBtn, leaveBtn];
    return { action: null, buttons };
  }

  drawPauseShop(ctx: CanvasRenderingContext2D, game: IGame): { action: string | null; buttons: Button[] } {
    const width = ctx.canvas.width / renderScale();
    const height = ctx.canvas.height / renderScale();
    const dt = game.dt;
    const mx = game.input.mouseX;
    const my = game.input.mouseY;

    this.drawPauseBackground(ctx, width, height);

    const cx = width / 2;
    const cy = height / 2;

    // Responsive: the shop is designed for a 600x480 panel centred on the
    // screen. On smaller viewports (short laptop windows, tablet or mobile
    // landscape) the whole shop scales about its centre so no card, text or
    // the BACK row ever clips or overlaps. K === 1 on every normal desktop
    // size, so desktop rendering stays pixel-identical.
    const K = Math.max(
      0.5,
      Math.min(1, (width - 48) / 660, (height - 48) / 540),
    );
    if (K < 1) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(K, K);
      ctx.translate(-cx, -cy);
    }
    // Pointer mapped into the shop's logical space (used for hover feedback).
    const hx = cx + (mx - cx) / K;
    const hy = cy + (my - cy) / K;
    
    // Panel container
    const PANEL_W = 600;
    const PANEL_H = 480;
    const PANEL_X = cx - PANEL_W / 2;
    const PANEL_Y = cy - PANEL_H / 2;

    ctx.save();
    ctx.shadowColor = "rgba(200, 30, 40, 0.25)";
    ctx.shadowBlur = 30;
    ctx.fillStyle = "rgba(10, 10, 14, 0.95)";
    roundRect(ctx, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 12);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = color("ui_accent");
    ctx.lineWidth = 2;
    roundRect(ctx, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 12);
    ctx.stroke();

    // Title & Cash
    drawText(ctx, "BLACK MARKET", cx, PANEL_Y + 24, 28, "#E63C42", "center", "middle");
    drawText(ctx, `CASH: $${game.player!.coins}`, cx, PANEL_Y + 54, 18, color("ui_green"), "center", "middle");

    const buttons: Button[] = [];
    const p = game.player!;

    // Category Tabs: WEAPONS, SUPPLIES, UPGRADES, MODS, UFO
    const tabGap = 12;
    const categories: Array<"weapons" | "supplies" | "upgrades" | "mods" | "ufos"> = [
      "weapons",
      "supplies",
      "upgrades",
      "mods",
      "ufos",
    ];
    // Shrink tabs so all five fit inside the 600px panel without overflow.
    const tabW = Math.min(
      130,
      Math.floor((PANEL_W - 24 - (categories.length - 1) * tabGap) / categories.length),
    );
    const tabH = 34;
    const totalTabW = categories.length * tabW + (categories.length - 1) * tabGap;
    const tabStartX = cx - totalTabW / 2;
    const tabY = PANEL_Y + 76;
    categories.forEach((cat, idx) => {
      const active = this.activeShopTab === cat;
      const tX = tabStartX + idx * (tabW + tabGap);
      const btn = new Button(
        cat.toUpperCase(),
        tX,
        tabY,
        tabW,
        tabH,
        `shop_tab:${cat}`,
        active ? color("ui_gold") : color("ui_dim")
      );
      btn.update(dt, hx, hy, false);
      btn.draw(ctx);
      buttons.push(btn);
    });

    // Content Grid based on active tab. Every tab lays out inside
    // [gridTop, gridBottom], a fixed slot that ends well above the BACK
    // footer row — no tab's cards can ever run under the BACK button.
    const gridX = cx - 275;
    const gridY = PANEL_Y + 120; // content slot: gridY..(PANEL_Y+420)
    const cardW = 270;
    const cardH = 110;
    const cardGapX = 10;
    const cardGapY = 16;

    if (this.activeShopTab === "weapons") {
      const items = [
        { id: "shotgun", name: "SHOTGUN", desc: "High scatter damage at close range." },
        { id: "smg",     name: "SMG",     desc: "High rate of fire, low accuracy." },
        { id: "rifle",   name: "RIFLE",   desc: "Excellent damage and auto-fire." },
        { id: "sniper",  name: "SNIPER",  desc: "Slow bolt-action but heavy damage." },
        { id: "flamethrower", name: "FLAMETHROWER", desc: "Short-range stream of fire." },
        { id: "plasma",  name: "PLASMA RIFLE", desc: "Energy bolts that explode." },
        { id: "crossbow", name: "CROSSBOW", desc: "Bolt pierces through crowds." },
      ];

      // Weapons tab: compact 3-column grid. Cards are sized so all three
      // rows fit inside the fixed content slot [gridY, gridBottom] above the
      // BACK footer — nothing can overlap the footer or the neighbouring
      // cards. Names, descriptions and the status label all stay inside the
      // card's text zone (to the left of the icon / button area).
      const wCardW = 176;
      const wCardH = 92;
      const wGapX = 8;
      const wGapY = 8;
      const wGridX = cx - (wCardW * 3 + wGapX * 2) / 2;
      const wTextRight = wCardW - 62; // icon zone starts here (52px wide)
      const wNameMaxW = wTextRight - 8 - 6; // room for the name before the icon
      items.forEach((item, idx) => {
        const col = idx % 3;
        const row = Math.floor(idx / 3);
        const cX = wGridX + col * (wCardW + wGapX);
        const cY = gridY + row * (wCardH + wGapY);

        const wData = game.weaponData[item.id];
        const price = wData?.price ?? 500;
        const owned = p.weapons.weapons[item.id] !== undefined;

        // Card Border and Fill
        ctx.fillStyle = "#1E1E24";
        roundRect(ctx, cX, cY, wCardW, wCardH, 8);
        ctx.fill();
        ctx.strokeStyle = owned ? color("ui_green") : "#3C3C46";
        ctx.lineWidth = 1.5;
        roundRect(ctx, cX, cY, wCardW, wCardH, 8);
        ctx.stroke();

        // Draw weapon icon (top-right, clear of the title text zone)
        drawShopIcon(ctx, `weapon:${item.id}`, cX + wTextRight, cY + 5, 52, 34, owned);

        // Weapon name — shrink to fit the zone left of the icon so a long
        // name can never slide under the icon or over the card border.
        let nameSize = 11;
        ctx.font = `bold ${nameSize}px ui-monospace, monospace`;
        if (ctx.measureText(item.name).width > wNameMaxW) {
          const fitted = Math.floor((nameSize * wNameMaxW) / Math.max(1, ctx.measureText(item.name).width));
          nameSize = Math.max(8, fitted);
        }
        drawText(ctx, item.name, cX + 8, cY + 7, nameSize, owned ? color("ui_green") : "#FFFFFF", "left", "top");

        // Description — measured word-wrap inside the text zone left of the
        // icon: short lines stay on one line, longer ones break naturally at
        // whitespace, and nothing can run under the icon or the card edge.
        drawWrapped(ctx, item.desc, cX + 9, cY + 27, 9, wTextRight - 8 - 2, 3, 11, color("ui_dim"));

        let btnText = `$${price} [BUY]`;
        let btnAccent = color("ui_gold");
        let enabled = true;

        if (owned) {
          btnText = "OWNED";
          btnAccent = color("ui_green");
          enabled = false;
        } else if (p.coins < price) {
          btnText = `NOT ENOUGH CASH`;
          btnAccent = "#787882";
          enabled = false;
        }

        // Status / buy button spans the card bottom. Its 12px label always
        // fits on one line inside the card (Button auto-shrinks if ever
        // needed), so it can't spill onto neighbouring cards.
        const buyBtn = new Button(
          btnText,
          cX + 8,
          cY + wCardH - 26,
          wCardW - 16,
          22,
          enabled ? `ps_buy:weapon:${item.id}` : "",
          btnAccent,
          12
        );
        buyBtn.update(dt, hx, hy, false);
        buyBtn.draw(ctx);
        if (enabled) buttons.push(buyBtn);
      });
    } else if (this.activeShopTab === "supplies") {
      const items = [
        { id: "ammo",   name: "AMMO PACK",   desc: "Adds +30 reserve ammo.",        price: 100 },
        { id: "bomb",   name: "BOMB PACK",   desc: `Adds +${BOMB_PACK_AMOUNT} throwable bombs.`, price: BOMB_PACK_PRICE },
        { id: "medkit", name: "MEDKIT",      desc: "Restores +25 health.",          price: 200 },
        { id: "armor",  name: "ARMOR PLATE", desc: "Adds +15 armor plating.",       price: 250 },
      ];

      // Supplies use the shared 2-column card grid (same card size as the
      // upgrades / mods tabs). UFO FLEET lives exclusively in the UFO tab.
      items.forEach((item, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const cX = gridX + col * (cardW + cardGapX);
        const cY = gridY + row * (cardH + cardGapY);

        ctx.fillStyle = "#1E1E24";
        roundRect(ctx, cX, cY, cardW, cardH, 8);
        ctx.fill();

        let available = true;
        let isMax = false;
        let btnText = `$${item.price} [BUY]`;
        let btnAccent = color("ui_gold");

        if (item.id === "bomb" && p.bombs >= p.maxBombs) {
          available = false;
          isMax = true;
          btnText = "BAG FULL";
          btnAccent = color("ui_green");
        } else if (item.id === "medkit" && p.hp >= p.maxHp) {
          available = false;
          isMax = true;
          btnText = "FULL HP";
          btnAccent = color("ui_green");
        } else if (item.id === "armor" && p.armor >= 100) {
          available = false;
          isMax = true;
          btnText = "MAX ARMOR";
          btnAccent = color("ui_blue");
        } else if (p.coins < item.price) {
          available = false;
          btnText = "NOT ENOUGH CASH";
          btnAccent = "#787882";
        }

        ctx.strokeStyle = isMax ? btnAccent : "#3C3C46";
        ctx.lineWidth = 1.5;
        roundRect(ctx, cX, cY, cardW, cardH, 8);
        ctx.stroke();

        // Draw supply icon
        drawShopIcon(ctx, item.id, cX + cardW - 82, cY + 10, 70, 44, isMax);

        // Text Info (Left aligned)
        drawText(ctx, item.name, cX + 12, cY + 12, 15, isMax ? btnAccent : "#FFFFFF", "left", "top");

        // Description — measured word-wrap that only breaks when the text
        // reaches the icon zone, so short descriptions stay on one line and
        // long ones wrap naturally at whitespace without clipping.
        const desc =
          item.id === "bomb"
            ? `Adds +${BOMB_PACK_AMOUNT} throwable bombs (${p.bombs}/${p.maxBombs}) — press F`
            : item.desc;
        drawWrapped(ctx, desc, cX + 12, cY + 34, 10, cardW - 98, 3, 12, color("ui_dim"));

        const buyBtn = new Button(
          btnText,
          cX + 12,
          cY + cardH - 34,
          cardW - 24,
          24,
          available ? `ps_buy:${item.id}` : "",
          btnAccent
        );
        buyBtn.update(dt, hx, hy, false);
        buyBtn.draw(ctx);
        if (available) buttons.push(buyBtn);
      });
    } else if (this.activeShopTab === "ufos") {
      this.drawUfoTab(ctx, game, buttons, gridX, gridY, hx, hy, dt);
    } else if (this.activeShopTab === "upgrades") {
      const items = [
        { id: "max_hp",    name: "MAX HP UPGRADE", desc: "Gain +20 Max HP and heal.",       price: 300 },
        { id: "damage",    name: "DAMAGE UPGRADE", desc: "Increase base damage by +10%.",   price: 350 },
        { id: "speed",     name: "SPEED UPGRADE",  desc: "Increase movement speed by +8%.", price: 300 },
        { id: "fire_rate", name: "FIRE RATE",      desc: "Increase fire rate by +8%.",      price: 350 },
      ];

      items.forEach((item, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const cX = gridX + col * (cardW + cardGapX);
        const cY = gridY + row * (cardH + cardGapY);

        const currentLvl = p.upgradeLevels[item.id] ?? 0;
        const maxLimit = game.upgrades.catalog.limits[item.id] ?? 5;
        const isMaxed = currentLvl >= maxLimit;

        ctx.fillStyle = "#1E1E24";
        roundRect(ctx, cX, cY, cardW, cardH, 8);
        ctx.fill();

        let available = !isMaxed;
        let btnText = `$${item.price} [BUY]`;
        let btnAccent = color("ui_gold");

        if (isMaxed) {
          btnText = "MAX LEVEL";
          btnAccent = color("ui_green");
        } else if (p.coins < item.price) {
          available = false;
          btnText = "NOT ENOUGH CASH";
          btnAccent = "#787882";
        }

        ctx.strokeStyle = isMaxed ? color("ui_green") : "#3C3C46";
        ctx.lineWidth = 1.5;
        roundRect(ctx, cX, cY, cardW, cardH, 8);
        ctx.stroke();

        // Draw upgrade icon
        drawShopIcon(ctx, item.id, cX + cardW - 84, cY + 12, 72, 48, isMaxed);

        // Text Info (Left aligned)
        drawText(ctx, item.name, cX + 12, cY + 14, 15, isMaxed ? color("ui_green") : "#FFFFFF", "left", "top");

        // Description — measured word-wrap; short ones stay on one line and
        // long ones wrap naturally at the icon zone without clipping.
        const upDescLines = wrapLines(ctx, item.desc, 10, cardW - 98);
        let upDescY = cY + 36;
        for (const line of upDescLines.slice(0, 2)) {
          drawText(ctx, line, cX + 12, upDescY, 10, color("ui_dim"), "left", "top");
          upDescY += 12;
        }
        drawText(ctx, `Level: ${currentLvl} / ${maxLimit}`, cX + 12, upDescY + 2, 10, isMaxed ? color("ui_green") : color("ui_gold"), "left", "top");

        const buyBtn = new Button(
          btnText,
          cX + 12,
          cY + cardH - 34,
          cardW - 24,
          24,
          available ? `ps_buy:upgrade:${item.id}` : "",
          btnAccent
        );
        buyBtn.update(dt, hx, hy, false);
        buyBtn.draw(ctx);
        if (available) buttons.push(buyBtn);
      });
    } else if (this.activeShopTab === "mods") {
      const wid = p.weapons.currentId;
      const w = p.weapons.current;
      // Dedicated MODDING status band between the tab row (which ends at
      // PANEL_Y + 110) and the mod grid. The grid starts BELOW this band, so
      // the header can never overlap the tabs or the item cards. If the
      // weapon name makes the line too wide it wraps onto a second line
      // instead of clipping or running under neighbouring elements.
      const modHeaderY = PANEL_Y + 114;
      const modGridY = gridY + 30;
      const hint = "(switch weapon to mod another)";
      const label = `MODDING: ${w.name.toUpperCase()}`;
      ctx.font = "bold 12px ui-monospace, monospace";
      const fitsOneLine =
        ctx.measureText(label).width + ctx.measureText(hint).width + 16 <= PANEL_W - 48;
      if (fitsOneLine) {
        drawText(ctx, `${label} ${hint}`, cx, modHeaderY, 12, color("ui_dim"), "center", "top");
      } else {
        drawText(ctx, label, cx, modHeaderY, 12, color("ui_gold"), "center", "top");
        drawText(ctx, hint, cx, modHeaderY + 15, 10, color("ui_dim"), "center", "top");
      }

      MOD_CATALOG.forEach((mod, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const cX = gridX + col * (cardW + cardGapX);
        const cY = modGridY + row * (cardH + cardGapY);

        const equipped = w.mods.includes(mod.id);

        ctx.fillStyle = "#1E1E24";
        roundRect(ctx, cX, cY, cardW, cardH, 8);
        ctx.fill();

        let available = !equipped;
        let btnText = `$${mod.price} [EQUIP]`;
        let btnAccent = color("ui_gold");

        if (equipped) {
          btnText = "EQUIPPED";
          btnAccent = color("ui_green");
        } else if (p.coins < mod.price) {
          available = false;
          btnText = "NOT ENOUGH CASH";
          btnAccent = "#787882";
        }

        ctx.strokeStyle = equipped ? color("ui_green") : "#3C3C46";
        ctx.lineWidth = 1.5;
        roundRect(ctx, cX, cY, cardW, cardH, 8);
        ctx.stroke();

        // Product icon — same slot the weapons/supplies/upgrades cards use.
        drawShopIcon(ctx, `mod:${mod.id}`, cX + cardW - 84, cY + 12, 72, 48, equipped);

        drawText(ctx, mod.name.toUpperCase(), cX + 12, cY + 14, 15, equipped ? color("ui_green") : "#FFFFFF", "left", "top");
        // Description — measured word-wrap, short ones stay on one line.
        const modDescLines = wrapLines(ctx, mod.desc, 10, cardW - 98);
        let modDescY = cY + 36;
        for (const line of modDescLines.slice(0, 2)) {
          drawText(ctx, line, cX + 12, modDescY, 10, color("ui_dim"), "left", "top");
          modDescY += 12;
        }
        drawText(
          ctx,
          `Fits: ${w.name.toUpperCase()}`,
          cX + 12,
          modDescY + 2,
          10,
          equipped ? color("ui_green") : color("ui_gold"),
          "left",
          "top",
        );

        const buyBtn = new Button(
          btnText,
          cX + 12,
          cY + cardH - 34,
          cardW - 24,
          24,
          available ? `ps_buy:mod:${wid}:${mod.id}` : "",
          btnAccent,
        );
        buyBtn.update(dt, hx, hy, false);
        buyBtn.draw(ctx);
        if (available) buttons.push(buyBtn);
      });
    }

    // BACK button — sits in its own footer row below the content slot, so it
    // always has clear space above (the grid) and never covers any card.
    const backBtn = new Button("BACK", cx - 100, PANEL_Y + PANEL_H - 48, 200, 34, "pause_back");
    backBtn.update(dt, hx, hy, false);
    backBtn.draw(ctx);
    buttons.push(backBtn);

    // Undo the responsive scale, then map every button back into real screen
    // coordinates so the global hit-test (raw pointer vs button rect) still
    // works on small viewports. No-op when K === 1 (normal desktop sizes).
    if (K < 1) ctx.restore();
    if (K !== 1) {
      for (const b of buttons) {
        b.x = cx + (b.x - cx) * K;
        b.y = cy + (b.y - cy) * K;
        b.w *= K;
        b.h *= K;
      }
    }

    return { action: null, buttons };
  }

  /**
   * UFO FLEET tab inside the BLACK MARKET: a live N/4 OWNED counter plus one
   * card per UFO in the catalog with clear states:
   *   unowned + affordable  -> "$PRICE [BUY]"   (gold, clickable)
   *   unowned + broke       -> "NOT ENOUGH CASH" (grey, disabled)
   *   unowned + fleet full  -> "MAX OWNED"       (grey, disabled)
   *   owned + active        -> "OWNED / ACTIVE"  (green, disabled)
   *   owned + not active    -> "EQUIP"           (green, clickable)
   */
  private drawUfoTab(
    ctx: CanvasRenderingContext2D,
    game: IGame,
    buttons: Button[],
    gridX: number,
    gridY: number,
    hx: number,
    hy: number,
    dt: number,
  ): void {
    const p = game.player!;
    const ownedCount = p.ownedUFOs.length;
    const fleetFull = ownedCount >= MAX_UFO_OWNED;

    // Header: title + realtime counter.
    drawText(ctx, "UFO FLEET", gridX, gridY + 2, 18, color("ui_gold"), "left", "top");
    drawText(
      ctx,
      `${ownedCount} / ${MAX_UFO_OWNED} OWNED`,
      gridX + 280,
      gridY + 2,
      18,
      fleetFull ? color("ui_green") : color("ui_blue"),
      "left",
      "top",
    );

    // 3 x 2 grid of UFO cards inside the fixed content slot.
    const uCardW = 176;
    const uCardH = 118;
    const uGapX = 8;
    const uGapY = 10;
    const uGridY = gridY + 34;

    UFO_CATALOG.forEach((def, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const cX = gridX + col * (uCardW + uGapX);
      const cY = uGridY + row * (uCardH + uGapY);

      const owned = p.ownedUFOs.includes(def.id);
      const isActive = p.activeUFO === def.id;
      const maxed = !owned && fleetFull;
      const afford = p.coins >= def.price;

      let btnText: string;
      let btnAccent: string;
      let action = "";
      let border: string;
      let fill = "#1E1E24";

      if (isActive) {
        btnText = "OWNED / ACTIVE";
        btnAccent = color("ui_green");
        border = color("ui_green");
        fill = "#16242A";
      } else if (owned) {
        btnText = "EQUIP";
        btnAccent = color("ui_green");
        action = `ps_equip_ufo:${def.id}`;
        border = color("ui_green");
        fill = "#16242A";
      } else if (maxed) {
        btnText = "MAX OWNED";
        btnAccent = "#787882";
        border = "#3C3C46";
      } else if (afford) {
        btnText = `$${def.price} [BUY]`;
        btnAccent = color("ui_gold");
        action = `ps_buy:ufo:${def.id}`;
        border = "#3C3C46";
      } else {
        btnText = "NOT ENOUGH CASH";
        btnAccent = "#787882";
        border = "#3C3C46";
      }

      // Card fill + border.
      ctx.fillStyle = fill;
      roundRect(ctx, cX, cY, uCardW, uCardH, 8);
      ctx.fill();
      ctx.strokeStyle = border;
      ctx.lineWidth = 1.5;
      roundRect(ctx, cX, cY, uCardW, uCardH, 8);
      ctx.stroke();

      // Saucer icon, top-right, clear of the title.
      drawShopIcon(ctx, `ufo:${def.id}`, cX + uCardW - 62, cY + 6, 54, 38, false);

      // Name — shrink to fit the zone left of the icon.
      const nameMaxW = uCardW - 72;
      let nameSize = 11;
      ctx.font = `bold ${nameSize}px ui-monospace, monospace`;
      if (ctx.measureText(def.name).width > nameMaxW) {
        nameSize = Math.max(
          8,
          Math.floor((nameSize * nameMaxW) / Math.max(1, ctx.measureText(def.name).width)),
        );
      }
      drawText(
        ctx,
        def.name,
        cX + 8,
        cY + 7,
        nameSize,
        owned ? color("ui_green") : "#FFFFFF",
        "left",
        "top",
      );

      // Description — measured word-wrap inside the text zone. Every line
      // that fits is drawn so no part of the description is ever cut.
      const descLines = wrapLines(ctx, def.desc, 9, uCardW - 72);
      let descY = cY + 27;
      for (const line of descLines.slice(0, 4)) {
        drawText(ctx, line, cX + 8, descY, 9, color("ui_dim"), "left", "top");
        descY += 11;
      }

      // Status / buy button spans the card bottom.
      const btn = new Button(
        btnText,
        cX + 8,
        cY + uCardH - 28,
        uCardW - 16,
        22,
        action,
        btnAccent,
        11,
      );
      btn.update(dt, hx, hy, false);
      btn.draw(ctx);
      if (action) buttons.push(btn);
    });
  }

  drawSettings(ctx: CanvasRenderingContext2D, game: IGame): { action: string | null; buttons: Button[] } {
    const width = ctx.canvas.width / renderScale();

    this.drawBackground(ctx, game.dt);
    drawText(ctx, "SETTINGS", width / 2, 90, 46, undefined, "center");
    const cx = width / 2;
    const st = game.save.settings;
    const dt = game.dt;
    const mx = game.input.mouseX;
    const my = game.input.mouseY;
    const buttons: Button[] = [];
    let y = 146;

    // ── AUDIO ──────────────────────────────────────────────────────────────
    drawText(ctx, "AUDIO", cx - 260, y, 12, color("ui_gold"), "left", "middle");
    y += 22;
    const rows: [string, string, number][] = [
      ["master_volume", "MASTER VOLUME", st.master_volume],
      ["music_volume", "MUSIC VOLUME", st.music_volume],
      ["sfx_volume", "SFX VOLUME", st.sfx_volume],
    ];
    for (const [key, label, val] of rows) {
      drawText(ctx, label, cx - 260, y + 12, 17, undefined, "left", "middle");
      ctx.fillStyle = "#28282E";
      ctx.fillRect(cx - 40, y + 7, 240, 14);
      ctx.fillStyle = color("ui_accent");
      ctx.fillRect(cx - 40, y + 7, 240 * val, 14);
      drawText(ctx, `${Math.floor(val * 100)}%`, cx + 250, y + 14, 15, undefined, "center", "middle");
      buttons.push(new Button("-", cx - 82, y + 2, 38, 28, `dec:${key}`));
      buttons.push(new Button("+", cx + 292, y + 2, 38, 28, `inc:${key}`));
      y += 60;
    }

    // ── GAMEPLAY toggles ──────────────────────────────────────────────────
    // Same canonical list and order as the Pause settings panel; every toggle
    // shares the same backing settings values, so they stay in sync.
    drawText(ctx, "GAMEPLAY", cx - 300, y + 2, 12, color("ui_gold"), "left", "middle");
    y += 20;
    const toggles: Array<{
      key: "screen_shake" | "damage_numbers" | "hit_effects" | "footstep_dust" | "window_lights" | "show_fps";
      label: string;
      action: string;
    }> = [
      { key: "screen_shake", label: "SCREEN SHAKE", action: "toggle_screen_shake" },
      { key: "damage_numbers", label: "DAMAGE NUMBERS", action: "toggle_damage_numbers" },
      { key: "hit_effects", label: "HIT EFFECTS", action: "toggle_hit_effects" },
      { key: "footstep_dust", label: "FOOTSTEP DUST", action: "toggle_footstep_dust" },
      { key: "window_lights", label: "WINDOW LIGHTS", action: "toggle_window_lights" },
      { key: "show_fps", label: "SHOW FPS", action: "toggle_fps" },
    ];
    for (const t of toggles) {
      const on = !!st[t.key];
      drawText(ctx, t.label, cx - 300, y + 13, 13, undefined, "left", "middle");
      ctx.fillStyle = on ? color("ui_green") : "#4A4A52";
      ctx.beginPath();
      ctx.arc(cx + 190, y + 13, 4, 0, Math.PI * 2);
      ctx.fill();
      const toggleBtn = new Button(
        on ? "ON" : "OFF",
        cx + 205,
        y + 2,
        96,
        24,
        t.action,
        on ? color("ui_green") : "#4A4A52",
      );
      toggleBtn.update(dt, mx, my, false);
      toggleBtn.draw(ctx);
      buttons.push(toggleBtn);
      y += 34;
    }

    // ── DISPLAY ───────────────────────────────────────────────────────────
    drawText(ctx, "DISPLAY", cx - 300, y + 6, 12, color("ui_gold"), "left", "middle");
    y += 24;
    const fs = st.fullscreen ? "FULLSCREEN: ON" : "FULLSCREEN: OFF";
    buttons.push(new Button(fs, cx - 300, y + 2, 296, 30, "toggle_fullscreen"));
    y += 40;
    buttons.push(new Button("BACK", cx - 110, y + 6, 220, 44, "back"));
    return { action: null, buttons };
  }

  drawShop(
    ctx: CanvasRenderingContext2D,
    game: IGame,
    entries: { key: string; label: string; detail: string; price: number; owned: boolean }[],
  ): { action: string | null; buttons: Button[] } {
    const width = ctx.canvas.width / renderScale();
    const leftOffset = (width - SCREEN_WIDTH) / 2;

    this.drawBackground(ctx, game.dt);
    drawText(ctx, "SHOP", width / 2, 56, 42, undefined, "center");
    drawText(ctx, `COINS: $${game.player!.coins}`, width / 2, 104, 22, color("ui_green"), "center");
    const buttons: Button[] = [];
    let y = 150;
    for (const e of entries) {
      const priceTxt = e.owned ? "OWNED" : `$${e.price}`;
      const affordable = e.owned || game.player!.coins >= e.price;
      const col = e.owned
        ? color("ui_dim")
        : affordable
          ? color("ui_green")
          : color("ui_accent");

      // Draw shop icon
      drawShopIcon(ctx, e.key, 52 + leftOffset, y + 8, 72, 48, e.owned);

      drawText(ctx, e.label, 140 + leftOffset, y + 24, 19);
      drawText(ctx, e.detail, 380 + leftOffset, y + 26, 13, color("ui_dim"));
      drawText(ctx, priceTxt, 900 + leftOffset, y + 25, 18, col, "center", "middle");
      if (!e.owned) {
        buttons.push(
          new Button(
            "BUY",
            1025 + leftOffset,
            y + 7,
            110,
            40,
            `buy:${e.key}`,
            affordable ? color("ui_green") : "#5A5A60",
          ),
        );
      }
      y += 64;
    }
    buttons.push(new Button("BACK", width / 2 - 150, y + 30, 300, 54, "back"));
    return { action: null, buttons };
  }

  /**
   * Level-up offer: three cards, one random skill rolled from each skill-tree
   * branch. The cards ignore clicks for the first `LEVELUP_PICK_LOCK` seconds
   * (shown as a countdown) because the player is normally holding fire when the
   * level lands — without the lock that click picks a skill at random. After
   * the countdown the overlay simply waits: there is no dismiss button.
   */
  private drawLevelUpChoice(
    ctx: CanvasRenderingContext2D,
    game: IGame,
    choices: string[],
    width: number,
    height: number,
  ): { action: string | null; buttons: Button[] } {
    const p = game.player!;
    const buttons: Button[] = [];
    const mx = game.input.mouseX;
    const my = game.input.mouseY;
    const lock = Math.max(0, game.levelUpLockTimer ?? 0);
    const locked = lock > 0;

    // Dim curtain over the ember background so the cards pop.
    ctx.fillStyle = "rgba(8, 8, 12, 0.55)";
    ctx.fillRect(0, 0, width, height);

    // A short window (small browser, landscape phone) gets a tighter header so
    // the cards keep the room their text needs.
    const compact = height < 560;
    drawText(
      ctx,
      "LEVEL UP!",
      width / 2,
      compact ? 38 : 66,
      compact ? 32 : 46,
      color("ui_green"),
      "center",
      "middle",
    );
    drawText(
      ctx,
      `LV ${p.level}   ·   CHOOSE ONE SKILL`,
      width / 2,
      compact ? 70 : 110,
      compact ? 14 : 18,
      "#9FE8FF",
      "center",
      "middle",
    );
    if (p.pendingLevels > 1) {
      drawText(
        ctx,
        `${p.pendingLevels} LEVELS PENDING`,
        width / 2,
        compact ? 90 : 136,
        compact ? 11 : 13,
        color("ui_gold"),
        "center",
        "middle",
      );
    }

    // ── Cards ─────────────────────────────────────────────────────────────
    // The card is sized to its own text: never taller (which leaves a dead gap
    // above the pips) and never shorter (which would overlap them).
    const RIBBON_H = 40;
    const NAME_LH = compact ? 21 : 24;
    const DESC_LH = compact ? 15 : 18;
    const NAME_SIZE = compact ? 16 : 19;
    const DESC_SIZE = compact ? 11 : 12;
    const gap = compact ? 14 : 22;
    const cardW = Math.max(
      120,
      Math.min(300, (width - (compact ? 48 : 80) - gap * (choices.length - 1)) / choices.length),
    );
    const cards = choices.map((uid) => ({
      uid,
      branch: branchForSkill(uid),
      name: wrapLines(ctx, game.upgrades.textFor(uid), NAME_SIZE, cardW - 24),
      desc: wrapLines(ctx, game.upgrades.descFor(uid), DESC_SIZE, cardW - 24),
    }));
    const bodyH = Math.max(
      ...cards.map((c) => c.name.length * NAME_LH + c.desc.length * DESC_LH),
    );
    // ribbon + top pad + text + pad + pips + label + bottom pad
    const topPad = compact ? 18 : 26;
    const cardH = RIBBON_H + topPad + bodyH + (compact ? 26 : 34) + 7 + (compact ? 26 : 30);
    const totalW = choices.length * cardW + (choices.length - 1) * gap;
    const startX = (width - totalW) / 2;
    const headroom = compact ? 104 : 158;
    // Room for the two footer lines (prompt + hint, or countdown + bar + hint).
    const footroom = compact ? 84 : 108;
    let cardY = Math.max(headroom, height / 2 - cardH / 2 - (compact ? 4 : 16));
    // Pull the block up if the footer prompt would fall off the bottom.
    if (cardY + cardH + footroom > height) {
      cardY = Math.max(headroom, height - footroom - cardH);
    }

    cards.forEach((card, i) => {
      const uid = card.uid;
      const branch = card.branch;
      const accent = branch?.color ?? color("ui_gold");
      const x = startX + i * (cardW + gap);
      const hovered = !locked && mx >= x && mx <= x + cardW && my >= cardY && my <= cardY + cardH;
      const cur = p.upgradeLevels[uid] ?? 0;
      const limit = game.upgrades.limitFor(uid);

      ctx.save();
      ctx.globalAlpha = locked ? 0.45 : 1;

      if (hovered) {
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = accent;
        roundRect(ctx, x - 6, cardY - 6, cardW + 12, cardH + 12, 18);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = hovered ? "rgba(30, 30, 40, 0.97)" : "rgba(18, 18, 24, 0.95)";
      roundRect(ctx, x, cardY, cardW, cardH, 14);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = hovered ? 3 : 1.6;
      roundRect(ctx, x, cardY, cardW, cardH, 14);
      ctx.stroke();

      // Branch ribbon
      ctx.fillStyle = accent;
      ctx.globalAlpha *= 0.18;
      roundRect(ctx, x, cardY, cardW, RIBBON_H, 14);
      ctx.fill();
      ctx.globalAlpha = locked ? 0.45 : 1;
      drawText(
        ctx,
        (branch?.name ?? "SKILL").toUpperCase(),
        x + cardW / 2,
        cardY + RIBBON_H / 2 + 1,
        15,
        accent,
        "center",
        "middle",
      );

      // Skill name, then description — both pre-wrapped above.
      let ty = cardY + RIBBON_H + topPad + NAME_LH / 2;
      for (const line of card.name) {
        drawText(ctx, line, x + cardW / 2, ty, NAME_SIZE, "#FFFFFF", "center", "middle");
        ty += NAME_LH;
      }
      ty += 2;
      for (const line of card.desc) {
        drawText(ctx, line, x + cardW / 2, ty, DESC_SIZE, color("ui_dim"), "center", "middle");
        ty += DESC_LH;
      }

      // Level pips
      const pipY = cardY + cardH - (compact ? 40 : 46);
      const pipGap = limit > 6 ? 3 : 4;
      const pipW = Math.max(3, Math.min(22, (cardW - 30 - (limit - 1) * pipGap) / limit));
      const pipsW = limit * pipW + (limit - 1) * pipGap;
      let px = x + (cardW - pipsW) / 2;
      for (let l = 0; l < limit; l++) {
        ctx.fillStyle = l < cur ? accent : "rgba(255, 255, 255, 0.14)";
        roundRect(ctx, px, pipY, pipW, 7, 3);
        ctx.fill();
        px += pipW + pipGap;
      }
      drawText(
        ctx,
        cur > 0 ? `LV ${cur} → ${cur + 1} / ${limit}` : `NEW · MAX ${limit}`,
        x + cardW / 2,
        cardY + cardH - (compact ? 17 : 20),
        compact ? 11 : 12,
        locked ? "#6A6A74" : accent,
        "center",
        "middle",
      );
      ctx.restore();

      // Only register the hit box once unlocked, so a stray click during the
      // countdown finds no button at all.
      if (!locked) {
        buttons.push(new Button("", x, cardY, cardW, cardH, `upgrade:${uid}`, accent));
      }
    });

    // ── Countdown / prompt ────────────────────────────────────────────────
    // `footY` is the FIRST footer line; everything below is measured from it so
    // nothing slides off the bottom of a short window.
    const footY = Math.min(
      cardY + cardH + (compact ? 30 : 44),
      height - (compact ? 58 : 66),
    );
    const bigFoot = compact ? 14 : 16;
    const smallFoot = compact ? 11 : 12;
    if (locked) {
      drawText(
        ctx,
        `SELECTION UNLOCKS IN ${Math.ceil(lock)}`,
        width / 2,
        footY,
        bigFoot,
        color("ui_gold"),
        "center",
        "middle",
      );
      const frac = Math.max(0, Math.min(1, 1 - lock / LEVELUP_PICK_LOCK));
      const barW = Math.min(360, width - 80);
      const barX = (width - barW) / 2;
      const barY = footY + 16;
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      roundRect(ctx, barX, barY, barW, 8, 4);
      ctx.fill();
      ctx.fillStyle = color("ui_gold");
      roundRect(ctx, barX, barY, Math.max(4, barW * frac), 8, 4);
      ctx.fill();
      drawText(
        ctx,
        "TAKE A BREATH — STRAY CLICKS ARE IGNORED",
        width / 2,
        barY + 22,
        smallFoot,
        color("ui_dim"),
        "center",
        "middle",
      );
    } else {
      drawText(
        ctx,
        "CLICK A CARD TO LEARN THE SKILL",
        width / 2,
        footY,
        bigFoot,
        color("ui_green"),
        "center",
        "middle",
      );
      drawText(
        ctx,
        "THE GAME WAITS UNTIL YOU CHOOSE",
        width / 2,
        footY + 26,
        smallFoot,
        color("ui_dim"),
        "center",
        "middle",
      );
    }

    return { action: null, buttons };
  }

  drawUpgrade(
    ctx: CanvasRenderingContext2D,
    game: IGame,
    choices: string[],
  ): { action: string | null; buttons: Button[] } {
    const width = ctx.canvas.width / renderScale();
    const height = ctx.canvas.height / renderScale();

    this.drawBackground(ctx, game.dt);

    const p = game.player!;
    const isLevelUp = p.pendingLevels > 0;

    // Level-up: pick one of three rolled skills (one per branch) instead of
    // browsing the whole tree.
    if (isLevelUp && choices.length > 0) {
      return this.drawLevelUpChoice(ctx, game, choices, width, height);
    }

    // ── Header ────────────────────────────────────────────────────────────
    drawText(
      ctx,
      isLevelUp ? "LEVEL UP!" : "SKILL TREE",
      width / 2,
      62,
      isLevelUp ? 46 : 40,
      isLevelUp ? color("ui_green") : color("ui_gold"),
      "center",
      "middle",
    );
    drawText(
      ctx,
      `LV ${p.level}   ·   SKILL POINTS: ${p.skillPoints}`,
      width / 2,
      112,
      19,
      p.skillPoints > 0 ? "#9FE8FF" : color("ui_dim"),
      "center",
      "middle",
    );

    // ── Branch columns ────────────────────────────────────────────────────
    const branches = SKILL_BRANCHES;
    const colW = Math.min(292, (width - 120) / branches.length);
    const gapX = 18;
    const totalW = branches.length * colW + (branches.length - 1) * gapX;
    const startX = (width - totalW) / 2;
    const topY = 148;
    const rowH = 54;
    const rowGap = 10;
    const maxRows = Math.max(...branches.map((b) => b.skills.length));
    const buttons: Button[] = [];

    const mx = game.input.mouseX;
    const my = game.input.mouseY;
    const dt = game.dt;

    branches.forEach((branch, bi) => {
      const bx = startX + bi * (colW + gapX);
      drawText(
        ctx,
        branch.name.toUpperCase(),
        bx + colW / 2,
        topY,
        20,
        branch.color,
        "center",
        "middle",
      );

      branch.skills.forEach((uid, si) => {
        const cy = topY + 32 + si * (rowH + rowGap);
        const cur = p.upgradeLevels[uid] ?? 0;
        const limit = game.upgrades.limitFor(uid);
        const maxed = cur >= limit;
        const affordable = !maxed && p.skillPoints > 0;
        const hovered =
          mx >= bx && mx <= bx + colW && my >= cy && my <= cy + rowH;

        ctx.fillStyle = maxed
          ? "rgba(70, 200, 100, 0.10)"
          : affordable || hovered
            ? "rgba(24, 24, 32, 0.92)"
            : "rgba(14, 14, 18, 0.75)";
        roundRect(ctx, bx, cy, colW, rowH, 8);
        ctx.fill();
        ctx.strokeStyle = maxed
          ? "#6EDC82"
          : affordable
            ? branch.color
            : hovered
              ? "#4A4A54"
              : "#2A2A32";
        ctx.lineWidth = 1.5;
        roundRect(ctx, bx, cy, colW, rowH, 8);
        ctx.stroke();

        drawText(
          ctx,
          game.upgrades.textFor(uid),
          bx + 10,
          cy + 11,
          12,
          maxed ? "#C2F2D0" : affordable ? "#FFFFFF" : "#8A8A94",
          "left",
          "middle",
        );
        drawText(
          ctx,
          game.upgrades.descFor(uid),
          bx + 10,
          cy + rowH - 10,
          8.5,
          color("ui_dim"),
          "left",
          "middle",
        );
        drawText(
          ctx,
          maxed ? "MAX" : `${cur}/${limit}`,
          bx + colW - 10,
          cy + rowH / 2,
          10,
          maxed ? "#6EDC82" : affordable ? "#FFD36B" : "#5A5A62",
          "right",
          "middle",
        );

        buttons.push(new Button("", bx, cy, colW, rowH, `upgrade:${uid}`, branch.color));
      });
    });

    // ── Continue ──────────────────────────────────────────────────────────
    const contY = topY + 32 + maxRows * (rowH + rowGap) + 10;
    const contW = 240;
    const contX = width / 2 - contW / 2;
    const cont = new Button(
      "CONTINUE",
      contX,
      contY,
      contW,
      46,
      "upgrade_done",
      color("ui_gold"),
    );
    cont.update(dt, mx, my, false);
    cont.draw(ctx);
    buttons.push(cont);

    drawText(
      ctx,
      "CLICK A SKILL TO LEARN IT · ESC / CONTINUE TO RESUME",
      width / 2,
      contY + 62,
      12,
      color("ui_dim"),
      "center",
      "middle",
    );

    return { action: null, buttons };
  }

  drawUpgradesInfo(
    ctx: CanvasRenderingContext2D,
    game: IGame,
  ): { action: string | null; buttons: Button[] } {
    const width = ctx.canvas.width / renderScale();
    const height = ctx.canvas.height / renderScale();

    this.drawBackground(ctx, game.dt);
    drawText(ctx, "UPGRADES & ACHIEVEMENTS", width / 2, 70, 34, undefined, "center");
    let y = 130;
    drawText(
      ctx,
      "-- UPGRADE LEVELS --",
      width / 2,
      y,
      17,
      color("ui_dim"),
      "center",
    );
    y += 32;
    const p = game.player!;
    const pLevels = (p as unknown as { upgradeLevels: Record<string, number> }).upgradeLevels;
    const ids = ["max_hp", "damage", "speed", "fire_rate", "reload", "armor", "crit_ch", "crit_dmg"];
    for (const id of ids) {
      const n = pLevels[id] ?? 0;
      const col = n ? color("ui_green") : color("ui_dim");
      const text = game.upgrades.textFor(id);
      drawText(ctx, text, width / 2 - 20, y, 15, undefined, "right");
      drawText(ctx, `x${n}`, width / 2 + 160, y, 15, col, "left");
      y += 26;
    }
    const [got, total] = game.achievements.count;
    y += 16;
    drawText(
      ctx,
      `-- ACHIEVEMENTS ${got}/${total} --`,
      width / 2,
      y,
      17,
      color("ui_gold"),
      "center",
    );
    y += 32;
    for (const d of AchievementSystem.definitions()) {
      const gotIt = game.achievements.unlocked.has(d.id);
      drawText(
        ctx,
        `[${gotIt ? "OK" : "  "}] ${d.name} - ${d.desc}`,
        width / 2,
        y,
        13,
        gotIt ? color("ui_green") : color("ui_dim"),
        "center",
      );
      y += 22;
    }
    const buttons = [new Button("BACK", width / 2 - 150, Math.min(y + 30, height - 80), 300, 54, "back")];
    return { action: null, buttons };
  }

  drawGameOver(
    ctx: CanvasRenderingContext2D,
    game: IGame,
    stats: { score?: number; kills?: number; wave?: number; level?: number; survival_time?: number; coins?: number },
    newHigh: boolean,
  ): { action: string | null; buttons: Button[] } {
    const width = ctx.canvas.width / renderScale();
    const height = ctx.canvas.height / renderScale();

    // Dark background — less opaque so grid shows through slightly
    ctx.fillStyle = "#14060A";
    ctx.fillRect(0, 0, width, height);
    // Vignette glow in center
    const grad = ctx.createRadialGradient(width / 2, height / 2, 80, width / 2, height / 2, Math.max(width, height) * 0.7);
    grad.addColorStop(0, "rgba(80,10,15,0.4)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    drawText(ctx, "GAME OVER", width / 2, 110, 58, "#E63C42", "center");
    if (newHigh) {
      drawText(ctx, "✦ NEW HIGH SCORE! ✦", width / 2, 172, 20, color("ui_gold"), "center");
    }
    const rows: [string, string | number][] = [
      ["SCORE", stats.score ?? 0],
      ["KILLS", stats.kills ?? 0],
      ["WAVE", stats.wave ?? 1],
      ["LEVEL", stats.level ?? 1],
      ["TIME", formatTime(stats.survival_time ?? 0)],
      ["COINS", `$${stats.coins ?? 0}`],
    ];
    let y = 210;
    for (const [label, val] of rows) {
      drawText(ctx, label, width / 2 - 120, y, 20, color("ui_dim"), "left", "middle");
      drawText(ctx, String(val), width / 2 + 120, y, 22, undefined, "right", "middle");
      y += 38;
    }
    const cx = width / 2;
    const buttons = [
      new Button("RESTART", cx - 320, 560, 200, 54, "restart", "#50A0FF"),
      new Button("SHOP", cx - 100, 560, 200, 54, "shop_from_over"),
      new Button("MAIN MENU", cx + 120, 560, 200, 54, "menu"),
      // Back to the main website (lobby) so players can start a fresh run
      // without reloading the page.
      new Button(" RETURN TO LOBBY", cx - 150, 646, 300, 52, "leave_to_lobby", "#787882"),
    ];
    for (const b of buttons) {
      b.update(game.dt, game.input.mouseX, game.input.mouseY, false);
      b.draw(ctx);
    }
    return { action: null, buttons };
  }

  drawWaveBanner(
    ctx: CanvasRenderingContext2D,
    text: string,
    timer: number,
    boss: boolean,
  ): void {
    const width = ctx.canvas.width / renderScale();
    const alpha = Math.min(1, timer / 0.5);
    const scaleIn = Math.max(0.6, Math.min(1, (2.5 - timer) * 2));
    const size = Math.floor((boss ? 54 : 44) * scaleIn);
    ctx.globalAlpha = alpha;
    drawText(ctx, text, width / 2, 240, size, boss ? "#FF5A50" : "#EBEBE1", "center", "middle");
    drawText(
      ctx,
      boss ? "!! BOSS WAVE !!" : "GET READY",
      width / 2,
      295,
      16,
      boss ? "#FFC85A" : color("ui_dim"),
      "center",
      "middle",
    );
    // CRITICAL: always restore globalAlpha to 1 after the banner fade.
    // Without this reset, the leaking alpha value darkens the ENTIRE next
    // frame (background fill, world, HUD, etc.) causing the black-screen bug
    // that appeared whenever the wave transition banner faded out.
    ctx.globalAlpha = 1;
  }
}

export function hitTest(buttons: Button[], x: number, y: number): Button | null {
  for (const b of buttons) {
    if (b.contains(x, y)) return b;
  }
  return null;
}
