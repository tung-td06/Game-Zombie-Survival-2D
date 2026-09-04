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

export function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function strokeRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, line = 2): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = line;
  ctx.strokeRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size = PIXEL): void {
  rect(ctx, x, y, size, size, color);
}

export function worldHash(seed: number, x: number, y: number): number {
  return pixelVariant(seed + 71, Math.floor(x / 8), Math.floor(y / 8), 997);
}

/**
 * Draw one world-ground tile. `worldX`/`worldY` are the tile's world-space
 * origin (stable multiples of TILE_SIZE); `sx`/`sy` are its current screen
 * position. Every decorative fleck is hashed from WORLD coordinates so each
 * speck is glued to a fixed world cell — moving the camera can never
 * regenerate, relocate, or recolour the pattern (the old code hashed the
 * screen position, so specks popped in and out while walking).
 */
// Low-frequency tint used to break the flat look into soft meadow patches.
// Deterministic from the tile's 128px block so it never changes with the
// camera; drawn with low alpha so it reads as subtle tone variation.
function blockTint(ctx: CanvasRenderingContext2D, sx: number, sy: number, worldX: number, worldY: number): void {
  const h = worldHash(77, Math.floor(worldX / 128), Math.floor(worldY / 128));
  const kind = h % 10;
  if (kind === 0) {
    ctx.fillStyle = "rgba(16,26,12,0.20)";
  } else if (kind === 1) {
    ctx.fillStyle = "rgba(52,62,34,0.10)";
  } else if (kind === 2) {
    ctx.fillStyle = "rgba(14,22,18,0.16)";
  } else {
    return;
  }
  ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
}

export function drawGroundTile(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  worldX: number,
  worldY: number,
  variant: number,
  seed: number,
  road = false,
): void {
  const base = road
    ? ["#26272B", "#2A2B2F", "#232428"][variant % 3]!
    : ["#252B20", "#292E22", "#22291E", "#2C3024", "#20271C", "#303425"][variant % 6]!;
  rect(ctx, sx, sy, TILE_SIZE, TILE_SIZE, base);
  if (!road) blockTint(ctx, sx, sy, worldX, worldY);

  const fleck = road
    ? ["#3A3A3D", "#17191A", "#4B4841"]
    : ["#2E3826", "#141D10", "#33311F", "#242C1A"];
  for (let i = 0; i < 11; i++) {
    const h = worldHash(seed + i * 19, worldX + i * 13, worldY - i * 7);
    const x = sx + (h % 58) + 2;
    const y = sy + (Math.floor(h / 17) % 58) + 2;
    const size = h % 4 === 0 ? 4 : 2;
    px(ctx, x, y, fleck[h % fleck.length]!, size);
  }

  if (road) {
    // Worn tyre lane along the road middle + occasional crack.
    const rh = worldHash(seed + 31, worldX, worldY);
    if (rh % 3 === 0) {
      rect(ctx, sx + 24, sy + 12, 2, TILE_SIZE - 24, "rgba(14,14,16,0.35)");
      rect(ctx, sx + 38, sy + 12, 2, TILE_SIZE - 24, "rgba(14,14,16,0.35)");
    }
    if (rh % 7 === 0) {
      const cx = sx + 6 + (Math.floor(rh / 5) % 50);
      ctx.strokeStyle = "rgba(12,12,14,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, sy + 2);
      ctx.lineTo(cx + 3, sy + TILE_SIZE - 4);
      ctx.stroke();
    }
    if (variant === 2) {
      rect(ctx, sx + 12, sy + 24, 20, 14, "rgba(10,10,12,0.4)");
      rect(ctx, sx + 30, sy + 24, 2, 14, "#54504A");
    }
    return;
  }

  // Sparse grass-blade clusters, pebbles and tiny wildflowers — all hashed to
  // the tile's world cell so the same tile always draws the same details.
  const g = worldHash(seed + 41, worldX, worldY);
  const micro = Math.floor(g / 3) % 40;
  if (micro < 6) {
    const bx = sx + 10 + (Math.floor(g / 7) % 42);
    const by = sy + 12 + (Math.floor(g / 13) % 40);
    rect(ctx, bx, by, 2, 5, "#3E5A2E");
    rect(ctx, bx + 3, by - 2, 1, 5, "#4E6E38");
    rect(ctx, bx + 6, by + 1, 2, 4, "#3A5230");
  } else if (micro < 9) {
    const px0 = sx + 14 + (Math.floor(g / 11) % 34);
    const py0 = sy + 16 + (Math.floor(g / 19) % 34);
    px(ctx, px0, py0, "#8B8F83", 2);
    px(ctx, px0 + 5, py0 + 4, "#767A70", 2);
  } else if (micro === 12 || micro === 13) {
    const fx = sx + 16 + (Math.floor(g / 23) % 32);
    const fy = sy + 14 + (Math.floor(g / 29) % 36);
    px(ctx, fx, fy, micro === 12 ? "#E6E2C4" : "#D9C86B", 1);
    px(ctx, fx + 2, fy + 1, micro === 12 ? "#F0EDD6" : "#E4D685", 1);
  }

  if (variant % 4 === 0) {
    rect(ctx, sx + 34, sy + 10, 14, 2, "#46502E");
    rect(ctx, sx + 42, sy + 8, 2, 7, "#46502E");
    rect(ctx, sx + 21, sy + 46, 9, 2, "#4A5430");
  }
  if (variant === 3) {
    rect(ctx, sx + 8, sy + 39, 16, 6, "#1C302A");
    rect(ctx, sx + 10, sy + 40, 11, 2, "#2E5146");
  }
}

/**
 * Per-tile terrain zone wash. Cell = 260px world block. Makes the open land
 * read as districts instead of one flat meadow: damp hollows, dirt yards,
 * gravel lots, mossy patches and bare concrete plazas. Deliberately very
 * low alpha so gameplay stays readable.
 */
export function drawTileZone(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  worldX: number,
  worldY: number,
  seed: number,
): void {
  const cx = Math.floor(worldX / 260);
  const cy = Math.floor(worldY / 260);
  const h = worldHash(seed + 509, cx, cy);
  const m = h % 16;
  if (m === 0) {
    ctx.fillStyle = "rgba(26,34,20,0.16)";
  } else if (m === 1 || m === 8) {
    ctx.fillStyle = "rgba(82,72,46,0.14)";
  } else if (m === 2 || m === 9) {
    ctx.fillStyle = "rgba(96,94,84,0.10)";
  } else if (m === 3) {
    ctx.fillStyle = "rgba(42,54,30,0.14)";
  } else if (m === 4) {
    ctx.fillStyle = "rgba(30,38,26,0.18)";
  } else if (m === 5) {
    ctx.fillStyle = "rgba(116,88,60,0.10)";
  } else {
    return;
  }
  ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
}

/**
 * Sparse macro decals for ground overlays. Painted by the map on cells that
 * are away from roads and obstacles, so litter/remains never sit on top of
 * gameplay geometry. `h` is a stable hash of the cell; kind selects what
 * cluster appears. All specks derive from world coordinates.
 */
export function drawGroundDecal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  seed: number,
  h: number,
): void {
  const kind = h % 12;
  if (kind === 0) {
    // Scattered papers / cardboard.
    rect(ctx, x, y, 7, 5, "#A8A492");
    rect(ctx, x + 9, y + 7, 6, 4, "#8F8A78");
    rect(ctx, x + 15, y - 3, 5, 4, "#B5B09C");
    rect(ctx, x + 12, y + 12, 6, 4, "#9E9984");
    px(ctx, x + 1, y + 1, "#C9C5B4", 2);
  } else if (kind === 1) {
    // Rusted cans.
    px(ctx, x, y, "#7C8786", 2);
    px(ctx, x + 4, y + 2, "#9AA5A2", 3);
    px(ctx, x + 2, y + 6, "#5F6B68", 2);
    px(ctx, x - 4, y + 4, "#848F8C", 2);
  } else if (kind === 2) {
    // Broken glass glints.
    px(ctx, x + 2, y, "#AFC6CF", 2);
    px(ctx, x + 6, y + 3, "#8FB2BE", 2);
    px(ctx, x, y + 5, "#7D9BA8", 2);
    px(ctx, x + 9, y + 7, "#C2D8DE", 1);
    px(ctx, x + 4, y + 8, "#9DBBC6", 2);
  } else if (kind === 3) {
    // Old dried blood stain.
    ctx.fillStyle = "rgba(64,18,16,0.5)";
    ctx.beginPath();
    ctx.arc(x + 5, y + 5, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(84,26,22,0.4)";
    ctx.beginPath();
    ctx.arc(x + 12, y + 12, 4, 0, Math.PI * 2);
    ctx.fill();
    px(ctx, x + 1, y + 1, "#4E1C18", 2);
    px(ctx, x + 8, y + 7, "#5E241F", 2);
  } else if (kind === 4) {
    // Trash bag / bundle.
    rect(ctx, x, y, 10, 9, "#2C2E33");
    rect(ctx, x + 6, y + 4, 8, 7, "#383B41");
    px(ctx, x + 2, y + 2, "#1F2126", 2);
    rect(ctx, x + 3, y + 11, 6, 2, "#3E4048");
  } else if (kind === 5) {
    // Old oil / coolant stain.
    ctx.fillStyle = "rgba(10,12,16,0.35)";
    ctx.beginPath();
    ctx.ellipse ? ctx.ellipse(x + 5, y + 4, 9, 6, 0.4, 0, Math.PI * 2) : ctx.arc(x + 5, y + 4, 7, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 6) {
    // Mangled fence / wire + debris.
    ctx.strokeStyle = "rgba(40,44,40,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 2);
    ctx.lineTo(x + 12, y + 6);
    ctx.moveTo(x + 4, y);
    ctx.lineTo(x + 15, y + 3);
    ctx.stroke();
    px(ctx, x + 12, y + 8, "#6A675C", 3);
    px(ctx, x + 16, y + 5, "#55534A", 2);
  } else if (kind === 7) {
    // Clothing / remains tatter.
    rect(ctx, x, y, 8, 5, "#4A5560");
    rect(ctx, x + 5, y + 4, 7, 6, "#5A6772");
    rect(ctx, x + 2, y + 8, 6, 4, "#46505A");
    px(ctx, x + 3, y + 3, "#2E3842", 2);
  } else if (kind === 8) {
    // Concrete chunks.
    px(ctx, x, y, "#6E6F6A", 4);
    px(ctx, x + 6, y + 2, "#585A56", 3);
    px(ctx, x + 3, y + 7, "#7A7B74", 3);
    px(ctx, x + 10, y + 8, "#4E504C", 3);
  } else if (kind === 9) {
    // Fallen branches / twigs.
    ctx.strokeStyle = "rgba(64,50,34,0.65)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + 6);
    ctx.lineTo(x + 14, y + 2);
    ctx.moveTo(x + 7, y + 4);
    ctx.lineTo(x + 5, y - 1);
    ctx.moveTo(x + 10, y + 3);
    ctx.lineTo(x + 13, y - 2);
    ctx.stroke();
  } else if (kind === 10) {
    // Muddy footprint trail.
    ctx.fillStyle = "rgba(58,44,28,0.35)";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(x + i * 6, y + (i % 2) * 6, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Empty cell.
    return;
  }
}

/**
 * Draw a road slab: asphalt base with worn edge lanes, subtle patchwork
 * tone, painted markings (dashed centre, white edge lines) and a few
 * potholes/manholes scattered along the way. All detail positions derive
 * from the slab's world origin so nothing shifts with the camera.
 */
export function drawRoadDetails(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  vertical: boolean,
): void {
  rect(ctx, x, y, w, h, "#1C1D1F");
  rect(ctx, x + 3, y + 3, w - 6, h - 6, "#2B2C30");
  rect(ctx, x + 6, y + 6, w - 12, h - 12, "#26272B");

  // Faded patchwork tone (low alpha blocks, deterministic from origin).
  const step = 96;
  const along0 = vertical ? y : x;
  const span = vertical ? h : w;
  for (let s = along0; s < along0 + span; s += step) {
    const hh = worldHash(9011, Math.floor((vertical ? x : s) / step), Math.floor((vertical ? s : y) / step));
    if (hh % 4 === 0) {
      const seg = Math.min(step, along0 + span - s);
      if (vertical) rect(ctx, x + 8, s, w - 16, seg, "rgba(20,20,22,0.35)");
      else rect(ctx, s, y + 8, seg, h - 16, "rgba(20,20,22,0.35)");
    }
  }

  // Curb wear at both long edges.
  rect(ctx, x + 2, y + 2, w - 4, 3, "rgba(10,10,12,0.55)");
  rect(ctx, x + 2, y + h - 5, w - 4, 3, "rgba(10,10,12,0.55)");
  rect(ctx, x + 2, y + 2, 3, h - 4, "rgba(10,10,12,0.55)");
  rect(ctx, x + w - 5, y + 2, 3, h - 4, "rgba(10,10,12,0.55)");

  // Manhole covers + oil stains along the road, sparse and deterministic.
  if (vertical) {
    for (let py = y + 180; py < y + h - 60; py += 640) {
      const mh = worldHash(9023, x, py);
      if (mh % 5 === 0) {
        const mx = x + 14 + (Math.floor(mh / 7) % (w - 40));
        px(ctx, mx, py, "#191A1C", 10);
        px(ctx, mx + 2, py + 2, "#3A3B3E", 6);
      }
      if (mh % 9 === 0) {
        const ox = x + 18 + (Math.floor(mh / 11) % (w - 44));
        rect(ctx, ox, py + 20, 22, 12, "rgba(12,12,14,0.5)");
      }
    }
  } else {
    for (let px0 = x + 180; px0 < x + w - 60; px0 += 640) {
      const mh = worldHash(9023, px0, y);
      if (mh % 5 === 0) {
        const my = y + 14 + (Math.floor(mh / 7) % (h - 40));
        px(ctx, px0, my, "#191A1C", 10);
        px(ctx, px0 + 2, my + 2, "#3A3B3E", 6);
      }
      if (mh % 9 === 0) {
        const oy = y + 18 + (Math.floor(mh / 11) % (h - 44));
        rect(ctx, px0 + 20, oy, 12, 22, "rgba(12,12,14,0.5)");
      }
    }
  }

  // Markings: dashed amber centre + continuous white edge lines.
  const line = "#C29C4C";
  const edge = "rgba(214,214,210,0.55)";
  if (vertical) {
    rect(ctx, x + 6, y, 2, h, edge);
    rect(ctx, x + w - 8, y, 2, h, edge);
    for (let py = y + 10; py < y + h - 6; py += 72) {
      rect(ctx, x + w / 2 - 3, py, 6, 34, line);
      rect(ctx, x + w / 2 - 2, py + 2, 2, 30, "#E1C86D");
    }
  } else {
    rect(ctx, x, y + 6, w, 2, edge);
    rect(ctx, x, y + h - 8, w, 2, edge);
    for (let px0 = x + 10; px0 < x + w - 6; px0 += 72) {
      rect(ctx, px0, y + h / 2 - 3, 34, 6, line);
      rect(ctx, px0 + 2, y + h / 2 - 2, 30, 2, "#E1C86D");
    }
  }
}

/**
 * Draw a prop. `litWindows` is the deterministic per-building window-light
 * decision made by the map from the building's world position (never from
 * screen/camera state): when false every window is drawn dark.
 */
// Building façades share the same footprint but get 4 palette variants keyed
// to a stable per-building seed passed by the map (never camera state).
const FACADE = [
  { wall: "#4A4A58", dark: "#3A3A46", light: "#5A5A68", frame: "#1B1D23", trim: "#60606E" },
  { wall: "#6B5A45", dark: "#564838", light: "#7C6A52", frame: "#241C12", trim: "#87735A" },
  { wall: "#5C4A4E", dark: "#4A3A3E", light: "#6E5A5E", frame: "#1E1416", trim: "#7A666A" },
  { wall: "#46545E", dark: "#38444C", light: "#57656F", frame: "#141C22", trim: "#66747E" },
];

export function drawPropSprite(
  ctx: CanvasRenderingContext2D,
  kind: string,
  x: number,
  y: number,
  w: number,
  h: number,
  litWindows = false,
  styleVariant = 0,
): void {
  getPixelArtAtlas(ctx);
  const shadowX = x + 5;
  const shadowY = y + 6;
  rect(ctx, shadowX, shadowY, w, h, "rgba(6,8,7,0.52)");

  if (kind === "building") {
    const p = FACADE[((styleVariant % 4) + 4) % 4]!;
    // Plinth / base.
    rect(ctx, x, y + h - 22, w, 22, p.dark);
    rect(ctx, x + 4, y + 4, w - 8, h - 8, p.wall);
    // Roof parapet: darker cap with a lit lip so the top edge reads.
    rect(ctx, x, y, w, 10, p.dark);
    rect(ctx, x, y + 8, w, 2, p.light);
    // Roof equipment (AC units / vents), deterministic spacing from origin.
    const roofStep = 92;
    for (let rx = x + 26; rx < x + w - 26; rx += roofStep) {
      const rv = worldHash(3037, rx, y);
      if (rv % 2 === 0) {
        const ux = rx + (rv % 16);
        const uh = 10 + (Math.floor(rv / 9) % 4);
        rect(ctx, ux, y - uh + 4, 18, uh, "#9A9AA6");
        rect(ctx, ux + 2, y - uh + 6, 14, 3, "#B9B9C4");
      }
    }
    strokeRect(ctx, x, y, w, h, p.frame, 3);
    // Windows with frames + sills. Lit/dark derived only from the local
    // column/row index and the building's world-anchored litWindows flag, so
    // no window changes while the camera moves.
    let rowIdx = 0;
    for (let wy = y + 22; wy < y + h - 34; wy += 34) {
      let colIdx = 0;
      const cols = Math.max(2, Math.floor((w - 34) / 30));
      const startX = x + (w - (cols * 30 - 2)) / 2;
      for (let c = 0; c < cols; c++) {
        const wx = startX + c * 30;
        const windowLit = litWindows && (colIdx + rowIdx) % 3 !== 0;
        rect(ctx, wx, wy, 16, 18, p.frame);
        rect(ctx, wx + 2, wy + 2, 12, 14, windowLit ? "#C9A34E" : "#161A22");
        rect(ctx, wx + 2, wy + 2, 12, 3, windowLit ? "#E8CE80" : "#22262E");
        rect(ctx, wx + 7, wy + 2, 2, 14, windowLit ? "#B98F3E" : "#1B1F28");
        rect(ctx, wx - 1, wy + 17, 18, 2, p.light);
        colIdx++;
      }
      rowIdx++;
    }
    // Door with steps at the base.
    const dW = Math.max(14, Math.min(22, w * 0.16));
    const dX = x + (w - dW) / 2;
    rect(ctx, dX, y + h - 24, dW, 24, p.frame);
    rect(ctx, dX + 2, y + h - 22, dW - 4, 20, "#14161B");
    rect(ctx, dX + dW - 7, y + h - 14, 2, 6, "#C9A34E");
    rect(ctx, dX - 2, y + h - 3, dW + 4, 3, p.light);
    return;
  }
  if (kind === "house") {
    const roof = ["#4C302C", "#3F3A3C", "#3E3A50"][((styleVariant % 3) + 3) % 3]!;
    const wall = ["#72503C", "#8A7A68", "#7C6B62"][((styleVariant % 3) + 3) % 3]!;
    rect(ctx, x, y, w, h, "#241A14");
    rect(ctx, x + 4, y + 12, w - 8, h - 16, wall);
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 20);
    ctx.lineTo(x + w / 2, y + 2);
    ctx.lineTo(x + w - 2, y + 20);
    ctx.closePath();
    ctx.fill();
    // Roof tiles.
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    for (let sx = x + 14; sx < x + w - 8; sx += 9) {
      const sy2 = y + 16 - Math.abs(sx - (x + w / 2)) * 0.24;
      ctx.fillRect(sx, sy2, 6, 2);
    }
    // Chimney with cap + a roof overhang shadow under the eaves.
    const chX = x + w * (0.62 + ((styleVariant % 3) * 0.1));
    rect(ctx, chX, y + 6, 12, 14, "#6E4A3A");
    rect(ctx, chX - 1, y + 4, 14, 4, "#8A5E48");
    rect(ctx, x + 2, y + h * 0.62, w - 4, 2, "rgba(0,0,0,0.25)");
    // Windows with dark frames + sills (lit only via litWindows).
    for (const wx of [x + 14, x + w - 27]) {
      rect(ctx, wx, y + h * 0.44, 13, 13, "#14181E");
      rect(ctx, wx + 1, y + h * 0.44 + 1, 11, 11, litWindows ? "#C2A055" : "#11151C");
      if (litWindows) rect(ctx, wx + 3, y + h * 0.44 + 3, 3, 2, "#E2C97C");
      rect(ctx, wx - 1, y + h * 0.44 + 12, 15, 2, "rgba(255,255,255,0.08)");
    }
    // Door + step.
    const dW = Math.max(13, Math.min(18, w * 0.14));
    const dX = x + (w - dW) / 2;
    rect(ctx, dX, y + h - 24, dW, 24, "#241A16");
    rect(ctx, dX + 2, y + h - 22, dW - 4, 18, "#3A2418");
    rect(ctx, dX + dW - 6, y + h - 14, 2, 5, "#C9A34E");
    rect(ctx, dX - 3, y + h - 4, dW + 6, 4, "#5A5648");
    strokeRect(ctx, x, y, w, h, "#1B130E", 3);
    return;
  }
  if (kind === "tree") {
    const r = w * 0.36;
    const trunk = "#4C321D";
    rect(ctx, x + w * 0.45, y + h * 0.42, Math.max(5, w * 0.14), h * 0.5, "#241610");
    rect(ctx, x + w * 0.48, y + h * 0.44, 4, h * 0.42, trunk);
    rect(ctx, x + w * 0.44, y + h - 10, w * 0.2, 4, "#241610");
    // Three-canopy shadow blobs then layered greens with a highlight rim.
    ctx.fillStyle = "#0F1F14";
    ctx.beginPath(); ctx.arc(x + w / 2 + 4, y + h * 0.42 + 5, r + 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#17301F";
    ctx.beginPath(); ctx.arc(x + w / 2 + 2, y + h * 0.36 + 2, r + 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#275A35";
    ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.34, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3C7545";
    ctx.beginPath(); ctx.arc(x + w * 0.38, y + h * 0.24, r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath(); ctx.arc(x + w * 0.36, y + h * 0.22, r * 0.28, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (kind === "bush") {
    rect(ctx, x + 4, y + h * 0.8, w - 8, h * 0.2, "#241610");
    ctx.fillStyle = "#12291A";
    ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.55, w * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1E4528";
    ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.5, w * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2F6336";
    ctx.beginPath(); ctx.arc(x + w * 0.36, y + h * 0.42, w * 0.2, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (kind.startsWith("car_")) {
    const body = kind === "car_red" ? "#A93B36" : kind === "car_blue" ? "#355A9C" : "#B49234";
    const dark = kind === "car_red" ? "#7E2A26" : kind === "car_blue" ? "#274273" : "#8A6E24";
    rect(ctx, x, y + 8, w, h - 10, "#101116");
    // Tyres.
    px(ctx, x + 8, y + h - 9, "#0B0B0E", 8);
    px(ctx, x + w - 16, y + h - 9, "#0B0B0E", 8);
    px(ctx, x + 8, y + 4, "#0B0B0E", 8);
    px(ctx, x + w - 16, y + 4, "#0B0B0E", 8);
    // Body with roof shade.
    rect(ctx, x + 4, y + 6, w - 8, h - 16, body);
    rect(ctx, x + 4, y + 6, w - 8, 4, dark);
    // Cabin glass (windscreen + side + rear).
    rect(ctx, x + 9, y + 10, w * 0.22, h * 0.22, "#2C4A56");
    rect(ctx, x + 12, y + 12, w * 0.22 - 6, 3, "#8FB3BF");
    rect(ctx, x + w * 0.34, y + 10, w * 0.42, h * 0.22, "#344E58");
    rect(ctx, x + w * 0.37, y + 12, w * 0.36, 3, "#9DBFC8");
    rect(ctx, x + w * 0.78, y + 10, w * 0.14, h * 0.2, "#2C4A56");
    // Hood/trunk seams + door line.
    rect(ctx, x + 6, y + h * 0.34, 3, 2, dark);
    rect(ctx, x + w - 9, y + h * 0.34, 3, 2, dark);
    rect(ctx, x + w * 0.55, y + 6, 2, h * 0.3, "rgba(0,0,0,0.25)");
    // Lights.
    rect(ctx, x + 4, y + h - 12, 6, 3, "#E5D071");
    rect(ctx, x + w - 10, y + h - 12, 6, 3, "#C84643");
    rect(ctx, x + 4, y + 8, 5, 2, "#E5D071");
    rect(ctx, x + w - 9, y + 8, 5, 2, "#8A2626");
    strokeRect(ctx, x + 4, y + 6, w - 8, h - 16, "#131318", 2);
    return;
  }
  if (kind === "container") {
    rect(ctx, x, y, w, h, "#0E2A2C");
    rect(ctx, x + 3, y + 3, w - 6, h - 6, "#356B6C");
    rect(ctx, x + 3, y + 3, w - 6, 4, "#4B8280");
    for (let sx = x + 10; sx < x + w - 6; sx += 13) rect(ctx, sx, y + 6, 3, h - 12, "#245456");
    // Corner casting blocks + rust streaks.
    px(ctx, x + 2, y + 2, "#9A552D", 5);
    px(ctx, x + w - 7, y + 2, "#9A552D", 5);
    rect(ctx, x + 4, y + h - 14, 8, 6, "rgba(90,50,20,0.5)");
    rect(ctx, x + w - 12, y + 10, 2, 18, "rgba(90,50,20,0.35)");
    strokeRect(ctx, x, y, w, h, "#0C1F21", 3);
    return;
  }
  if (kind === "crate" || kind === "barricade") {
    const c = kind === "crate" ? "#8A6237" : "#74777A";
    rect(ctx, x, y, w, h, c);
    strokeRect(ctx, x, y, w, h, "#29251F", 3);
    if (kind === "crate") {
      // Wooden planks + nail heads.
      rect(ctx, x, y + h * 0.5, w, 2, "rgba(0,0,0,0.25)");
      ctx.strokeStyle = "#4F341F"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + w - 4, y + h - 4);
      ctx.moveTo(x + w - 4, y + 4); ctx.lineTo(x + 4, y + h - 4); ctx.stroke();
      px(ctx, x + 4, y + 4, "#3C2816", 2);
      px(ctx, x + w - 6, y + h - 6, "#3C2816", 2);
    } else {
      for (let i = -h; i < w; i += 24) {
        ctx.fillStyle = "#D5AA31";
        ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + 12, y + h);
        ctx.lineTo(x + i + h + 12, y); ctx.lineTo(x + i + h, y); ctx.closePath(); ctx.fill();
      }
    }
    return;
  }
  if (kind === "barrel") {
    const c = ((styleVariant % 3) + 3) % 3;
    const body = c === 0 ? "#A63B32" : c === 1 ? "#3F6B3C" : "#8A8A8E";
    rect(ctx, x, y, w, h, "#1A1410");
    rect(ctx, x + 2, y + 2, w - 4, h - 4, body);
    rect(ctx, x + 2, y + h * 0.3, w - 4, 4, "rgba(0,0,0,0.35)");
    rect(ctx, x + 2, y + h * 0.62, w - 4, 4, "rgba(255,255,255,0.16)");
    rect(ctx, x + w * 0.18, y + 3, 3, h - 6, "rgba(0,0,0,0.18)");
    rect(ctx, x + w * 0.7, y + 3, 3, h - 6, "rgba(0,0,0,0.18)");
    rect(ctx, x + 4, y + 2, w - 8, 5, "rgba(255,255,255,0.10)");
    return;
  }
  if (kind === "hydrant") {
    rect(ctx, x, y, w, h, "#101014");
    rect(ctx, x + 2, y + h - 6, w - 4, 6, "#8E3A2E");
    rect(ctx, x + 5, y + 8, w - 10, h - 12, "#C04736");
    rect(ctx, x + 2, y + 10, w - 4, 6, "#8E3A2E");
    px(ctx, x + w / 2 - 2, y + h - 9, "#E8CE80", 4);
    rect(ctx, x + 5, y + 2, 2, 6, "#E8CE80");
    return;
  }
  if (kind === "dumpster") {
    rect(ctx, x, y, w, h, "#10151B");
    rect(ctx, x + 2, y + 3, w - 4, h - 8, "#2E4A38");
    rect(ctx, x + 2, y + 3, w - 4, 5, "#3F644A");
    for (let sx = x + 8; sx < x + w - 8; sx += 14) rect(ctx, sx, y + 8, 2, h - 14, "rgba(0,0,0,0.25)");
    rect(ctx, x + 3, y + h - 12, w - 6, 4, "#1C2E22");
    strokeRect(ctx, x, y, w, h, "#0A0D0F", 3);
    return;
  }
  rect(ctx, x, y, w, h, "#303137");
  strokeRect(ctx, x, y, w, h, "#17181C", 2);
}

export function drawStreetLamp(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  // Soft warm pool of light on the ground beneath the head.
  const glowX = x + 4.5;
  const glowY = y + 38;
  const grad = ctx.createRadialGradient(glowX, glowY, 2, glowX, glowY, 42);
  grad.addColorStop(0, "rgba(255,200,110,0.20)");
  grad.addColorStop(1, "rgba(255,200,110,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(glowX - 44, glowY - 44, 88, 88);
  // Pole with a highlight + lamp head with warm bulb.
  rect(ctx, x + 2, y + 6, 5, 26, "#1A2024");
  rect(ctx, x + 3, y + 8, 2, 22, "#333E42");
  rect(ctx, x, y + 2, 9, 7, "#4A5658");
  rect(ctx, x, y + 2, 2, 7, "#6C7A7C");
  rect(ctx, x + 2, y + 4, 5, 3, "#F3CA61");
  rect(ctx, x + 2, y + 4, 5, 1, "#FFE9B0");
  rect(ctx, x, y + 31, 9, 3, "#101518");
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
