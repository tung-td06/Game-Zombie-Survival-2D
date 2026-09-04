// src/game/ui.ts
// HUD, minimap, crosshair, button, toast. Mirrors ui.py (Canvas2D).

import { color } from "./colors";
import { formatTime } from "./utils";
import { WEAPON_ORDER } from "./weapon";
import type { IGame } from "./types";
import { MINIMAP_SIZE } from "./settings";

const FONT = "bold 16px ui-monospace, monospace";
const FONT_SM = "bold 13px ui-monospace, monospace";
const FONT_LG = "bold 22px ui-monospace, monospace";
const FONT_XL = "bold 26px ui-monospace, monospace";

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size = 16,
  col = color("ui_text"),
  align: "left" | "center" | "right" = "left",
  baseline: "top" | "middle" | "bottom" = "top",
): void {
  ctx.fillStyle = col;
  ctx.font = `bold ${size}px ui-monospace, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
}

export function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  col = color("ui_panel"),
): void {
  ctx.fillStyle = col;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = "#3C3C46";
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 8);
  ctx.stroke();
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

export function drawHud(ctx: CanvasRenderingContext2D, game: IGame, w: number, hgt: number): void {
  const p = game.player!;
  drawPanel(ctx, 16, 14, 330, 118);
  const hpFrac = Math.max(0, p.hp / p.maxHp);
  ctx.fillStyle = "#28101C";
  roundRect(ctx, 28, 26, 306, 24, 5);
  ctx.fill();
  ctx.fillStyle = "#DC323C";
  if (hpFrac > 0) {
    roundRect(ctx, 28, 26, 306 * hpFrac, 24, 5);
    ctx.fill();
  }
  drawText(ctx, `HP ${Math.floor(p.hp)} / ${Math.floor(p.maxHp)}`, 28 + 306 / 2, 26 + 12, 17, "#FFFFFF", "center", "middle");

  const armorFrac = p.armor / 100;
  ctx.fillStyle = "#101E2C";
  roundRect(ctx, 28, 56, 306, 14, 5);
  ctx.fill();
  ctx.fillStyle = color("ui_blue");
  if (armorFrac > 0) {
    roundRect(ctx, 28, 56, 306 * armorFrac, 14, 5);
    ctx.fill();
  }
  drawText(ctx, `ARMOR ${Math.floor(p.armor)}`, 28 + 306 - 6, 56 + 7, 13, "#FFFFFF", "right", "middle");

  drawText(ctx, `LV ${p.level}`, 30, 82, 17);
  const xpFrac = p.xp / p.xpNeeded;
  ctx.fillStyle = "#14241A";
  roundRect(ctx, 78, 86, 256, 12, 4);
  ctx.fill();
  ctx.fillStyle = color("xp");
  if (xpFrac > 0) {
    roundRect(ctx, 78, 86, 256 * xpFrac, 12, 4);
    ctx.fill();
  }

  // Right panel
  const px = w - 179;
  const py = 14;
  const pw = 166;
  const ph = 40;
  const cy = py + ph / 2;

  drawPanel(ctx, px, py, pw, ph);

  // Measure text width to position score value correctly next to SCORE
  ctx.font = "bold 12px ui-monospace, monospace";
  const lblW = ctx.measureText("SCORE").width;

  drawText(ctx, "SCORE", px + 12, cy, 12, color("ui_dim"), "left", "middle");
  drawText(ctx, String(game.score), px + 12 + lblW + 6, cy, 17, color("ui_gold"), "left", "middle");
  drawText(ctx, `$${p.coins}`, px + pw - 12, cy, 17, color("ui_green"), "right", "middle");

  // Bottom-left weapon
  const wep = p.weapons.current;
  drawPanel(ctx, 16, hgt - 84, 320, 68);
  drawText(ctx, wep.name, 30, hgt - 66, 19);
  if (wep.reloading) {
    const total = Math.max(0.01, (wep as unknown as { reloadTotal: number }).reloadTotal);
    const t = 1 - (wep as unknown as { reloadTimer: number }).reloadTimer / total;
    drawText(ctx, `RELOADING ${Math.floor(t * 100)}%`, wpanelRight(16, 320) - 16, hgt - 64, 15, "#FFB43C", "right");
  } else {
    drawText(ctx, `${wep.ammo} / ${wep.reserve}`, wpanelRight(16, 320) - 16, hgt - 66, 22, undefined, "right");
  }
  const slots = WEAPON_ORDER.filter((wid) => (p.weapons as unknown as { weapons: Record<string, unknown> }).weapons[wid]);
  const slotStr = slots
    .map((wid, i) => `[${i + 1}]${(wep.id === wid ? "•" : wid.slice(0, 2)).toUpperCase()}`)
    .join(" ");
  drawText(ctx, slotStr, 30, hgt - 34, 12, color("ui_dim"));

  // Bottom-right: time + day/night
  const isNight = game.isNight();
  const icon = isNight ? "NIGHT" : "DAY";
  const col = isNight ? "#9696E6" : color("ui_blue");
  drawText(ctx, `${formatTime(game.elapsed)}   ${icon}`, w - 20, hgt - 40, 15, col, "right", "bottom");
  if (game.showFps) {
    drawText(ctx, `FPS ${game.fpsDisplay}`, w - 20, hgt - 62, 14, color("ui_dim"), "right", "bottom");
  }

  // Top-center: wave
  const wm = game.waveManager;
  const sub =
    wm.state === "active"
      ? `${wm.to_spawn + game.zombies.length} LEFT`
      : `NEXT IN ${Math.max(0, Math.floor(wm.timer))}s`;
  drawText(ctx, `WAVE ${Math.max(1, wm.wave)}`, w / 2, 18, 26, undefined, "center");
  drawText(ctx, sub, w / 2, 48, 14, color("ui_dim"), "center");

  if (game.combo >= 5) {
    const mult = game.comboMultiplier();
    const pulse = 1 + 0.08 * Math.abs(Math.sin(game.elapsed * 8));
    drawText(ctx, `COMBO x${mult}  (${game.combo})`, w / 2, 76, Math.floor(20 * pulse), color("ui_gold"), "center");
  }

  // Draw Room Code & Coop player list
  const nm = (game as any).networkMode;
  if (nm && nm !== "single") {
    const rc = (game as any).roomCode;
    const remotePlayers = (game as any).remotePlayers || new Map();
    const panelH = 34 + (remotePlayers.size * 20) + 20;
    drawPanel(ctx, 16, 140, 200, panelH);
    drawText(ctx, `ROOM: ${rc}`, 28, 148, 14, color("ui_gold"), "left", "top");
    let py = 168;
    const names = [game.player?.username || "You", ...Array.from(remotePlayers.values()).map((rp: any) => rp.username)];
    for (const name of names) {
      drawText(ctx, `• ${name}`, 28, py, 12, "#EBEBE1", "left", "top");
      py += 20;
    }
  }
}

function wpanelRight(x: number, w: number): number {
  return x + w;
}

export function drawMinimap(ctx: CanvasRenderingContext2D, game: IGame, screenW: number, scale: number): void {
  const size = MINIMAP_SIZE * scale;
  const x0 = screenW - size - 16;
  const y0 = 62;
  drawPanel(ctx, x0 - 3, y0 - 3, size + 6, size + 6, "#0A0A0C");
  if (game.map && game.map.minimap) {
    ctx.drawImage(game.map.minimap, x0, y0, size, size);
  }
  const vr = game.camera.viewRect();
  ctx.strokeStyle = "#5A5A64";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    x0 + (vr.x * size) / 4000,
    y0 + (vr.y * size) / 4000,
    (vr.w * size) / 4000,
    (vr.h * size) / 4000,
  );
  // Loot dots
  ctx.fillStyle = color("ui_gold");
  for (const l of game.loots) {
    ctx.fillRect(
      x0 + (l.pos.x * size) / 4000,
      y0 + (l.pos.y * size) / 4000,
      1,
      1,
    );
  }
  // Supply crate dots — larger, distinct diamond marker
  const crates = (game as any).supplyCrates as Array<{ pos: { x: number; y: number }; dead: boolean; kind: string }> | undefined;
  if (crates) {
    for (const c of crates) {
      if (c.dead) continue;
      const cx = x0 + (c.pos.x * size) / 4000;
      const cy = y0 + (c.pos.y * size) / 4000;
      // Diamond marker: 3px across
      const crateColor = c.kind === "ammo" ? "#D2BE5A" : c.kind === "medical" ? "#FF6070" : c.kind === "armor" ? "#6EC4FF" : "#D096FF";
      ctx.fillStyle = crateColor;
      ctx.beginPath();
      ctx.moveTo(cx,     cy - 3);
      ctx.lineTo(cx + 3, cy);
      ctx.lineTo(cx,     cy + 3);
      ctx.lineTo(cx - 3, cy);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Zombies
  for (const z of game.zombies) {
    const isBoss = z.KIND === "boss" || z.KIND === "necromancer_boss";
    ctx.fillStyle = z.KIND === "necromancer_boss" ? "#B06CFF" : isBoss ? "#FFD250" : "#D23232";
    const r = isBoss ? 3 : 2;
    ctx.beginPath();
    ctx.arc(
      x0 + (z.pos.x * size) / 4000,
      y0 + (z.pos.y * size) / 4000,
      r,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  // Remote players on minimap
  const remotePlayers = (game as any).remotePlayers;
  if (remotePlayers) {
    ctx.fillStyle = "#5ADCFF";
    for (const rp of remotePlayers.values()) {
      ctx.beginPath();
      ctx.arc(
        x0 + (rp.pos.x * size) / 4000,
        y0 + (rp.pos.y * size) / 4000,
        3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  // Player
  const p = game.player!;
  ctx.fillStyle = "#F0FAFF";
  ctx.beginPath();
  ctx.arc(
    x0 + (p.pos.x * size) / 4000,
    y0 + (p.pos.y * size) / 4000,
    3,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.strokeStyle = "#0A0A0C";
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  spreadPx = 6,
): void {
  const col = "#F0F0F0";
  const gap = 4 + spreadPx;
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * gap, y + dy * gap);
    ctx.lineTo(x + dx * (gap + 7), y + dy * (gap + 7));
    ctx.stroke();
  }
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x, y, 1, 0, Math.PI * 2);
  ctx.fill();
}

export function drawToasts(
  ctx: CanvasRenderingContext2D,
  toasts: { text: string; remaining: number }[],
  screenH: number,
  screenW: number,
): void {
  let y = screenH - 110;
  const last5 = toasts.slice(-5).reverse();
  for (const t of last5) {
    const alpha = Math.min(1, t.remaining / 0.5);
    const tw = ctx.measureText(t.text).width;
    const padX = 9;
    const padY = 5;
    const boxW = tw + padX * 2;
    const boxH = 22 + padY * 2;
    const boxX = screenW - boxW - 24;
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = "#14141A";
    roundRect(ctx, boxX, y, boxW, boxH, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#FFEBAA";
    ctx.font = FONT;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(t.text, boxX + padX, y + boxH / 2);
    y -= 32;
  }
}

export class Button {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  action: string;
  accent: string;
  hover = 0;
  pressed = 0;

  constructor(
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    action: string,
    accent?: string,
  ) {
    this.text = text;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.action = action;
    this.accent = accent ?? color("ui_accent");
  }

  contains(px: number, py: number): boolean {
    return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
  }

  update(dt: number, mx: number, my: number, pressed: boolean): void {
    const target = this.contains(mx, my) ? 1 : 0;
    this.hover += (target - this.hover) * Math.min(1, dt * 8);
    this.pressed = Math.max(0, this.pressed - dt * 5);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const grow = this.hover * 6 - this.pressed * 8;
    const r = { x: this.x - grow / 2, y: this.y - grow / 4, w: this.w + grow, h: this.h + grow / 2 };

    ctx.save();

    // Outer glow
    if (this.hover > 0.05) {
      ctx.globalAlpha = this.hover * 0.18;
      ctx.fillStyle = this.accent;
      roundRect(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 14);
      ctx.fill();
    }

    // Background
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.hover > 0.4 ? "#2E2E3A" : "#22222A";
    roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fill();

    // Border
    ctx.globalAlpha = 0.5 + this.hover * 0.5;
    ctx.strokeStyle = this.accent;
    ctx.lineWidth = this.hover > 0.5 ? 3 : 2;
    roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.stroke();

    ctx.restore(); // globalAlpha = 1 restored here

    if (this.text) {
      drawText(ctx, this.text, r.x + r.w / 2, r.y + r.h / 2, 22, this.hover < 0.4 ? "#DEDED6" : "#FFFFFF", "center", "middle");
    }
  }
}

/**
 * Draw custom procedural vector icons for weapons, supplies, and upgrades inside shop menus.
 */
export function drawShopIcon(
  ctx: CanvasRenderingContext2D,
  key: string,
  x: number,
  y: number,
  w: number,
  h: number,
  owned: boolean
): void {
  ctx.save();
  
  // Background
  ctx.fillStyle = "#121216";
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  
  // Border
  ctx.strokeStyle = owned ? color("ui_green") : "rgba(240, 200, 80, 0.25)";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 6);
  ctx.stroke();

  // Normalize id
  let id = key;
  if (key.startsWith("weapon:")) {
    id = key.slice("weapon:".length);
  } else if (key === "ammo_pack") {
    id = "ammo";
  } else if (key === "health" || key === "medkit") {
    id = "medkit";
  } else if (key === "armor_plate") {
    id = "armor";
  }

  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.translate(cx, cy);

  if (id === "pistol") {
    // Grip
    ctx.fillStyle = "#806238"; // Brown
    ctx.beginPath();
    ctx.moveTo(-6, -1);
    ctx.lineTo(-12, 11);
    ctx.lineTo(-7, 11);
    ctx.lineTo(-2, -1);
    ctx.closePath();
    ctx.fill();

    // Trigger guard
    ctx.strokeStyle = "#82827E";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 2, 3, 0, Math.PI * 2);
    ctx.stroke();

    // Slide / Barrel (grey steel)
    ctx.fillStyle = "#82827E";
    ctx.fillRect(-10, -9, 20, 5);
    ctx.fillStyle = "#4E4E54";
    ctx.fillRect(-10, -4, 8, 4);
    
    // Laser dot pointer/sight
    ctx.fillStyle = "#FF3C46";
    ctx.fillRect(8, -8, 2, 2);
  } else if (id === "shotgun") {
    // Stock & grip (wood)
    ctx.fillStyle = "#806238";
    ctx.beginPath();
    ctx.moveTo(-22, -2);
    ctx.lineTo(-18, 6);
    ctx.lineTo(-10, 2);
    ctx.lineTo(-2, 2);
    ctx.lineTo(-4, -5);
    ctx.lineTo(-22, -5);
    ctx.closePath();
    ctx.fill();

    // Forend (pump)
    ctx.fillStyle = "#9C7640";
    ctx.fillRect(2, -2, 10, 4);

    // Barrel
    ctx.fillStyle = "#4E4E54";
    ctx.fillRect(-10, -5, 32, 3);
    ctx.fillRect(-4, -2, 6, 2);
  } else if (id === "smg") {
    // Grip
    ctx.fillStyle = "#1E1E24";
    ctx.beginPath();
    ctx.moveTo(-6, 1);
    ctx.lineTo(-10, 11);
    ctx.lineTo(-5, 11);
    ctx.lineTo(-1, 1);
    ctx.closePath();
    ctx.fill();

    // Mag (curved)
    ctx.fillStyle = "#2E2E32";
    ctx.beginPath();
    ctx.moveTo(1, 1);
    ctx.quadraticCurveTo(3, 10, -1, 13);
    ctx.lineTo(3, 14);
    ctx.quadraticCurveTo(7, 10, 5, 1);
    ctx.closePath();
    ctx.fill();

    // Receiver
    ctx.fillStyle = "#3C3C46";
    ctx.fillRect(-12, -7, 20, 8);

    // Stock
    ctx.strokeStyle = "#5A5A60";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-12, -5);
    ctx.lineTo(-20, -3);
    ctx.lineTo(-20, 6);
    ctx.stroke();

    // Barrel
    ctx.fillStyle = "#787882";
    ctx.fillRect(8, -5, 8, 2);
  } else if (id === "rifle") {
    // Stock
    ctx.fillStyle = "#344E38"; // Olive green
    ctx.beginPath();
    ctx.moveTo(-22, -5);
    ctx.lineTo(-22, 3);
    ctx.lineTo(-14, 3);
    ctx.lineTo(-8, -1);
    ctx.lineTo(-10, -6);
    ctx.closePath();
    ctx.fill();

    // Grip
    ctx.fillStyle = "#1A1A1E";
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-9, 10);
    ctx.lineTo(-5, 10);
    ctx.lineTo(-2, 0);
    ctx.closePath();
    ctx.fill();

    // Mag (curved banana clip)
    ctx.fillStyle = "#2E2E32";
    ctx.beginPath();
    ctx.moveTo(1, 1);
    ctx.quadraticCurveTo(5, 12, 0, 16);
    ctx.lineTo(4, 17);
    ctx.quadraticCurveTo(9, 12, 6, 1);
    ctx.closePath();
    ctx.fill();

    // Receiver
    ctx.fillStyle = "#2E2E34";
    ctx.fillRect(-10, -6, 18, 8);

    // Handguard
    ctx.fillStyle = "#806238"; // Wood brown
    ctx.fillRect(8, -6, 10, 6);

    // Barrel & sight
    ctx.fillStyle = "#5A5A60";
    ctx.fillRect(18, -5, 14, 2);
    ctx.fillStyle = "#1E1E22";
    ctx.fillRect(30, -7, 2, 2);
  } else if (id === "sniper") {
    // Stock
    ctx.fillStyle = "#445A44";
    ctx.beginPath();
    ctx.moveTo(-24, -3);
    ctx.lineTo(-22, 5);
    ctx.lineTo(-12, 5);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-8, -5);
    ctx.closePath();
    ctx.fill();

    // Body
    ctx.fillStyle = "#2E2E34";
    ctx.fillRect(-8, -5, 18, 6);

    // Long barrel
    ctx.fillStyle = "#5A5A60";
    ctx.fillRect(10, -4, 26, 2);
    // Muzzle brake
    ctx.fillStyle = "#1E1E22";
    ctx.fillRect(36, -5, 3, 4);

    // Scope
    ctx.fillStyle = "#1E1E24";
    ctx.fillRect(-4, -9, 12, 3); // tube
    ctx.fillRect(-6, -10, 2, 5);  // ocular
    ctx.fillRect(8, -10, 3, 5);   // objective
    // Scope mounts
    ctx.fillStyle = "#2E2E34";
    ctx.fillRect(-2, -6, 1, 1);
    ctx.fillRect(4, -6, 1, 1);
  } else if (id === "ammo") {
    // Ammo pack box
    ctx.fillStyle = "#5AB4FF"; // ui_blue
    roundRect(ctx, -12, -10, 24, 18, 3);
    ctx.fill();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1.5;
    
    // Draw white bullet outline or lines
    ctx.beginPath();
    ctx.moveTo(-8, -4); ctx.lineTo(-8, 4);
    ctx.moveTo(-4, -6); ctx.lineTo(-4, 4);
    ctx.moveTo(0, -6); ctx.lineTo(0, 4);
    ctx.moveTo(4, -6); ctx.lineTo(4, 4);
    ctx.moveTo(8, -4); ctx.lineTo(8, 4);
    ctx.stroke();

    // Box label line
    ctx.fillStyle = "#1E1E24";
    ctx.fillRect(-10, 5, 20, 3);
  } else if (id === "medkit") {
    // Medkit box (red)
    ctx.fillStyle = "#FF3C46"; // ui_accent
    roundRect(ctx, -14, -10, 28, 20, 4);
    ctx.fill();

    // Cross
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(-3, -7, 6, 14);
    ctx.fillRect(-7, -3, 14, 6);
  } else if (id === "armor") {
    // Armor plate/shield
    ctx.fillStyle = "#5AB4FF"; // ui_blue
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(12, -8);
    ctx.lineTo(10, 4);
    ctx.quadraticCurveTo(0, 14, 0, 14);
    ctx.quadraticCurveTo(0, 14, -10, 4);
    ctx.lineTo(-12, -8);
    ctx.closePath();
    ctx.fill();

    // Shield inner highlight
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(7, -5);
    ctx.lineTo(6, 2);
    ctx.quadraticCurveTo(0, 9, 0, 9);
    ctx.quadraticCurveTo(0, 9, -6, 2);
    ctx.lineTo(-7, -5);
    ctx.closePath();
    ctx.stroke();
  } else if (id === "max_hp") {
    // Heart icon (green/emerald for hp upgrade)
    ctx.fillStyle = "#6EDC82"; // ui_green
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.bezierCurveTo(-3, -12, -12, -12, -12, -4);
    ctx.bezierCurveTo(-12, 3, -4, 8, 0, 14);
    ctx.bezierCurveTo(4, 8, 12, 3, 12, -4);
    ctx.bezierCurveTo(12, -12, 3, -12, 0, -6);
    ctx.closePath();
    ctx.fill();
  } else if (id === "damage") {
    // Crossed swords or glowing fist
    ctx.fillStyle = "#FF3C46"; // ui_accent
    ctx.save();
    // Left sword
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-2, -14, 4, 20); // blade
    ctx.fillStyle = "#DEDED6";
    ctx.fillRect(-4, 6, 8, 2);   // guard
    ctx.fillStyle = "#806238";
    ctx.fillRect(-1.5, 8, 3, 5);  // hilt
    ctx.restore();
    
    ctx.save();
    // Right sword
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = "#FF3C46";
    ctx.fillRect(-2, -14, 4, 20); // blade
    ctx.fillStyle = "#DEDED6";
    ctx.fillRect(-4, 6, 8, 2);   // guard
    ctx.fillStyle = "#806238";
    ctx.fillRect(-1.5, 8, 3, 5);  // hilt
    ctx.restore();
  } else if (id === "speed") {
    // A boot with wing or speed lines
    ctx.fillStyle = "#5AB4FF"; // ui_blue
    // Wing feathers
    ctx.beginPath();
    ctx.moveTo(-12, -8);
    ctx.quadraticCurveTo(-2, -8, 2, -4);
    ctx.quadraticCurveTo(-6, -1, -12, -3);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-14, -4);
    ctx.quadraticCurveTo(-4, -4, 0, 0);
    ctx.quadraticCurveTo(-8, 3, -14, 1);
    ctx.fill();
    
    // Boot outline
    ctx.fillStyle = "#DEDED6";
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.lineTo(2, -4);
    ctx.lineTo(4, 4);
    ctx.lineTo(12, 6);
    ctx.lineTo(12, 11);
    ctx.lineTo(-2, 11);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
  } else if (id === "fire_rate") {
    // Clock / lightning or fast bullet
    ctx.fillStyle = "#F0C850"; // ui_gold
    // Draw outer clock ring
    ctx.strokeStyle = "#F0C850";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(-4, 1, 9, 0, Math.PI * 2);
    ctx.stroke();
    // Clock hands
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-4, 1);
    ctx.lineTo(-4, -4);
    ctx.moveTo(-4, 1);
    ctx.lineTo(-1, 3);
    ctx.stroke();

    // Fast bullet moving right
    ctx.fillStyle = "#FFE88C";
    ctx.fillRect(4, -3, 8, 4);
    ctx.beginPath();
    ctx.arc(12, -1, 2, -Math.PI/2, Math.PI/2);
    ctx.fill();
    
    // Speed lines
    ctx.strokeStyle = "#FF3C46";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(1, -5); ctx.lineTo(-1, -5);
    ctx.moveTo(2, 3); ctx.lineTo(0, 3);
    ctx.stroke();
  } else if (id === "flamethrower") {
    // Fuel tank + nozzle with a burning tip
    ctx.fillStyle = "#C2501E";
    roundRect(ctx, -12, -6, 10, 12, 3);
    ctx.fill();
    ctx.fillStyle = "#82827E";
    ctx.fillRect(2, -2, 12, 4);
    ctx.fillStyle = "#FFB03A";
    ctx.beginPath(); ctx.moveTo(13, -4); ctx.lineTo(21, -1); ctx.lineTo(13, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#FF5A1E";
    ctx.beginPath(); ctx.moveTo(16, -2); ctx.lineTo(24, 0); ctx.lineTo(16, 2); ctx.closePath(); ctx.fill();
  } else if (id === "plasma") {
    // Coil rifle with a glowing energy orb
    ctx.fillStyle = "#7A4FBF";
    roundRect(ctx, -12, -3, 24, 6, 2);
    ctx.fill();
    ctx.fillStyle = "#2E2152";
    ctx.fillRect(-10, -1, 8, 2);
    ctx.fillStyle = "#C58CFF";
    ctx.beginPath(); ctx.arc(13, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#F0E0FF";
    ctx.beginPath(); ctx.arc(12, -1, 1.5, 0, Math.PI * 2); ctx.fill();
  } else if (id === "crossbow") {
    // Stock + limb with string, and a bolt
    ctx.fillStyle = "#A2713E";
    ctx.fillRect(-12, -1, 10, 4);
    ctx.fillRect(-4, -7, 3, 14);
    ctx.strokeStyle = "#C8C8C8";
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-2, -7); ctx.lineTo(10, 0); ctx.lineTo(-2, 7); ctx.stroke();
    ctx.fillStyle = "#E8E8E8";
    ctx.beginPath(); ctx.moveTo(12, -1); ctx.lineTo(17, 0); ctx.lineTo(12, 1); ctx.closePath(); ctx.fill();
  } else if (id === "drone") {
    // UFO saucer: dome + disc + glow, matching the in-game drone
    ctx.strokeStyle = "rgba(140, 230, 255, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#3A3A44";
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8FE8FF";
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#EAFBFF";
    ctx.beginPath(); ctx.arc(-2.5, -2.5, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();
}
