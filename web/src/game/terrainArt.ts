// src/game/terrainArt.ts
// ─────────────────────────────────────────────────────────────────────────
// Ground, road and street-surface rendering for the Greenfield map.
//
// Everything here is a PURE function of world coordinates + the map seed:
// no camera state, no time, no RNG. That is what keeps the terrain glued to
// the world — a speck of gravel drawn at world (1234, 5678) is the same
// speck forever, so the ground never crawls, shimmers or re-rolls while the
// player walks around.
//
// Layer order used by GameMap.drawGround():
//   1. terrain tiles (district-coloured earth / concrete)
//   2. large surface patches (lots, lawns, water, scorch, craters)
//   3. sidewalk bands + kerbs
//   4. asphalt slabs + markings
//   5. crosswalks + junction paint
//   6. scattered litter decals
// ─────────────────────────────────────────────────────────────────────────

import { px, rect, worldHash } from "./pixelArt";
import {
  GROUND,
  districtAt,
  type District,
  type GroundPalette,
  type RoadClass,
} from "./district";

export const TILE = 64;

// ── small helpers ──────────────────────────────────────────────────────

/** Filled ellipse at an angle, built from a transformed arc. */
function tiltedBlot(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angle: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.scale(1, ry / rx);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Hash → float in [0,1). */
function h01(h: number): number {
  return (h % 1000) / 1000;
}

/**
 * Soft, irregular blob built from a few overlapping arcs.
 *
 * `cx`/`cy` are where to draw it (screen space); `wx`/`wy` are the patch's
 * WORLD origin and are the only thing the lobe layout is hashed from. That
 * split matters: hashing the screen position re-rolls every lobe each time
 * the camera moves 8px, which makes every lot, lawn and apron on the map
 * pulse and flicker while the player runs.
 */
function blob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  wx: number,
  wy: number,
  lobes = 7,
): void {
  for (let i = 0; i < lobes; i++) {
    const hh = worldHash(seed + i * 131, Math.round(wx) + i * 37, Math.round(wy) - i * 19);
    const a = h01(hh) * Math.PI * 2;
    const d = 0.28 + h01(hh >> 3) * 0.34;
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(a) * rx * d,
      cy + Math.sin(a) * ry * d,
      Math.max(3, (rx + ry) * 0.5 * (0.44 + h01(hh >> 6) * 0.3)),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

// ── 1. terrain tiles ───────────────────────────────────────────────────

/**
 * One 64px ground tile. `wx`/`wy` are the tile's world origin (multiples of
 * TILE); `sx`/`sy` its current screen position.
 *
 * Three stacked frequencies keep the ground from reading flat:
 *   • the district base ramp, picked per tile,
 *   • a 128px block wash (soft meadow / stain patches),
 *   • per-tile flecks and one piece of micro-detail.
 */
export function drawTerrainTile(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  wx: number,
  wy: number,
  seed: number,
): void {
  const d = districtAt(wx + TILE / 2, wy + TILE / 2);
  const pal = GROUND[d];
  const th = worldHash(seed + 1013, wx, wy);
  rect(ctx, sx, sy, TILE, TILE, pal.base[th % 4]!);

  // 128px low-frequency wash — the "which part of the block am I on" layer.
  const bh = worldHash(seed + 2029, Math.floor(wx / 128), Math.floor(wy / 128));
  const bk = bh % 10;
  if (bk < 4) {
    ctx.fillStyle = bk === 0 ? "rgba(0,0,0,0.13)" : pal.wash;
    ctx.fillRect(sx, sy, TILE, TILE);
  }

  // Coarse flecks — soil clods, chipped paving, litter grit.
  for (let i = 0; i < 9; i++) {
    const hh = worldHash(seed + 3041 + i * 23, wx + i * 17, wy - i * 11);
    px(
      ctx,
      sx + (hh % 59) + 2,
      sy + ((hh >> 4) % 59) + 2,
      pal.fleck[hh % pal.fleck.length]!,
      hh % 5 === 0 ? 4 : 2,
    );
  }

  // One piece of micro-detail per tile, ~35% of tiles.
  const mh = worldHash(seed + 4057, wx, wy);
  if (mh % 20 < 7) {
    const mx = sx + 8 + ((mh >> 3) % 44);
    const my = sy + 8 + ((mh >> 9) % 44);
    drawMicroDetail(ctx, mx, my, pal.detail, pal.accent, pal.accent2, mh);
  }
}

type GroundDetail = GroundPalette["detail"];

function drawMicroDetail(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: GroundDetail,
  a: string,
  b: string,
  h: number,
): void {
  if (kind === "grass") {
    // Tuft of blades leaning the same way.
    const lean = h % 2 === 0 ? 1 : -1;
    rect(ctx, x, y, 2, 7, a);
    rect(ctx, x + 3 * lean, y - 2, 2, 8, b);
    rect(ctx, x + 6 * lean, y + 1, 2, 6, a);
    rect(ctx, x + 3 * lean, y - 3, 1, 2, b);
  } else if (kind === "weeds") {
    // Cracked-pavement weeds pushing through.
    rect(ctx, x, y + 3, 10, 1, "rgba(12,12,10,0.4)");
    rect(ctx, x + 2, y, 2, 5, a);
    rect(ctx, x + 6, y - 1, 1, 6, a);
    px(ctx, x + 8, y + 4, b, 2);
  } else if (kind === "gravel") {
    px(ctx, x, y, b, 3);
    px(ctx, x + 5, y + 3, a, 2);
    px(ctx, x + 2, y + 6, b, 2);
    px(ctx, x + 8, y - 1, a, 3);
  } else if (kind === "ash") {
    ctx.fillStyle = "rgba(18,16,14,0.35)";
    ctx.beginPath();
    ctx.arc(x + 4, y + 4, 5 + (h % 4), 0, Math.PI * 2);
    ctx.fill();
    px(ctx, x + 2, y + 2, b, 2);
    px(ctx, x + 7, y + 6, a, 2);
  } else {
    // paving — a hairline slab joint + chipped corner.
    rect(ctx, x - 6, y, 22, 1, "rgba(0,0,0,0.16)");
    rect(ctx, x + 6, y - 8, 1, 18, "rgba(0,0,0,0.13)");
    px(ctx, x + 9, y + 3, a, 2);
  }
}

// ── 2. surface patches ─────────────────────────────────────────────────

export type PatchKind =
  | "concrete"
  | "dirt"
  | "gravel"
  | "scorch"
  | "lawn"
  | "water"
  | "sand";

/**
 * A large soft-edged ground patch: parking aprons, dirt yards, lawns,
 * scorched blast marks and pond shallows. Drawn under everything else so
 * props and roads always sit on top.
 */
export function drawSurfacePatch(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  w: number,
  h: number,
  wx: number,
  wy: number,
  kind: PatchKind,
  seed: number,
): void {
  const cx = sx + w / 2;
  const cy = sy + h / 2;
  const rx = w * 0.5;
  const ry = h * 0.5;
  if (kind === "concrete") {
    ctx.fillStyle = "rgba(126,124,116,0.10)";
    blob(ctx, cx, cy, rx * 0.9, ry * 0.9, seed + 11, wx, wy, 10);
    ctx.fillStyle = "rgba(88,86,80,0.10)";
    blob(ctx, cx, cy, rx * 0.55, ry * 0.55, seed + 17, wx, wy, 7);
    // Expansion-joint grid + a few parking bay stripes.
    ctx.fillStyle = "rgba(14,14,12,0.20)";
    for (let gx = sx + 40; gx < sx + w; gx += 68) ctx.fillRect(gx, sy + 6, 1, h - 12);
    for (let gy = sy + 40; gy < sy + h; gy += 68) ctx.fillRect(sx + 6, gy, w - 12, 1);
    if (worldHash(seed + 23, wx, wy) % 3 === 0) {
      ctx.fillStyle = "rgba(206,200,176,0.22)";
      for (let i = 0; i < 5; i++) ctx.fillRect(sx + 18 + i * 28, sy + 20, 2, Math.min(56, h - 40));
    }
  } else if (kind === "dirt") {
    ctx.fillStyle = "rgba(104,80,46,0.20)";
    blob(ctx, cx, cy, rx, ry, seed + 31, wx, wy, 9);
    ctx.fillStyle = "rgba(74,56,30,0.18)";
    blob(ctx, cx, cy, rx * 0.62, ry * 0.62, seed + 37, wx, wy, 5);
    // Tyre ruts.
    ctx.fillStyle = "rgba(44,32,18,0.28)";
    ctx.fillRect(sx + w * 0.2, sy + h * 0.34, w * 0.6, 2);
    ctx.fillRect(sx + w * 0.16, sy + h * 0.62, w * 0.66, 2);
  } else if (kind === "gravel") {
    ctx.fillStyle = "rgba(112,106,92,0.17)";
    blob(ctx, cx, cy, rx, ry, seed + 41, wx, wy, 7);
    for (let i = 0; i < 26; i++) {
      const hh = worldHash(seed + 43 + i, wx + i * 13, wy - i * 7);
      px(
        ctx,
        sx + (hh % Math.max(2, Math.floor(w - 4))),
        sy + ((hh >> 5) % Math.max(2, Math.floor(h - 4))),
        hh % 2 === 0 ? "rgba(154,146,124,0.55)" : "rgba(62,60,52,0.55)",
        3,
      );
    }
  } else if (kind === "scorch") {
    ctx.fillStyle = "rgba(20,17,14,0.26)";
    blob(ctx, cx, cy, rx, ry, seed + 53, wx, wy, 8);
    ctx.fillStyle = "rgba(58,34,18,0.16)";
    blob(ctx, cx, cy, rx * 0.55, ry * 0.55, seed + 59, wx, wy, 5);
    // Radial soot streaks — reads as a blast mark.
    ctx.strokeStyle = "rgba(12,10,8,0.30)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + h01(worldHash(seed + 61, wx, wy)) * 3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * rx * 0.3, cy + Math.sin(a) * ry * 0.3);
      ctx.lineTo(cx + Math.cos(a) * rx * 0.95, cy + Math.sin(a) * ry * 0.95);
      ctx.stroke();
    }
  } else if (kind === "lawn") {
    ctx.fillStyle = "rgba(86,132,58,0.09)";
    blob(ctx, cx, cy, rx * 0.92, ry * 0.92, seed + 67, wx, wy, 11);
    ctx.fillStyle = "rgba(52,88,40,0.09)";
    blob(ctx, cx, cy, rx * 0.55, ry * 0.55, seed + 71, wx, wy, 7);
    // Mown stripes — the detail that actually says "kept lawn". Inset well
    // inside the blob: a stripe that runs to the patch edge reinstates the
    // hard rectangle the soft blob exists to hide.
    ctx.fillStyle = "rgba(104,150,66,0.07)";
    const mx0 = sx + w * 0.2;
    const mx1 = sx + w * 0.8;
    for (let gx = mx0; gx < mx1; gx += 46) {
      ctx.fillRect(gx, sy + h * 0.22, Math.min(22, mx1 - gx), h * 0.56);
    }
  } else if (kind === "sand") {
    ctx.fillStyle = "rgba(168,146,100,0.20)";
    blob(ctx, cx, cy, rx, ry, seed + 73, wx, wy, 7);
    ctx.fillStyle = "rgba(140,118,78,0.16)";
    blob(ctx, cx, cy, rx * 0.6, ry * 0.6, seed + 79, wx, wy, 4);
  } else {
    // water — shallow margin, deep centre, a few ripple glints.
    ctx.fillStyle = "rgba(46,74,80,0.55)";
    blob(ctx, cx, cy, rx, ry, seed + 83, wx, wy, 9);
    ctx.fillStyle = "rgba(26,48,58,0.55)";
    blob(ctx, cx, cy, rx * 0.66, ry * 0.66, seed + 89, wx, wy, 6);
    ctx.fillStyle = "rgba(150,190,196,0.16)";
    for (let i = 0; i < 7; i++) {
      const hh = worldHash(seed + 97 + i, wx + i * 29, wy + i * 17);
      ctx.fillRect(sx + (hh % Math.max(2, Math.floor(w - 18))), sy + ((hh >> 6) % Math.max(2, Math.floor(h - 8))), 12, 2);
    }
  }
}

/** A blast crater: rim lip, dark bowl and thrown debris. */
export function drawCrater(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  seed: number,
  wx: number,
  wy: number,
): void {
  ctx.fillStyle = "rgba(72,62,48,0.55)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(30,26,22,0.72)";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.74, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(12,10,9,0.8)";
  ctx.beginPath();
  ctx.arc(cx + r * 0.06, cy + r * 0.08, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  // Rim highlight + thrown clods.
  ctx.strokeStyle = "rgba(126,112,88,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const hh = worldHash(seed + 601 + i, wx + i * 19, wy - i * 13);
    const a = h01(hh) * Math.PI * 2;
    const d = r * (1.05 + h01(hh >> 4) * 0.55);
    px(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, hh % 3 === 0 ? "#4A4034" : "#2A251F", 3);
  }
}

// ── 3. sidewalks ───────────────────────────────────────────────────────

/**
 * Paved sidewalk band beside a road: dirt shoulder, slabbed concrete with
 * joints, worn tone segments, and a kerb lip at the asphalt edge.
 */
export function drawSidewalkBand(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  w: number,
  h: number,
  wx: number,
  wy: number,
  vertical: boolean,
  seed: number,
): void {
  // Shoulder behind the slab (transition into the block).
  rect(ctx, sx, sy, vertical ? 5 : w, vertical ? h : 5, "rgba(34,32,24,0.85)");
  const px0 = vertical ? sx + 5 : sx;
  const py0 = vertical ? sy : sy + 5;
  const pw = vertical ? w - 5 : w;
  const ph = vertical ? h : h - 5;
  rect(ctx, px0, py0, pw, ph, "#45463F");

  const span = vertical ? h : w;
  const SLAB = 46;
  for (let p = 0; p < span; p += SLAB) {
    const hh = worldHash(
      seed + 313,
      Math.floor(vertical ? wx : wx + p),
      Math.floor(vertical ? wy + p : wy),
    );
    const seg = Math.min(SLAB, span - p);
    // Per-slab tone: sun-bleached, grimy or cracked.
    const tone = hh % 5;
    if (tone === 0) ctx.fillStyle = "rgba(96,94,84,0.28)";
    else if (tone === 1) ctx.fillStyle = "rgba(34,34,30,0.30)";
    else if (tone === 2) ctx.fillStyle = "rgba(66,64,56,0.20)";
    else ctx.fillStyle = "rgba(0,0,0,0)";
    if (tone < 3) {
      if (vertical) ctx.fillRect(px0, py0 + p, pw, seg);
      else ctx.fillRect(px0 + p, py0, seg, ph);
    }
    // Joint line between slabs.
    ctx.fillStyle = "rgba(10,10,8,0.42)";
    if (vertical) ctx.fillRect(px0 + 1, py0 + p + seg - 1, pw - 2, 1);
    else ctx.fillRect(px0 + p + seg - 1, py0 + 1, 1, ph - 2);
    // Cracks / heaved slabs.
    if (hh % 11 === 0) {
      ctx.strokeStyle = "rgba(8,8,6,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(px0 + 2, py0 + p + 6);
        ctx.lineTo(px0 + pw - 3, py0 + p + seg - 8);
      } else {
        ctx.moveTo(px0 + p + 6, py0 + 2);
        ctx.lineTo(px0 + p + seg - 8, py0 + ph - 3);
      }
      ctx.stroke();
    }
    // Weeds in the joint.
    if (hh % 7 === 0) {
      const gx = vertical ? px0 + 3 : px0 + p + 10;
      const gy = vertical ? py0 + p + 10 : py0 + 3;
      rect(ctx, gx, gy, 2, 5, "#3F5A2C");
      rect(ctx, gx + 3, gy + 1, 1, 4, "#4E6E36");
    }
  }

  // Kerb: pale top face + dark shadow lip against the asphalt.
  if (vertical) {
    rect(ctx, sx + w - 4, sy, 3, h, "#5A5B52");
    rect(ctx, sx + w - 1, sy, 1, h, "#16170F");
  } else {
    rect(ctx, sx, sy + h - 4, w, 3, "#5A5B52");
    rect(ctx, sx, sy + h - 1, w, 1, "#16170F");
  }
}

// ── 4. roads ───────────────────────────────────────────────────────────

const ROAD_TONE: Record<RoadClass, [string, string, string]> = {
  avenue: ["#1A1B1D", "#2E2F33", "#292A2E"],
  belt: ["#191A1C", "#2C2D31", "#27282C"],
  arterial: ["#191A1B", "#2A2B2E", "#252629"],
  outer: ["#181917", "#2B2C29", "#262724"],
  link: ["#171816", "#282926", "#232421"],
};

/**
 * Asphalt slab with aggregate texture, resurfacing patches, wheel-polished
 * lanes, cracks, drains and painted markings. `lanes` controls the marking
 * scheme: 2 = single dashed centre line, 4 = double centre + lane dashes.
 */
export function drawRoadSlab(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  w: number,
  h: number,
  vertical: boolean,
  wx: number,
  wy: number,
  cls: RoadClass,
  seed: number,
): void {
  const tone = ROAD_TONE[cls];
  rect(ctx, sx, sy, w, h, tone[0]);
  rect(ctx, sx + 3, sy + 3, w - 6, h - 6, tone[1]);

  const span = vertical ? h : w;
  const across = vertical ? w : h;
  const alongW = vertical ? wy : wx;

  // Resurfacing patches — darker rectangles of newer asphalt.
  for (let p = 0; p < span; p += 88) {
    const hh = worldHash(seed + 907, Math.floor((vertical ? wx : wx + p) / 88), Math.floor((vertical ? wy + p : wy) / 88));
    if (hh % 4 === 0) {
      const seg = Math.min(88, span - p);
      ctx.fillStyle = "rgba(16,16,18,0.42)";
      if (vertical) ctx.fillRect(sx + 8, sy + p, w - 16, seg);
      else ctx.fillRect(sx + p, sy + 8, seg, h - 16);
    } else if (hh % 9 === 0) {
      const seg = Math.min(88, span - p);
      ctx.fillStyle = "rgba(72,68,60,0.13)";
      if (vertical) ctx.fillRect(sx + 12, sy + p, w - 24, seg);
      else ctx.fillRect(sx + p, sy + 12, seg, h - 24);
    }
  }

  // Aggregate speckle — the thing that makes asphalt read as asphalt.
  for (let p = 0; p < span; p += 16) {
    const hh = worldHash(seed + 911, Math.floor(vertical ? wx : wx + p), Math.floor(vertical ? wy + p : wy));
    const off = 6 + (hh % Math.max(1, across - 12));
    const c = hh % 3 === 0 ? "rgba(96,94,88,0.22)" : "rgba(10,10,12,0.30)";
    if (vertical) px(ctx, sx + off, sy + p + (hh % 13), c, 2);
    else px(ctx, sx + p + (hh % 13), sy + off, c, 2);
  }

  // Wheel-polished lanes: two lighter strips per direction.
  ctx.fillStyle = "rgba(122,120,112,0.055)";
  const lanePos = [0.22, 0.35, 0.65, 0.78];
  for (const t of lanePos) {
    if (vertical) ctx.fillRect(sx + across * t - 6, sy, 12, h);
    else ctx.fillRect(sx, sy + across * t - 6, w, 12);
  }

  // Long cracks + drain grates at the kerb line.
  for (let p = 0; p < span; p += 220) {
    const hh = worldHash(seed + 919, Math.floor(vertical ? wx : wx + p), Math.floor(vertical ? wy + p : wy));
    if (hh % 3 === 0) {
      ctx.strokeStyle = "rgba(8,8,10,0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const jitter = (hh % 17) - 8;
      if (vertical) {
        ctx.moveTo(sx + 10 + ((hh >> 4) % Math.max(1, across - 20)), sy + p);
        ctx.lineTo(sx + 10 + ((hh >> 4) % Math.max(1, across - 20)) + jitter, sy + p + 160);
      } else {
        ctx.moveTo(sx + p, sy + 10 + ((hh >> 4) % Math.max(1, across - 20)));
        ctx.lineTo(sx + p + 160, sy + 10 + ((hh >> 4) % Math.max(1, across - 20)) + jitter);
      }
      ctx.stroke();
    }
    if (hh % 5 === 0) {
      // Storm drain hugging one kerb.
      const near = hh % 2 === 0 ? 7 : across - 21;
      const gx = vertical ? sx + near : sx + p + 20;
      const gy = vertical ? sy + p + 20 : sy + near;
      rect(ctx, gx, gy, vertical ? 14 : 22, vertical ? 22 : 14, "#141517");
      ctx.fillStyle = "#3A3C3F";
      for (let i = 0; i < 4; i++) {
        if (vertical) rect(ctx, gx + 2, gy + 3 + i * 5, 10, 2, "#3A3C3F");
        else rect(ctx, gx + 3 + i * 5, gy + 2, 2, 10, "#3A3C3F");
      }
    }
    if (hh % 8 === 0) {
      // Manhole.
      const mx = vertical ? sx + across / 2 + ((hh % 3) - 1) * 22 : sx + p + 44;
      const my = vertical ? sy + p + 44 : sy + across / 2 + ((hh % 3) - 1) * 22;
      ctx.fillStyle = "#141517";
      ctx.beginPath();
      ctx.arc(mx, my, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#33353A";
      ctx.beginPath();
      ctx.arc(mx, my, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#191A1D";
      ctx.beginPath();
      ctx.arc(mx, my, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Painted markings ────────────────────────────────────────────────
  const wide = cls === "avenue" || cls === "belt";
  const edge = "rgba(216,214,204,0.42)";
  const yellow = "#C8A544";
  const yellowHi = "#E6C86A";

  const drawDash = (aStart: number, offAcross: number, len: number, gap: number, color: string, thick: number) => {
    for (let p = aStart; p < span - 8; p += len + gap) {
      const seg = Math.min(len, span - 8 - p);
      if (seg <= 2) break;
      if (vertical) rect(ctx, sx + offAcross, sy + p, thick, seg, color);
      else rect(ctx, sx + p, sy + offAcross, seg, thick, color);
    }
  };

  // Solid white edge lines just inside the kerbs.
  if (vertical) {
    rect(ctx, sx + 7, sy, 2, h, edge);
    rect(ctx, sx + across - 9, sy, 2, h, edge);
  } else {
    rect(ctx, sx, sy + 7, w, 2, edge);
    rect(ctx, sx, sy + across - 9, w, 2, edge);
  }

  // Centre line: double solid amber on wide roads, dashed on the rest.
  const mid = across / 2;
  const alongOff = ((alongW % 76) + 76) % 76;
  if (wide) {
    if (vertical) {
      rect(ctx, sx + mid - 5, sy, 3, h, yellow);
      rect(ctx, sx + mid + 2, sy, 3, h, yellow);
      rect(ctx, sx + mid - 5, sy, 1, h, yellowHi);
    } else {
      rect(ctx, sx, sy + mid - 5, w, 3, yellow);
      rect(ctx, sx, sy + mid + 2, w, 3, yellow);
      rect(ctx, sx, sy + mid - 5, w, 1, yellowHi);
    }
    // Inner lane dashes between the centre and each edge.
    drawDash(-alongOff, Math.round(across * 0.26) - 1, 30, 46, "rgba(214,212,202,0.34)", 3);
    drawDash(-alongOff, Math.round(across * 0.74) - 1, 30, 46, "rgba(214,212,202,0.34)", 3);
  } else {
    drawDash(-alongOff, Math.round(mid) - 2, 34, 42, yellow, 4);
  }
}

/**
 * Junction paint at a crossing: stop bars on every approach, and (on a
 * deterministic subset of junctions) a zebra crossing on each arm.
 */
export function drawJunctionPaint(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  ow: number,
  oh: number,
  vx: number,
  vw: number,
  hy: number,
  hh: number,
  zebra: boolean,
): void {
  const bar = "rgba(224,222,212,0.50)";
  // Stop bars: across each approach, just outside the junction box.
  rect(ctx, vx + 6, oy - 12, vw - 12, 5, bar);
  rect(ctx, vx + 6, oy + oh + 7, vw - 12, 5, bar);
  rect(ctx, ox - 12, hy + 6, 5, hh - 12, bar);
  rect(ctx, ox + ow + 7, hy + 6, 5, hh - 12, bar);
  if (!zebra) return;
  const stripe = "rgba(232,229,218,0.72)";
  ctx.fillStyle = stripe;
  const cols = Math.floor((vw - 12) / 16);
  for (let i = 0; i < cols; i++) {
    ctx.fillRect(vx + 8 + i * 16, oy - 34, 9, 18);
    ctx.fillRect(vx + 8 + i * 16, oy + oh + 16, 9, 18);
  }
  const rows = Math.floor((hh - 12) / 16);
  for (let i = 0; i < rows; i++) {
    ctx.fillRect(ox - 34, hy + 8 + i * 16, 18, 9);
    ctx.fillRect(ox + ow + 16, hy + 8 + i * 16, 18, 9);
  }
}

/** Freight rail line: ballast bed, sleepers and two polished steel rails. */
export function drawRailSegment(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  w: number,
  h: number,
  vertical: boolean,
  wx: number,
  wy: number,
  seed: number,
): void {
  rect(ctx, sx, sy, w, h, "#3A362C");
  // Ballast chips.
  const span = vertical ? h : w;
  for (let p = 0; p < span; p += 9) {
    const hh = worldHash(seed + 733, Math.floor(vertical ? wx : wx + p), Math.floor(vertical ? wy + p : wy));
    const off = 2 + (hh % Math.max(1, (vertical ? w : h) - 4));
    if (vertical) px(ctx, sx + off, sy + p, hh % 3 === 0 ? "#5A5446" : "#2A271F", 3);
    else px(ctx, sx + p, sy + off, hh % 3 === 0 ? "#5A5446" : "#2A271F", 3);
  }
  // Sleepers every 26px.
  for (let p = 0; p < span; p += 26) {
    if (vertical) rect(ctx, sx + 6, sy + p, w - 12, 9, "#392C1F");
    else rect(ctx, sx + p, sy + 6, 9, h - 12, "#392C1F");
  }
  // Rails.
  const a = vertical ? w : h;
  const r1 = Math.round(a * 0.3);
  const r2 = Math.round(a * 0.7);
  for (const r of [r1, r2]) {
    if (vertical) {
      rect(ctx, sx + r - 2, sy, 4, h, "#5E6266");
      rect(ctx, sx + r - 2, sy, 1, h, "#9AA0A4");
    } else {
      rect(ctx, sx, sy + r - 2, w, 4, "#5E6266");
      rect(ctx, sx, sy + r - 2, w, 1, "#9AA0A4");
    }
  }
}

/** Park footpath: compacted gravel band with soft, ragged edges. */
export function drawPathSegment(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  w: number,
  h: number,
  wx: number,
  wy: number,
  seed: number,
): void {
  ctx.fillStyle = "rgba(122,108,80,0.30)";
  ctx.fillRect(sx, sy, w, h);
  ctx.fillStyle = "rgba(148,132,98,0.22)";
  ctx.fillRect(sx + 3, sy + 3, Math.max(0, w - 6), Math.max(0, h - 6));
  const vertical = h > w;
  const span = vertical ? h : w;
  for (let p = 0; p < span; p += 11) {
    const hh = worldHash(seed + 811, Math.floor(vertical ? wx : wx + p), Math.floor(vertical ? wy + p : wy));
    const off = hh % Math.max(1, (vertical ? w : h) - 3);
    if (vertical) px(ctx, sx + off, sy + p, hh % 4 === 0 ? "rgba(176,160,124,0.5)" : "rgba(84,72,52,0.5)", 2);
    else px(ctx, sx + p, sy + off, hh % 4 === 0 ? "rgba(176,160,124,0.5)" : "rgba(84,72,52,0.5)", 2);
  }
}

// ── 5. street furniture that lives on the ground layer ─────────────────

/** Street lamp with a warm pool of light on the road beneath it. */
export function drawStreetLamp(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const gx = x + 5;
  const gy = y + 40;
  const grad = ctx.createRadialGradient(gx, gy, 2, gx, gy, 54);
  grad.addColorStop(0, "rgba(255,206,120,0.24)");
  grad.addColorStop(0.55, "rgba(255,190,104,0.09)");
  grad.addColorStop(1, "rgba(255,190,104,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(gx, gy, 54, 0, Math.PI * 2);
  ctx.fill();
  // Cast shadow of the pole.
  rect(ctx, x + 2, y + 34, 6, 12, "rgba(0,0,0,0.22)");
  // Pole + fluted highlight.
  rect(ctx, x + 2, y + 6, 6, 30, "#171C1F");
  rect(ctx, x + 3, y + 8, 2, 26, "#39454A");
  // Cowl head + bulb.
  rect(ctx, x - 1, y, 12, 8, "#414D50");
  rect(ctx, x - 1, y, 12, 2, "#6E7C7E");
  rect(ctx, x + 1, y + 5, 8, 4, "#FFD778");
  rect(ctx, x + 2, y + 5, 6, 2, "#FFF0BE");
  // Base plate.
  rect(ctx, x, y + 35, 10, 4, "#0F1416");
}

// ── 6. litter decals ───────────────────────────────────────────────────

/**
 * Sparse ground litter. The district decides what kind of debris shows up,
 * so a park is strewn with branches and leaves while the ruins are covered
 * in concrete chunks, shell casings and dried blood.
 */
export function drawGroundDecal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  seed: number,
  h: number,
  district: District,
): void {
  const table: Record<District, readonly number[]> = {
    core: [0, 2, 8, 11],
    downtown: [0, 1, 2, 4, 7, 11],
    industrial: [1, 5, 8, 12, 4, 11],
    suburb: [0, 7, 9, 10, 11],
    park: [9, 10, 13, 3, 11],
    ruins: [3, 6, 8, 12, 2, 5],
  };
  const set = table[district];
  const kind = set[h % set.length]!;
  if (kind === 0) {
    // Scattered papers / flyers.
    rect(ctx, x, y, 7, 5, "#A8A492");
    rect(ctx, x + 9, y + 7, 6, 4, "#8F8A78");
    rect(ctx, x + 15, y - 3, 5, 4, "#B5B09C");
    px(ctx, x + 1, y + 1, "#C9C5B4", 2);
  } else if (kind === 1) {
    // Rusted cans.
    px(ctx, x, y, "#7C8786", 2);
    px(ctx, x + 4, y + 2, "#9AA5A2", 3);
    px(ctx, x + 2, y + 6, "#5F6B68", 2);
  } else if (kind === 2) {
    // Broken glass.
    px(ctx, x + 2, y, "#AFC6CF", 2);
    px(ctx, x + 6, y + 3, "#8FB2BE", 2);
    px(ctx, x, y + 5, "#7D9BA8", 2);
    px(ctx, x + 9, y + 7, "#C2D8DE", 1);
  } else if (kind === 3) {
    // Old dried blood.
    ctx.fillStyle = "rgba(62,16,15,0.55)";
    ctx.beginPath();
    ctx.arc(x + 5, y + 5, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(84,26,22,0.42)";
    ctx.beginPath();
    ctx.arc(x + 13, y + 12, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 4) {
    // Trash bags.
    rect(ctx, x, y, 11, 10, "#2C2E33");
    rect(ctx, x + 7, y + 4, 8, 8, "#383B41");
    px(ctx, x + 2, y + 2, "#1F2126", 2);
  } else if (kind === 5) {
    // Oil slick.
    // Tilted ellipses via a transformed arc — ctx.ellipse is missing from
    // the headless canvas the tests render on.
    tiltedBlot(ctx, x + 6, y + 4, 11, 6, 0.4, "rgba(10,12,16,0.42)");
    tiltedBlot(ctx, x + 4, y + 3, 6, 3, 0.4, "rgba(60,44,80,0.20)");
  } else if (kind === 6) {
    // Twisted rebar + wire.
    ctx.strokeStyle = "rgba(84,66,48,0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + 2);
    ctx.lineTo(x + 13, y + 7);
    ctx.moveTo(x + 4, y);
    ctx.lineTo(x + 16, y + 3);
    ctx.stroke();
    px(ctx, x + 12, y + 8, "#6A675C", 3);
  } else if (kind === 7) {
    // Discarded clothing.
    rect(ctx, x, y, 8, 5, "#4A5560");
    rect(ctx, x + 5, y + 4, 7, 6, "#5A6772");
    px(ctx, x + 3, y + 3, "#2E3842", 2);
  } else if (kind === 8) {
    // Concrete chunks.
    px(ctx, x, y, "#6E6F6A", 4);
    px(ctx, x + 6, y + 2, "#585A56", 3);
    px(ctx, x + 3, y + 7, "#7A7B74", 3);
  } else if (kind === 9) {
    // Fallen branches.
    ctx.strokeStyle = "rgba(64,50,34,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + 6);
    ctx.lineTo(x + 15, y + 2);
    ctx.moveTo(x + 7, y + 4);
    ctx.lineTo(x + 5, y - 2);
    ctx.stroke();
  } else if (kind === 10) {
    // Leaf litter.
    // Derived from `h` (the cell's stable world hash), never from x/y —
    // those are screen coordinates and would re-roll as the camera moves.
    for (let i = 0; i < 6; i++) {
      const hh = worldHash(seed + 909, h + i * 7, i * 13);
      px(ctx, x + (hh % 16), y + ((hh >> 4) % 14), hh % 2 === 0 ? "#6E7A34" : "#4E5A26", 3);
    }
  } else if (kind === 12) {
    // Spent shell casings — glints of brass.
    for (let i = 0; i < 7; i++) {
      const hh = worldHash(seed + 977, h + i * 11, i * 17);
      px(ctx, x + (hh % 18), y + ((hh >> 5) % 15), hh % 3 === 0 ? "#D8B45A" : "#B08A3C", 2);
    }
  } else if (kind === 13) {
    // Wildflower cluster.
    px(ctx, x, y, "#E6E2C4", 2);
    px(ctx, x + 5, y + 3, "#D9C86B", 2);
    px(ctx, x + 2, y + 7, "#E0A0B4", 2);
    rect(ctx, x + 1, y + 2, 1, 5, "#4E6E38");
    rect(ctx, x + 6, y + 5, 1, 4, "#4E6E38");
  }
  // kind === 11 → deliberately empty (breathing room).
}
