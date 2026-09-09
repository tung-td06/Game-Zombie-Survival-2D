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

import { px, rect, smoothNoise, worldHash } from "./pixelArt";
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
 *
 * One flat disc per lobe, deliberately. Softening each lobe's rim — by
 * stacking nested discs, or by a live radial gradient — was measured at
 * +40% and +130% on the whole ground layer respectively, and the gradient
 * also dithers against the DEVICE pixel grid, which makes the ground crawl
 * as the camera moves. The lobes are already low-alpha and heavily
 * overlapped, so the rim is faint; it is not worth that.
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

/** How many brightness steps a district ramp is resolved into. */
const RAMP_STEPS = 48;
/** How many shading steps either side of the untouched base tone. */
const WASH_STEPS = 12;

const RAMP_RGB: Partial<Record<District, readonly (readonly [number, number, number])[]>> = {};
/** Precomposed ground colours for one district: [tone][shade] -> CSS colour. */
const GROUND_LUT: Partial<Record<District, readonly (readonly string[])[]>> = {};

function parseHex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lumaOf(c: readonly number[]): number {
  return c[0]! * 0.299 + c[1]! * 0.587 + c[2]! * 0.114;
}

function rampRgb(d: District): readonly (readonly [number, number, number])[] {
  const cached = RAMP_RGB[d];
  if (cached) return cached;
  const stops = GROUND[d].base.map(parseHex).sort((a, b) => lumaOf(a) - lumaOf(b));
  const out: [number, number, number][] = [];
  for (let i = 0; i < RAMP_STEPS; i++) {
    const t = (i / (RAMP_STEPS - 1)) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(t));
    const f = t - k;
    const a = stops[k]!;
    const b = stops[k + 1]!;
    out.push([
      Math.round(a[0] + (b[0] - a[0]) * f),
      Math.round(a[1] + (b[1] - a[1]) * f),
      Math.round(a[2] + (b[2] - a[2]) * f),
    ]);
  }
  RAMP_RGB[d] = out;
  return out;
}

/**
 * A district's four base tones, sorted by brightness and resolved into a
 * CONTINUOUS ramp of `RAMP_STEPS` colours.
 *
 * The ground tone is a smooth field, so it needs a smooth palette to land
 * on. Picking one of four authored tones per 64px tile — in the order they
 * happen to be written in district.ts, which is not brightness order — drew
 * the ground as a checkerboard of squares jumping up to fourteen levels
 * between neighbours. Sorted and interpolated, one step of this ramp is at
 * most a single 8-bit level, so the tone moves across the map without any
 * step a viewer can see, and it still only ever uses the district's own
 * authored colours at the ends of the ramp.
 */
export function ramp(d: District): readonly string[] {
  return rampRgb(d).map((c) => `rgb(${c[0]},${c[1]},${c[2]})`);
}

/**
 * Every ground colour a district can paint, with the wash already
 * composited into the base tone.
 *
 * Doing the blend once, into a table, is what keeps the finer quads cheap:
 * a quad that lays a base tone and then a translucent wash over it costs
 * two fills, two `fillStyle` changes and a `globalAlpha` round trip. Off
 * the table it is a single fill of one flat colour — so 32px quads cost
 * about what the old flat 64px tile plus its separate wash pass did.
 */
function groundLut(d: District): readonly (readonly string[])[] {
  const cached = GROUND_LUT[d];
  if (cached) return cached;
  const tones = rampRgb(d);
  // The district's wash tone, as a colour plus the alpha it is used at.
  const w = GROUND[d].wash;
  const parts = w
    .slice(w.indexOf('(') + 1, w.lastIndexOf(')'))
    .split(',')
    .map((v) => parseFloat(v.trim()));
  const wash = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  const washA = parts[3] ?? 0.1;
  const mix = (base: number, over: number, a: number) => Math.round(base + (over - base) * a);
  const out: string[][] = [];
  for (let i = 0; i < RAMP_STEPS; i++) {
    const base = tones[i]!;
    const row: string[] = [];
    for (let j = -WASH_STEPS; j <= WASH_STEPS; j++) {
      const n = j / WASH_STEPS;
      let c: readonly number[] = base;
      if (n < 0) {
        const a = -n * 0.1;
        c = [mix(base[0], 0, a), mix(base[1], 0, a), mix(base[2], 0, a)];
      } else if (n > 0) {
        const a = n * washA;
        c = [mix(base[0], wash[0]!, a), mix(base[1], wash[1]!, a), mix(base[2], wash[2]!, a)];
      }
      row.push(`rgb(${c[0]},${c[1]},${c[2]})`);
    }
    out.push(row);
  }
  GROUND_LUT[d] = out;
  return out;
}

/**
 * Ground shading at a world point, in [-1, 1]: negative darkens, positive
 * lays the district's wash tone, zero leaves the base alone.
 *
 * Two smooth noise octaves with a dead band around the middle, so most of
 * the map is untouched base tone and the shaded areas fade in and out
 * instead of switching on at a cell edge. Continuity is the whole point:
 * the wash this replaces was `hash(128px cell) % 10 < 4`, which stepped
 * from nothing to 13% black across one pixel on every cell boundary and
 * strewed the open ground with hard-edged dark rectangles.
 */
export function washAt(seed: number, x: number, y: number): number {
  return washFrom(smoothNoise(seed + 2029, x, y, 352), smoothNoise(seed + 3167, x, y, 160));
}

function washFrom(low: number, high: number): number {
  const n = low * 0.74 + high * 0.26;
  if (n < 0.42) return -Math.min(1, (0.42 - n) / 0.34);
  if (n > 0.56) return Math.min(1, (n - 0.56) / 0.34);
  return 0;
}

/**
 * One 64px ground tile. `wx`/`wy` are the tile's world origin (multiples of
 * TILE); `sx`/`sy` its current screen position.
 *
 * Three stacked frequencies keep the ground from reading flat:
 *   • the district base ramp, sampled per 32px quad from a smooth field,
 *   • a continuous low-frequency wash (soft meadow / stain patches),
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

  // Base tone and low-frequency wash, both sampled from CONTINUOUS world
  // noise and laid down in 32px quads.
  //
  // Neither is decided once per cell any more. The tone used to be one of
  // four authored colours picked by `hash(tile) % 4`, and the wash a
  // 13%-black flood switched on by `hash(128px cell) % 10 < 4` — two hard
  // per-cell decisions stacked on the same grid, which is what strewed
  // every park, lot and plaza on the map with dark rectangles. Both fields
  // are still pure functions of world position, so the ground stays glued
  // to the world and never crawls under the camera.
  //
  // The two octaves double as the tone field, so a quad costs two noise
  // samples and one flat fill of an already-composited colour.
  const lut = groundLut(d);
  const Q = TILE / 2;
  for (let qy = 0; qy < 2; qy++) {
    for (let qx = 0; qx < 2; qx++) {
      const qwx = wx + qx * Q + Q / 2;
      const qwy = wy + qy * Q + Q / 2;
      const low = smoothNoise(seed + 2029, qwx, qwy, 352);
      const high = smoothNoise(seed + 3167, qwx, qwy, 160);
      const tone = Math.min(RAMP_STEPS - 1, ((low * 0.55 + high * 0.45) * RAMP_STEPS) | 0);
      const shade =
        WASH_STEPS +
        Math.max(-WASH_STEPS, Math.min(WASH_STEPS, Math.round(washFrom(low, high) * WASH_STEPS)));
      rect(ctx, sx + qx * Q, sy + qy * Q, Q, Q, lut[tone]![shade]!);
    }
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
    //
    // The joints step on ONE 68px WORLD grid and are kept well inside the
    // patch. Keying them to the patch's own corner gave every apron its own
    // grid starting 40px in from its edge, which drew the hard rectangle
    // that the soft blob underneath exists to avoid — and made two adjacent
    // aprons read as two pasted tiles instead of one continuous slab.
    ctx.fillStyle = "rgba(14,14,12,0.20)";
    const JOINT = 68;
    const inx = Math.min(28, w * 0.14);
    const iny = Math.min(28, h * 0.14);
    const jx0 = sx - (((wx % JOINT) + JOINT) % JOINT);
    const jy0 = sy - (((wy % JOINT) + JOINT) % JOINT);
    for (let gx = jx0; gx < sx + w - inx; gx += JOINT) {
      if (gx < sx + inx) continue;
      ctx.fillRect(gx, sy + iny, 1, h - 2 * iny);
    }
    for (let gy = jy0; gy < sy + h - iny; gy += JOINT) {
      if (gy < sy + iny) continue;
      ctx.fillRect(sx + inx, gy, w - 2 * inx, 1);
    }
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
 *
 * `kerbAtHigh` says which of the band's two long edges faces the asphalt:
 * true for a band on the road's low side (the kerb is at the band's far
 * edge), false for a band on its high side (the kerb is at the band's near
 * edge). It has to be told, because the two are mirror images and the
 * function used to assume the first one always: every road on the map got a
 * correct kerb on its north/west footway and an INVERTED one on the
 * south/east footway, with the dark earth shoulder laid against the
 * carriageway — the dark strip between road and pavement — and the pale
 * kerb stone facing the buildings.
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
  kerbAtHigh: boolean,
  seed: number,
): void {
  const SHOULDER = 5;
  // Shoulder behind the slab (transition into the block) — always on the
  // edge AWAY from the asphalt.
  const shX = vertical && !kerbAtHigh ? sx + w - SHOULDER : sx;
  const shY = !vertical && !kerbAtHigh ? sy + h - SHOULDER : sy;
  rect(
    ctx,
    shX,
    shY,
    vertical ? SHOULDER : w,
    vertical ? h : SHOULDER,
    "rgba(34,32,24,0.85)",
  );
  const px0 = vertical && kerbAtHigh ? sx + SHOULDER : sx;
  const py0 = !vertical && kerbAtHigh ? sy + SHOULDER : sy;
  const pw = vertical ? w - SHOULDER : w;
  const ph = vertical ? h : h - SHOULDER;
  rect(ctx, px0, py0, pw, ph, "#45463F");

  const span = vertical ? h : w;
  const SLAB = 46;
  // The paving steps on ONE world grid, and the band is clipped instead of
  // the pattern being cut short: keying the grid off each band's own edge
  // put a joint line exactly where two bands met and left a stub slab
  // beside it, so every junction grew a line across its footway.
  const along = vertical ? wy : wx;
  const start = -(((along % SLAB) + SLAB) % SLAB);
  ctx.save();
  ctx.beginPath();
  ctx.rect(px0, py0, pw, ph);
  ctx.clip();
  for (let p = start; p < span; p += SLAB) {
    const hh = worldHash(
      seed + 313,
      Math.floor(vertical ? wx : wx + p),
      Math.floor(vertical ? wy + p : wy),
    );
    // Per-slab tone: sun-bleached, grimy or cracked.
    const tone = hh % 5;
    if (tone === 0) ctx.fillStyle = "rgba(96,94,84,0.28)";
    else if (tone === 1) ctx.fillStyle = "rgba(34,34,30,0.30)";
    else if (tone === 2) ctx.fillStyle = "rgba(66,64,56,0.20)";
    else ctx.fillStyle = "rgba(0,0,0,0)";
    if (tone < 3) {
      if (vertical) ctx.fillRect(px0, py0 + p, pw, SLAB);
      else ctx.fillRect(px0 + p, py0, SLAB, ph);
    }
    // Joint line between slabs.
    ctx.fillStyle = "rgba(10,10,8,0.42)";
    if (vertical) ctx.fillRect(px0 + 1, py0 + p + SLAB - 1, pw - 2, 1);
    else ctx.fillRect(px0 + p + SLAB - 1, py0 + 1, 1, ph - 2);
    // Cracks / heaved slabs.
    if (hh % 11 === 0) {
      ctx.strokeStyle = "rgba(8,8,6,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(px0 + 2, py0 + p + 6);
        ctx.lineTo(px0 + pw - 3, py0 + p + SLAB - 8);
      } else {
        ctx.moveTo(px0 + p + 6, py0 + 2);
        ctx.lineTo(px0 + p + SLAB - 8, py0 + ph - 3);
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
  ctx.restore();

  // Kerb: pale top face + dark shadow lip, always ON the asphalt side.
  if (vertical) {
    const kx = kerbAtHigh ? sx + w - 4 : sx + 1;
    rect(ctx, kx, sy, 3, h, "#5A5B52");
    rect(ctx, kerbAtHigh ? sx + w - 1 : sx, sy, 1, h, "#16170F");
  } else {
    const ky = kerbAtHigh ? sy + h - 4 : sy + 1;
    rect(ctx, sx, ky, w, 3, "#5A5B52");
    rect(ctx, sx, kerbAtHigh ? sy + h - 1 : sy, w, 1, "#16170F");
  }
}

// ── 4. roads ───────────────────────────────────────────────────────────

/**
 * ONE asphalt material for the whole network.
 *
 * [kerb shadow, carriageway, resurfaced].
 *
 * The classes differ only in BRIGHTNESS, by two levels a step, on a single
 * hue. They used to differ in hue as well — the avenues and the beltway
 * were a blue grey (#2E2F33) while the outer ring and the links were a
 * green grey (#2B2C29 / #282926) — so every place a link met a ring, or an
 * avenue met the circus, put a rectangle of visibly different-coloured
 * asphalt in the middle of what is meant to be one continuous road. A road
 * is a road: same aggregate, same tone, and only the wider ones read a
 * little fresher.
 */
const ROAD_TONE: Record<RoadClass, [string, string, string]> = {
  avenue: ["#1A1B1D", "#2E2F33", "#2C2D31"],
  belt: ["#191A1C", "#2D2E32", "#2B2C30"],
  arterial: ["#191A1C", "#2C2D31", "#2A2B2F"],
  outer: ["#18191B", "#2B2C30", "#292A2E"],
  link: ["#18191B", "#2A2B2F", "#28292D"],
};

/** Untouched asphalt left along the road on each side of a patch. */
const PATCH_GAP = 22;
/** Untouched asphalt left between a patch and each kerb. */
const PATCH_EDGE = 14;
/** Narrowest a patch may be across the road. */
const PATCH_MIN_BAND = 14;

/**
 * An along-axis interval of a slab, in slab-local pixels: [start, end).
 * Everything a road paints ON ITSELF (grain, kerb paint, lane lines) is
 * restricted to a list of these, so the stretch that another road crosses
 * paints nothing there instead of stamping its own edge across that other
 * carriageway. The runs come from world geometry and are computed once by
 * GameMap, never per frame and never from camera state.
 */
export type RoadRun = readonly [number, number];

/**
 * Asphalt pass 1 — the kerb-dark ground of a slab, flat over the whole
 * rect. EVERY visible slab gets this before ANY slab gets its carriageway
 * (pass 2), which is what makes the network render as one connected
 * surface: a slab can no longer stamp its dark rim on top of a carriageway
 * that was already laid next to, or across, it.
 */
export function drawRoadBase(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  w: number,
  h: number,
  cls: RoadClass,
): void {
  rect(ctx, sx, sy, w, h, ROAD_TONE[cls][0]);
}

/**
 * Asphalt pass 2 — the carriageway, inset by the 3px kerb shadow on the two
 * LONG sides. An end is inset only when it is a genuinely FREE end — a dead
 * end, or the outer face of a ring corner — which `GameMap` works out once
 * from world geometry. Capping every end unconditionally is what drew a
 * dark bar straight across the road wherever one stretch ran into the next;
 * capping none of them left dead-end streets and ring corners finishing in
 * a raw cut of asphalt with no kerb at all. Where two carriageways meet,
 * the neighbour's deck fills the joint exactly.
 */
export function drawRoadDeck(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  w: number,
  h: number,
  vertical: boolean,
  cls: RoadClass,
  capLo = false,
  capHi = false,
): void {
  const tone = ROAD_TONE[cls][1];
  const lo = capLo ? 3 : 0;
  const hi = capHi ? 3 : 0;
  if (vertical) rect(ctx, sx + 3, sy + lo, w - 6, h - lo - hi, tone);
  else rect(ctx, sx + lo, sy + 3, w - lo - hi, h - 6, tone);
}

/** Clip to a slab's runs (disjoint, sorted) and run `draw` inside them. */
function inRuns(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  w: number,
  h: number,
  vertical: boolean,
  runs: readonly RoadRun[],
  draw: () => void,
): void {
  if (runs.length === 0) return;
  ctx.save();
  ctx.beginPath();
  for (const [a, b] of runs) {
    if (b <= a) continue;
    if (vertical) ctx.rect(sx, sy + a, w, b - a);
    else ctx.rect(sx + a, sy, b - a, h);
  }
  ctx.clip();
  draw();
  ctx.restore();
}

/**
 * Asphalt pass 3 — everything painted on a slab: aggregate texture,
 * resurfacing patches, wheel polish, drains and the road markings.
 *
 * `texRuns` are the stretches this slab still owns visually (a road that
 * a more important road paints over yields its grain there, so patches
 * never stack up and double-darken a junction). `paintRuns` are the
 * stretches with no crossing road at all: road paint stops at a junction
 * box, which is exactly where junction paint is drawn afterwards.
 *
 * Every marking is phased off the slab's WORLD coordinate and stepped in
 * whole periods, so the dash rhythm carries straight through a joint — two
 * stretches of the same road share one pattern instead of each restarting
 * at its own edge.
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
  texRuns: readonly RoadRun[],
  paintRuns: readonly RoadRun[],
): void {
  const span = vertical ? h : w;
  const across = vertical ? w : h;
  const alongW = vertical ? wy : wx;

  /**
   * Start offset for an along-axis pattern of period `P`. Every pattern on
   * the asphalt steps from here, so its cells sit on ONE global world grid
   * of that period instead of restarting at this slab's own edge — which is
   * what put a hard edge in the texture exactly where one stretch of road
   * ran into the next. Result is in (-P, 0]; cells that start before the
   * slab are harmless, `inRuns` clips them away.
   */
  const phase = (P: number) => -(((alongW % P) + P) % P);
  /** World coordinate along the road of the cell at slab-local `p`. */
  const alongAt = (p: number) => alongW + p;
  /** Hash of a cell, keyed on its WORLD position — never on the slab's. */
  const cellHash = (salt: number, p: number) =>
    worldHash(seed + salt, vertical ? wx : alongAt(p), vertical ? alongAt(p) : wy);

  inRuns(ctx, sx, sy, w, h, vertical, texRuns, () => {
    // Wheel-polished lanes: two lighter strips per direction. Part of the
    // SURFACE, not the markings, so it follows `texRuns` and carries
    // straight through a junction the road owns. Clipping it to the painted
    // stretches instead left every junction box a shade darker than the
    // carriageway either side of it — a tonal bar across the road.
    ctx.fillStyle = "rgba(122,120,112,0.055)";
    for (const t of [0.22, 0.35, 0.65, 0.78]) {
      if (vertical) ctx.fillRect(sx + across * t - 6, sy, 12, h);
      else ctx.fillRect(sx, sy + across * t - 6, w, 12);
    }

    // Resurfacing patches — a stretch of re-laid asphalt over a trench.
    //
    // A patch is a LOCAL repair, so it is bounded on all four sides:
    //   • across  — a band of the carriageway, never kerb to kerb, so a
    //     patch can never become a bar spanning the whole road;
    //   • along   — shorter than its 176px cell by at least PATCH_GAP, so
    //     two patches in neighbouring cells can never abut into one block;
    //   • tone    — ROAD_TONE[cls][2], two levels off the carriageway, and
    //     re-speckled with the same aggregate as the road around it, so the
    //     repair reads as ASPHALT of a slightly different age. Everything
    //     louder than that — the old near-black wash, and the five-level
    //     step that replaced it — comes out as a dark rectangle pasted on
    //     the road, because a flat fill with a straight edge is a rectangle
    //     however small the tonal step is;
    //   • edge    — stepped on all FOUR sides, not just the two long ones,
    //     so the boundary is a saw-cut and never a clean straight line.
    //
    // Size, offset and side all come from the cell's WORLD hash, so a patch
    // is the same wherever the camera is and whichever slab draws it.
    for (let p = phase(176); p < span; p += 176) {
      const hh = cellHash(907, p);
      const fresh = hh % 3 === 0;
      if (!fresh && hh % 5 !== 0) continue;
      // Along-axis: 40…110px of the cell, leaving >= PATCH_GAP of untouched
      // asphalt before the next cell's patch can start.
      const len = 40 + (cellHash(1031, p) % (176 - PATCH_GAP - 40));
      const lead = cellHash(1033, p) % Math.max(1, 176 - PATCH_GAP - len);
      // Across-axis: a band inset from both kerbs, at most 55% of the road.
      const bandMax = Math.max(PATCH_MIN_BAND, Math.round(across * 0.55));
      const band =
        PATCH_MIN_BAND + (cellHash(1039, p) % Math.max(1, bandMax - PATCH_MIN_BAND));
      const room = Math.max(0, across - 2 * PATCH_EDGE - band);
      const off = PATCH_EDGE + (room === 0 ? 0 : cellHash(1049, p) % room);
      const a = p + lead;
      const tone = fresh ? ROAD_TONE[cls][2] : "rgba(96,92,82,0.07)";
      const STRIP = 7;
      // Ragged ends: the first and last few strips pull in, so the patch
      // tapers instead of starting and stopping on a straight line.
      const taper = (q: number) => {
        const d = Math.min(q, len - q);
        return d >= 3 * STRIP ? 0 : Math.round((1 - d / (3 * STRIP)) * band * 0.42);
      };
      for (let q = 0; q < len; q += STRIP) {
        const jag = cellHash(1051 + q, p);
        const head = jag % 5;
        const tail = (jag >> 3) % 5;
        const t = taper(q);
        const o0 = off + head + t;
        const o1 = off + band - tail - t;
        const q1 = Math.min(len, q + STRIP);
        if (o1 <= o0) continue;
        if (vertical) {
          rect(ctx, sx + o0, sy + a + q, o1 - o0, q1 - q, tone);
        } else {
          rect(ctx, sx + a + q, sy + o0, q1 - q, o1 - o0, tone);
        }
      }
      // Re-lay the aggregate over the repair so it carries the same grain
      // as the asphalt either side of it — the single thing that stops a
      // patch reading as a flat block, whatever its tone.
      if (!fresh) continue;
      for (let q = 2; q < len; q += 9) {
        const g = cellHash(1181 + q, p);
        const o = off + 3 + (g % Math.max(1, band - 6));
        const c = g % 3 === 0 ? "rgba(104,102,96,0.20)" : "rgba(10,10,12,0.24)";
        if (vertical) px(ctx, sx + o, sy + a + q, c, 2);
        else px(ctx, sx + a + q, sy + o, c, 2);
      }
    }

    // Aggregate speckle — the thing that makes asphalt read as asphalt.
    for (let p = phase(16); p < span; p += 16) {
      const hh = cellHash(911, p);
      const off = 6 + (hh % Math.max(1, across - 12));
      const c = hh % 3 === 0 ? "rgba(96,94,88,0.22)" : "rgba(10,10,12,0.30)";
      if (vertical) px(ctx, sx + off, sy + p + (hh % 13), c, 2);
      else px(ctx, sx + p + (hh % 13), sy + off, c, 2);
    }

    // Long cracks + drain grates at the kerb line.
    for (let p = phase(220); p < span; p += 220) {
      const hh = cellHash(919, p);
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
  });

  // ── Painted markings ────────────────────────────────────────────────
  inRuns(ctx, sx, sy, w, h, vertical, paintRuns, () => {
    const wide = cls === "avenue" || cls === "belt";
    const edge = "rgba(216,214,204,0.42)";
    const yellow = "#C8A544";
    const yellowHi = "#E6C86A";

    // Dashes step in whole periods from a world-anchored origin and are
    // trimmed by the run clip, never by the slab's own length — so the
    // pattern never restarts, doubles up or leaves a short stub where two
    // stretches of the same road meet.
    const drawDash = (
      aStart: number,
      offAcross: number,
      len: number,
      gap: number,
      color: string,
      thick: number,
    ) => {
      for (let p = aStart; p < span; p += len + gap) {
        if (vertical) rect(ctx, sx + offAcross, sy + p, thick, len, color);
        else rect(ctx, sx + p, sy + offAcross, len, thick, color);
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
    // Both dash rhythms below have a 76px period, so one world grid keeps
    // them in step no matter which stretch of road is being drawn.
    const dashStart = phase(76);
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
      drawDash(dashStart, Math.round(across * 0.26) - 1, 30, 46, "rgba(214,212,202,0.34)", 3);
      drawDash(dashStart, Math.round(across * 0.74) - 1, 30, 46, "rgba(214,212,202,0.34)", 3);
    } else {
      drawDash(dashStart, Math.round(mid) - 2, 34, 42, yellow, 4);
    }
  });
}

/**
 * Which compass directions leave a junction box as road. Worked out once by
 * `GameMap` from world geometry — never from a coordinate written down by
 * hand — so one code path renders every shape the network can make.
 */
export interface JunctionArms {
  n: boolean;
  s: boolean;
  e: boolean;
  w: boolean;
}

/**
 * Paint for one box where a vertical and a horizontal carriageway meet.
 *
 * The box is rendered from its TOPOLOGY, not from what kind of road drew
 * it, so the same function produces a crossroads, a T-junction, a corner
 * and a dead end:
 *
 *   • an arm that carries road gets a stop bar and (on a deterministic
 *     subset of junctions) a zebra crossing. Painting all four
 *     unconditionally laid bars and crossings on bare ground wherever a
 *     street only approached the box from two or three sides;
 *   • a side with NO arm gets the carriageway's white edge line carried
 *     straight across it. That is what makes a corner turn and a T close:
 *     both approach roads stop their own edge lines at the box, so without
 *     this the road's edge simply vanishes for the width of the junction;
 *   • a box with fewer than three arms is a corner, not a junction: traffic
 *     does not have to give way to anything, so it gets the edge lines and
 *     no bars.
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
  arms: JunctionArms,
  zebra: boolean,
): void {
  const edge = "rgba(216,214,204,0.42)";
  // Carry the road edge past every closed side of the box.
  if (!arms.n) rect(ctx, ox, oy + 7, ow, 2, edge);
  if (!arms.s) rect(ctx, ox, oy + oh - 9, ow, 2, edge);
  if (!arms.w) rect(ctx, ox + 7, oy, 2, oh, edge);
  if (!arms.e) rect(ctx, ox + ow - 9, oy, 2, oh, edge);

  const count = (arms.n ? 1 : 0) + (arms.s ? 1 : 0) + (arms.e ? 1 : 0) + (arms.w ? 1 : 0);
  if (count < 3) return;

  const bar = "rgba(224,222,212,0.50)";
  // Stop bars: across each approach that exists, just outside the box.
  if (arms.n) rect(ctx, vx + 6, oy - 12, vw - 12, 5, bar);
  if (arms.s) rect(ctx, vx + 6, oy + oh + 7, vw - 12, 5, bar);
  if (arms.w) rect(ctx, ox - 12, hy + 6, 5, hh - 12, bar);
  if (arms.e) rect(ctx, ox + ow + 7, hy + 6, 5, hh - 12, bar);
  if (!zebra) return;

  ctx.fillStyle = "rgba(232,229,218,0.72)";
  const cols = Math.floor((vw - 12) / 16);
  for (let i = 0; i < cols; i++) {
    if (arms.n) ctx.fillRect(vx + 8 + i * 16, oy - 34, 9, 18);
    if (arms.s) ctx.fillRect(vx + 8 + i * 16, oy + oh + 16, 9, 18);
  }
  const rows = Math.floor((hh - 12) / 16);
  for (let i = 0; i < rows; i++) {
    if (arms.w) ctx.fillRect(ox - 34, hy + 8 + i * 16, 18, 9);
    if (arms.e) ctx.fillRect(ox + ow + 16, hy + 8 + i * 16, 18, 9);
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
  const span = vertical ? h : w;
  // Ballast and sleepers step on one world grid and the bed is clipped, so
  // two stretches of line that meet keep a single run of sleepers instead
  // of each restarting its own rhythm at the joint.
  const along = vertical ? wy : wx;
  const phase = (P: number) => -(((along % P) + P) % P);
  ctx.save();
  ctx.beginPath();
  ctx.rect(sx, sy, w, h);
  ctx.clip();
  // Ballast chips.
  for (let p = phase(9); p < span; p += 9) {
    const hh = worldHash(seed + 733, vertical ? wx : wx + p, vertical ? wy + p : wy);
    const off = 2 + (hh % Math.max(1, (vertical ? w : h) - 4));
    if (vertical) px(ctx, sx + off, sy + p, hh % 3 === 0 ? "#5A5446" : "#2A271F", 3);
    else px(ctx, sx + p, sy + off, hh % 3 === 0 ? "#5A5446" : "#2A271F", 3);
  }
  // Sleepers every 26px.
  for (let p = phase(26); p < span; p += 26) {
    if (vertical) rect(ctx, sx + 6, sy + p, w - 12, 9, "#392C1F");
    else rect(ctx, sx + p, sy + 6, 9, h - 12, "#392C1F");
  }
  ctx.restore();
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
  // Same world grid + clip as the rails, for the same reason.
  const along = vertical ? wy : wx;
  ctx.save();
  ctx.beginPath();
  ctx.rect(sx, sy, w, h);
  ctx.clip();
  for (let p = -(((along % 11) + 11) % 11); p < span; p += 11) {
    const hh = worldHash(seed + 811, vertical ? wx : wx + p, vertical ? wy + p : wy);
    const off = hh % Math.max(1, (vertical ? w : h) - 3);
    if (vertical) px(ctx, sx + off, sy + p, hh % 4 === 0 ? "rgba(176,160,124,0.5)" : "rgba(84,72,52,0.5)", 2);
    else px(ctx, sx + p, sy + off, hh % 4 === 0 ? "rgba(176,160,124,0.5)" : "rgba(84,72,52,0.5)", 2);
  }
  ctx.restore();
}

// ── 5. street furniture that lives on the ground layer ─────────────────

/**
 * The warm pool a street lamp throws on the ground.
 *
 * Drawn with the GROUND, not with the lamp: light that lands on the road
 * belongs under everything that stands on the road. Painting it at the end
 * of the obstacle pass — where the whole lamp used to be drawn — washed a
 * soft circle of lamplight over the front of every building and every
 * parked car within 54px of a lamp post.
 */
export function drawStreetLampPool(ctx: CanvasRenderingContext2D, x: number, y: number): void {
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
}

/** The lamp itself: cast shadow, post, cowl and bulb. */
export function drawStreetLamp(ctx: CanvasRenderingContext2D, x: number, y: number): void {
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
