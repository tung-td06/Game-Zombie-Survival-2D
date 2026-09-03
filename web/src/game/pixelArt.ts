// src/game/pixelArt.ts
// Reusable pixel-art drawing primitives for the browser renderer.

import type { Vec } from "./vec";

export const PIXEL = 2;
export const TILE_SIZE = 64;

export interface PixelLight {
  pos: Vec;
  radius: number;
  color: string;
  intensity?: number;
}

export interface PixelArtAtlas {
  scale: number;
  createdAt: number;
}

const atlasCache = new WeakMap<CanvasRenderingContext2D, PixelArtAtlas>();

export function pixelVariant(seed: number, x: number, y: number, variants: number): number {
  if (variants <= 1) return 0;
  let h = Math.imul((x | 0) ^ Math.imul(y | 0, 374761393) ^ seed, 668265263);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % variants;
}

export function getPixelArtAtlas(ctx: CanvasRenderingContext2D): PixelArtAtlas {
  const cached = atlasCache.get(ctx);
  if (cached) return cached;
  const atlas = { scale: PIXEL, createdAt: Date.now() };
  atlasCache.set(ctx, atlas);
  return atlas;
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function strokeRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, line = 2): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = line;
  ctx.strokeRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size = PIXEL): void {
  rect(ctx, x, y, size, size, color);
}

function worldHash(seed: number, x: number, y: number): number {
  return pixelVariant(seed + 71, Math.floor(x / 8), Math.floor(y / 8), 997);
}

export function drawGroundTile(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  variant: number,
  seed: number,
  road = false,
): void {
  const base = road
    ? ["#25262A", "#292A2E", "#222328"][variant % 3]!
    : ["#252B20", "#292E22", "#22291E", "#2C3024", "#20271C", "#303425"][variant % 6]!;
  rect(ctx, sx, sy, TILE_SIZE, TILE_SIZE, base);

  const fleck = road ? ["#3A3A3D", "#17191A", "#4B4841"] : ["#3D482E", "#182016", "#4A4731", "#303720"];
  for (let i = 0; i < 11; i++) {
    const h = worldHash(seed + i * 19, sx + i * 13, sy - i * 7);
    const x = sx + (h % 58) + 2;
    const y = sy + (Math.floor(h / 17) % 58) + 2;
    const size = h % 4 === 0 ? 4 : 2;
    px(ctx, x, y, fleck[h % fleck.length]!, size);
  }

  if (!road && variant % 4 === 0) {
    rect(ctx, sx + 34, sy + 10, 14, 2, "#55613B");
    rect(ctx, sx + 42, sy + 8, 2, 7, "#55613B");
    rect(ctx, sx + 21, sy + 46, 9, 2, "#59603A");
  }
  if (!road && variant === 3) {
    rect(ctx, sx + 8, sy + 39, 16, 6, "#1C302A");
    rect(ctx, sx + 10, sy + 40, 11, 2, "#2E5146");
  }
  if (road && variant === 2) {
    rect(ctx, sx + 10, sy + 22, 22, 2, "#4A4140");
    rect(ctx, sx + 28, sy + 22, 2, 8, "#4A4140");
  }
}

export function drawRoadDetails(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  vertical: boolean,
): void {
  rect(ctx, x, y, w, h, "#1B1D1C");
  rect(ctx, x + 3, y + 3, w - 6, h - 6, "#2A2A2D");
  rect(ctx, x + 5, y + 5, w - 10, h - 10, "#26272A");
  const line = "#C29C4C";
  if (vertical) {
    for (let py = y + 8; py < y + h - 6; py += 70) {
      rect(ctx, x + w / 2 - 3, py, 6, 34, line);
      rect(ctx, x + w / 2 - 2, py + 2, 2, 30, "#E1C86D");
    }
  } else {
    for (let px0 = x + 8; px0 < x + w - 6; px0 += 70) {
      rect(ctx, px0, y + h / 2 - 3, 34, 6, line);
      rect(ctx, px0 + 2, y + h / 2 - 2, 30, 2, "#E1C86D");
    }
  }
}

export function drawPropSprite(
  ctx: CanvasRenderingContext2D,
  kind: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  getPixelArtAtlas(ctx);
  const shadowX = x + 5;
  const shadowY = y + 6;
  rect(ctx, shadowX, shadowY, w, h, "rgba(6,8,7,0.52)");

  if (kind === "building") {
    rect(ctx, x, y, w, h, "#24262D");
    rect(ctx, x + 4, y + 4, w - 8, h - 8, "#474754");
    rect(ctx, x + 8, y + 8, w - 16, h - 16, "#3A3A46");
    strokeRect(ctx, x, y, w, h, "#17191E", 3);
    for (let wy = y + 18; wy < y + h - 20; wy += 32) {
      for (let wx = x + 16; wx < x + w - 18; wx += 28) {
        const lit = ((Math.floor(wx / 28) + Math.floor(wy / 32)) % 3) !== 0;
        rect(ctx, wx, wy, 12, 14, lit ? "#D1AC58" : "#20242D");
        rect(ctx, wx + 2, wy + 2, 8, 2, lit ? "#F1D882" : "#303541");
      }
    }
    rect(ctx, x + w * 0.42, y + h - 17, 18, 13, "#211D22");
    return;
  }
  if (kind === "house") {
    rect(ctx, x, y, w, h, "#342820");
    rect(ctx, x + 4, y + 10, w - 8, h - 14, "#72503C");
    ctx.fillStyle = "#4C302C";
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 17);
    ctx.lineTo(x + w / 2, y + 2);
    ctx.lineTo(x + w - 4, y + 17);
    ctx.closePath();
    ctx.fill();
    for (let sx = x + 12; sx < x + w - 12; sx += 9) rect(ctx, sx, y + 14 - Math.abs(sx - (x + w / 2)) * 0.22, 7, 2, "#81594A");
    rect(ctx, x + w * 0.45, y + h - 22, 16, 18, "#39251E");
    rect(ctx, x + 12, y + h * 0.48, 13, 12, "#D4AF58");
    rect(ctx, x + w - 25, y + h * 0.48, 13, 12, "#D4AF58");
    strokeRect(ctx, x, y, w, h, "#241914", 3);
    return;
  }
  if (kind === "tree") {
    rect(ctx, x + w * 0.45, y + h * 0.4, Math.max(5, w * 0.13), h * 0.5, "#4C321D");
    rect(ctx, x + w * 0.48, y + h * 0.42, 3, h * 0.44, "#87613B");
    const r = w * 0.38;
    ctx.fillStyle = "#13271B";
    ctx.beginPath(); ctx.arc(x + w / 2 + 4, y + h * 0.42 + 5, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#28583A";
    ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.38, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3C7545";
    ctx.beginPath(); ctx.arc(x + w * 0.4, y + h * 0.28, r * 0.46, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (kind.startsWith("car_")) {
    const body = kind === "car_red" ? "#A93B36" : kind === "car_blue" ? "#355A9C" : "#B49234";
    rect(ctx, x, y + 8, w, h - 12, "#17191F");
    rect(ctx, x + 3, y + 4, w - 6, h - 12, body);
    rect(ctx, x + 12, y + 7, w - 24, h * 0.28, "#476878");
    rect(ctx, x + 15, y + 9, w - 30, 3, "#8FB3BF");
    rect(ctx, x + 4, y + h - 10, 10, 4, "#E5D071");
    rect(ctx, x + w - 14, y + h - 10, 10, 4, "#C84643");
    strokeRect(ctx, x + 3, y + 4, w - 6, h - 12, "#16161C", 2);
    return;
  }
  if (kind === "container") {
    rect(ctx, x, y, w, h, "#173B3E");
    rect(ctx, x + 3, y + 3, w - 6, h - 6, "#356B6C");
    for (let sx = x + 9; sx < x + w - 5; sx += 13) rect(ctx, sx, y + 4, 3, h - 8, "#245456");
    rect(ctx, x + w * 0.66, y + h * 0.25, 10, 4, "#9A552D");
    rect(ctx, x + w * 0.21, y + h * 0.64, 14, 3, "#A95D31");
    strokeRect(ctx, x, y, w, h, "#10292C", 3);
    return;
  }
  if (kind === "crate" || kind === "barricade") {
    const c = kind === "crate" ? "#8A6237" : "#74777A";
    rect(ctx, x, y, w, h, c);
    strokeRect(ctx, x, y, w, h, "#29251F", 3);
    if (kind === "crate") {
      ctx.strokeStyle = "#4F341F"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + w - 4, y + h - 4);
      ctx.moveTo(x + w - 4, y + 4); ctx.lineTo(x + 4, y + h - 4); ctx.stroke();
    } else {
      for (let i = -h; i < w; i += 24) {
        ctx.fillStyle = "#D5AA31";
        ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + 12, y + h);
        ctx.lineTo(x + i + h + 12, y); ctx.lineTo(x + i + h, y); ctx.closePath(); ctx.fill();
      }
    }
    return;
  }
  rect(ctx, x, y, w, h, "#303137");
  strokeRect(ctx, x, y, w, h, "#17181C", 2);
}

export function drawPlayerSprite(
  ctx: CanvasRenderingContext2D,
  pos: Vec,
  angle: number,
  walkCycle: number,
  recoil: number,
  weapon: string,
  flash: boolean,
): void {
  const bob = walkCycle ? Math.sin(walkCycle) * 2 : 0;
  const dir = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
  const r = recoil > 0 ? 3 : 0;
  ctx.save();
  ctx.translate(Math.round(pos.x), Math.round(pos.y + bob));
  ctx.rotate(dir);
  rect(ctx, -13, -12, 26, 29, "#111921");
  rect(ctx, -10, -14, 20, 20, flash ? "#EAFBFF" : "#57CDE5");
  rect(ctx, -7, -11, 14, 8, "#A8E8EF");
  rect(ctx, -11, 8, 8, 11, "#2A7699");
  rect(ctx, 3, 8, 8, 11, "#235F80");
  rect(ctx, -8, 12 + Math.sin(walkCycle) * 2, 5, 8, "#1B2C3B");
  rect(ctx, 3, 12 - Math.sin(walkCycle) * 2, 5, 8, "#1B2C3B");
  const gun = weapon === "shotgun" ? 29 : weapon === "sniper" ? 35 : weapon === "rifle" ? 31 : weapon === "smg" ? 25 : 23;
  rect(ctx, 5 - r, -5, gun, 7, "#171A20");
  rect(ctx, 9 - r, -3, gun - 4, 3, weapon === "shotgun" ? "#A2713E" : "#66717A");
  rect(ctx, 4 - r, 2, 10, 5, "#3B414A");
  if (recoil > 0) {
    rect(ctx, gun + 5 - r, -8, 7, 14, "#FFD15C");
    rect(ctx, gun + 12 - r, -4, 5, 6, "#FFF1A0");
  }
  ctx.restore();
}

const zombiePalette: Record<string, readonly [string, string, string]> = {
  normal: ["#3F7436", "#6FA950", "#A8C66B"],
  fast: ["#8A9133", "#B9BE45", "#E0D66C"],
  tank: ["#4C395D", "#78588D", "#B083C1"],
  exploder: ["#82441E", "#C06B2E", "#EEA047"],
  ranged: ["#276A6C", "#4B9891", "#89D3C4"],
  boss: ["#681B2A", "#AB2E3D", "#F06458"],
};

export function drawZombieSprite(
  ctx: CanvasRenderingContext2D,
  pos: Vec,
  kind: string,
  angle: number,
  flash: boolean,
  radius: number,
): void {
  const palette = zombiePalette[kind] ?? zombiePalette.normal;
  const scale = Math.max(0.75, radius / 16);
  const gait = Math.sin((pos.x + pos.y) * 0.04 + performance.now() / 130) * 2 * scale;
  ctx.save();
  ctx.translate(Math.round(pos.x), Math.round(pos.y));
  ctx.rotate(Math.round(angle / (Math.PI / 2)) * (Math.PI / 2));
  if (kind === "boss") {
    ctx.globalAlpha = 0.24 + Math.abs(gait) * 0.04;
    ctx.fillStyle = "#C2294D"; ctx.beginPath(); ctx.arc(0, 0, radius + 11, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  rect(ctx, -13 * scale, -11 * scale, 26 * scale, 27 * scale, "#101611");
  const body = flash ? "#FFFFFF" : palette[1];
  rect(ctx, -11 * scale, -13 * scale, 22 * scale, 19 * scale, body);
  rect(ctx, -8 * scale, -10 * scale, 16 * scale, 5 * scale, palette[2]);
  rect(ctx, -12 * scale, 6 * scale, 9 * scale, 11 * scale + gait, palette[0]);
  rect(ctx, 3 * scale, 6 * scale, 9 * scale, 11 * scale - gait, palette[0]);
  rect(ctx, 5 * scale, -5 * scale, 5 * scale, 4 * scale, "#EE3B3B");
  rect(ctx, 5 * scale, 1 * scale, 5 * scale, 4 * scale, "#EE3B3B");
  if (kind === "exploder") rect(ctx, -3 * scale, -6 * scale, 7 * scale, 9 * scale, "#FFD26E");
  if (kind === "ranged") rect(ctx, 8 * scale, -3 * scale, 13 * scale, 5 * scale, "#22454A");
  ctx.restore();
}

export function drawProjectileSprite(
  ctx: CanvasRenderingContext2D,
  pos: Vec,
  trailA: Vec,
  trailB: Vec,
  enemy: boolean,
): void {
  const col = enemy ? "#FF6A58" : "#FFE48A";
  ctx.strokeStyle = enemy ? "#9F2F34" : "#D09036";
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(Math.round(trailA.x), Math.round(trailA.y)); ctx.lineTo(Math.round(trailB.x), Math.round(trailB.y)); ctx.stroke();
  rect(ctx, pos.x - 3, pos.y - 3, 7, 7, col);
  rect(ctx, pos.x - 1, pos.y - 1, 3, 3, "#FFFFFF");
}

export function drawLootSprite(ctx: CanvasRenderingContext2D, pos: Vec, kind: string, pulse = 0): void {
  const color: Record<string, string> = { coin: "#F0C850", health: "#68D982", armor: "#66B7FF", ammo: "#C4D2E7", weapon: "#C98AFB" };
  const c = color[kind] ?? "#FFFFFF";
  const s = 18 + pulse * 2;
  rect(ctx, pos.x - s / 2 + 3, pos.y - s / 2 + 4, s, s, "#0E1114");
  rect(ctx, pos.x - s / 2, pos.y - s / 2, s, s, c);
  rect(ctx, pos.x - s / 2 + 3, pos.y - s / 2 + 3, s - 6, 3, "#FFFFFF");
  if (kind === "health") { rect(ctx, pos.x - 2, pos.y - 6, 4, 12, "#FFFFFF"); rect(ctx, pos.x - 6, pos.y - 2, 12, 4, "#FFFFFF"); }
  if (kind === "ammo") for (let i = -5; i <= 5; i += 5) rect(ctx, pos.x + i, pos.y - 6, 3, 12, "#303A44");
  if (kind === "coin") { rect(ctx, pos.x - 4, pos.y - 4, 8, 8, "#FFE998"); rect(ctx, pos.x - 2, pos.y - 2, 4, 4, "#D99E31"); }
}

export function drawPixelLight(
  ctx: CanvasRenderingContext2D,
  lights: readonly PixelLight[],
  width: number,
  height: number,
  darkness: number,
): void {
  if (darkness <= 0.01) return;
  ctx.save();
  ctx.fillStyle = "rgba(5, 8, 15, " + Math.min(0.55, darkness) + ")";
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "destination-out";
  for (const light of lights) {
    const radius = Math.max(8, light.radius);
    const intensity = light.intensity ?? 1;
    for (let ring = 1; ring <= 4; ring++) {
      const r = radius * (ring / 4);
      ctx.globalAlpha = (0.07 + (ring === 4 ? 0.18 : 0)) * intensity;
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(Math.round(light.pos.x), Math.round(light.pos.y), Math.round(r), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = "source-over";
  for (const light of lights) {
    ctx.globalAlpha = 0.13 * (light.intensity ?? 1);
    ctx.fillStyle = light.color;
    ctx.beginPath();
    ctx.arc(Math.round(light.pos.x), Math.round(light.pos.y), Math.round(light.radius * 0.44), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
