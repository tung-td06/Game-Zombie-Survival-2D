// src/game/pixelArt.ts
// Reusable pixel-art drawing primitives for the browser renderer.

import type { Vec } from "./vec";

export const PIXEL = 2;

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

export function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size = PIXEL): void {
  rect(ctx, x, y, size, size, color);
}

export function worldHash(seed: number, x: number, y: number): number {
  return pixelVariant(seed + 71, Math.floor(x / 8), Math.floor(y / 8), 997);
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
  const r = recoil > 0 ? 3 : 0;
  const sx = Math.round(pos.x);
  const sy = Math.round(pos.y + bob);
  const gun =
    weapon === "shotgun"
      ? 29
      : weapon === "sniper"
        ? 35
        : weapon === "rifle"
          ? 31
          : weapon === "smg"
            ? 25
            : weapon === "flamethrower"
              ? 27
              : weapon === "plasma"
                ? 28
                : weapon === "crossbow"
                  ? 32
                  : 23;
  const weaponColor =
    weapon === "shotgun" || weapon === "crossbow"
      ? "#A2713E"
      : weapon === "flamethrower"
        ? "#C2501E"
        : weapon === "plasma"
          ? "#7A4FBF"
          : "#66717A";

  // Body: always upright (head up, feet pointing down) so the character
  // never appears upside down; only mirror it when aiming to the left.
  ctx.save();
  ctx.translate(sx, sy);
  // Soft contact shadow beneath the feet.
  ctx.fillStyle = "rgba(0,0,0,0.26)";
  ctx.beginPath();
  ctx.arc(0, 15, 12, 0, Math.PI * 2);
  ctx.fill();
  if (Math.cos(angle) < -0.2) ctx.scale(-1, 1);
  rect(ctx, -13, -12, 26, 29, "#111921");
  rect(ctx, -10, -14, 20, 20, flash ? "#EAFBFF" : "#57CDE5");
  rect(ctx, -7, -11, 14, 8, "#A8E8EF");
  rect(ctx, -11, 8, 8, 11, "#2A7699");
  rect(ctx, 3, 8, 8, 11, "#235F80");
  rect(ctx, -8, 13 + Math.sin(walkCycle) * 2, 5, 7, "#1B2C3B");
  rect(ctx, 3, 13 - Math.sin(walkCycle) * 2, 5, 7, "#1B2C3B");
  ctx.restore();

  // Weapon: freely rotates to the aim angle around the fixed upright body.
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(angle);
  rect(ctx, -2, -3, 10, 6, "#3B414A"); // stock / shoulder
  rect(ctx, 4 - r, -3.5, gun, 6, "#171A20");
  rect(ctx, 9 - r, -1.5, gun - 6, 3, weaponColor);
  rect(ctx, 1 - r, -2, 5, 4, "#2A7699"); // gripping hand
  if (recoil > 0) {
    rect(ctx, gun + 4 - r, -7, 7, 13, "#FFD15C");
    rect(ctx, gun + 10 - r, -3, 5, 5, "#FFF1A0");
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
  crawler: ["#4E3A1E", "#7C5A2E", "#B58A3C"],
  necromancer: ["#2E2152", "#55408C", "#9A6FD0"],
  necromancer_boss: ["#1A1030", "#3E2568", "#8A5AD0"],
  elite: ["#204048", "#3C7A8C", "#7EC9D6"],
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
  // Soft contact shadow beneath the feet.
  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.beginPath();
  ctx.arc(0, 12 * scale, 12 * scale, 0, Math.PI * 2);
  ctx.fill();
  // Body always stands upright (head up / feet down) — it never flips upside
  // down; only mirror it when moving horizontally to the left.
  const flip = Math.cos(angle) < -0.25;
  if (flip) ctx.scale(-1, 1);
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
  if (kind === "crawler") {
    // Low, wide body that stays close to the ground.
    rect(ctx, -16 * scale, 4 * scale, 32 * scale, 7 * scale, palette[0]);
    rect(ctx, -12 * scale, -2 * scale, 6 * scale, 8 * scale, palette[1]);
    rect(ctx, 6 * scale, -2 * scale, 6 * scale, 8 * scale, palette[1]);
  }
  if (kind === "necromancer" || kind === "necromancer_boss") {
    // Hooded caster silhouette + glowing eye.
    rect(ctx, -10 * scale, -18 * scale, 20 * scale, 8 * scale, palette[0]);
    rect(ctx, 5 * scale, -6 * scale, 4 * scale, 4 * scale, "#F2D5FF");
  }
  ctx.restore();
}

export function drawProjectileSprite(
  ctx: CanvasRenderingContext2D,
  pos: Vec,
  trailA: Vec,
  trailB: Vec,
  enemy: boolean,
  elem?: string,
): void {
  let col = enemy ? "#FF6A58" : "#FFE48A";
  let trail = enemy ? "#9F2F34" : "#D09036";
  let core = "#FFFFFF";
  if (!enemy) {
    if (elem === "fire") {
      col = "#FFB03A";
      trail = "#A63A00";
      core = "#FFF3B0";
    } else if (elem === "plasma") {
      col = "#C58CFF";
      trail = "#5A2FA0";
      core = "#F0E0FF";
    } else if (elem === "pierce") {
      col = "#DCE6F2";
      trail = "#6E7F96";
      core = "#FFFFFF";
    }
  }
  ctx.strokeStyle = trail;
  ctx.lineWidth = elem === "pierce" ? 3 : 4;
  ctx.beginPath(); ctx.moveTo(Math.round(trailA.x), Math.round(trailA.y)); ctx.lineTo(Math.round(trailB.x), Math.round(trailB.y)); ctx.stroke();
  rect(ctx, pos.x - 3, pos.y - 3, 7, 7, col);
  rect(ctx, pos.x - 1, pos.y - 1, 3, 3, core);
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
