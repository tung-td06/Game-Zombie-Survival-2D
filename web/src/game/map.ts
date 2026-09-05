// src/game/map.ts
// ─────────────────────────────────────────────────────────────────────────
// GREENFIELD QUARANTINE ZONE — the world generator.
//
// The city plan itself lives in district.ts (rings, avenues, zones). This
// file turns that plan into an actual place: it lays the asphalt, lines the
// streets with the buildings each district is made of, drops the landmarks
// (civic plaza, freight yard, boating lake, army checkpoint), and paints
// every layer of it.
//
// Two invariants hold everywhere below, and everything else is downstream
// of them:
//
//   1. COLLISION IS THE ART. Anything that blocks movement is an Obstacle
//      with a Rect, and that same Rect is what gets drawn. Visuals and
//      collision cannot drift apart because there is only one rectangle.
//
//   2. THE WORLD IS PURE. Layout comes from one seeded RNG; every painted
//      detail comes from a hash of WORLD coordinates. Nothing is derived
//      from the camera or the clock, so the ground never crawls, flickers
//      or re-rolls while the player walks.
// ─────────────────────────────────────────────────────────────────────────

import { MAP_SEED, MINIMAP_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from "./settings";
import { circleRectCollide, type Rect } from "./collision";
import { mulberry32, type Rng } from "../lib/rng";
import type { Vec } from "./vec";
import type { Camera } from "./camera";
import {
  BELT_MAX,
  BELT_MIN,
  CORE_HALF,
  CIRCUS,
  CX,
  CY,
  FRINGE,
  GROUND,
  LINKS,
  OUTER_MAX,
  OUTER_MIN,
  PLAZA_RADIUS,
  ROAD_WIDTHS,
  districtAt,
  type District,
  type RoadClass,
} from "./district";
import {
  TILE,
  drawCrater,
  drawGroundDecal,
  drawJunctionPaint,
  drawPathSegment,
  drawRailSegment,
  drawRoadSlab,
  drawSidewalkBand,
  drawStreetLamp,
  drawSurfacePatch,
  drawTerrainTile,
  type PatchKind,
} from "./terrainArt";
import { worldHash } from "./pixelArt";
import { drawPropSprite, type PropKind } from "./propArt";

/** Spatial-hash cell size for obstacle lookups. */
export const CELL = 400;
/** Widest road on the map — kept exported for anything sizing against it. */
export const ROAD_WIDTH = ROAD_WIDTHS.avenue;
/** Width of the paved sidewalk band beside every road. */
export const SIDEWALK = 28;

export { PLAZA_RADIUS } from "./district";

/**
 * Deterministic window-light seed for the structure whose world-space origin
 * is at (worldX, worldY). Depends ONLY on world coordinates — never on the
 * camera or time — so the same building always keeps the same window state.
 * Values in [0, 100): seeds >= 30 represent the ~70% "lit" group.
 */
export function windowLightSeed(worldX: number, worldY: number): number {
  return ((Math.round(worldX) * 13 + Math.round(worldY) * 7) % 100 + 100) % 100;
}

export type ObstacleKind = PropKind;

export interface Obstacle {
  rect: Rect;
  kind: ObstacleKind;
}

interface RoadSlab {
  rect: Rect;
  vertical: boolean;
  cls: RoadClass;
}

interface Junction {
  v: RoadSlab;
  h: RoadSlab;
  overlap: Rect;
  /** Zebra crossings are painted on a deterministic subset of junctions. */
  zebra: boolean;
}

interface Patch {
  rect: Rect;
  kind: PatchKind;
}

interface Plot {
  /** Street frontage the plot consumed. */
  len: number;
  /** Gap to leave before the next plot on this frontage. */
  gap: number;
}

interface Crater {
  x: number;
  y: number;
  r: number;
}

/** Kinds that are allowed to sit on asphalt (traffic + roadblocks). */
const ROAD_LEGAL: ReadonlySet<ObstacleKind> = new Set<ObstacleKind>([
  "car_red",
  "car_blue",
  "car_yellow",
  "car_police",
  "van",
  "bus",
  "wreck",
  "barricade",
  "jersey",
  "sandbag",
  "border",
]);

export class GameMap {
  seed: number;
  rng: Rng;
  /** Every road slab's rect (flat list kept for external consumers). */
  roads: Rect[] = [];
  slabs: RoadSlab[] = [];
  junctions: Junction[] = [];
  streetLamps: Vec[] = [];
  obstacles: Obstacle[] = [];
  /** Render-only ground features. */
  patches: Patch[] = [];
  craters: Crater[] = [];
  paths: Rect[] = [];
  rails: Rect[] = [];
  minimap: HTMLCanvasElement | null = null;
  private grid: Map<string, Obstacle[]> = new Map();

  constructor(seed: number = MAP_SEED) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.generate();
    this.minimap = this.buildMinimap();
  }

  // ═══════════════════════════════════════════════════════ bookkeeping ══
  private add(kind: ObstacleKind, rect: Rect): Obstacle {
    const o: Obstacle = { rect, kind };
    this.obstacles.push(o);
    this.index(o);
    return o;
  }

  private index(o: Obstacle): void {
    const x0 = Math.floor(o.rect.x / CELL);
    const x1 = Math.floor((o.rect.x + o.rect.w) / CELL);
    const y0 = Math.floor(o.rect.y / CELL);
    const y1 = Math.floor((o.rect.y + o.rect.h) / CELL);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const key = `${gx},${gy}`;
        const list = this.grid.get(key);
        if (list) list.push(o);
        else this.grid.set(key, [o]);
      }
    }
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const o of this.obstacles) this.index(o);
  }

  /** Grid-accelerated overlap test — the generator calls this thousands of times. */
  private overlaps(r: Rect, pad: number): boolean {
    const t = { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
    const x0 = Math.floor(t.x / CELL);
    const x1 = Math.floor((t.x + t.w) / CELL);
    const y0 = Math.floor(t.y / CELL);
    const y1 = Math.floor((t.y + t.h) / CELL);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const list = this.grid.get(`${gx},${gy}`);
        if (!list) continue;
        for (const o of list) {
          if (
            t.x < o.rect.x + o.rect.w &&
            t.x + t.w > o.rect.x &&
            t.y < o.rect.y + o.rect.h &&
            t.y + t.h > o.rect.y
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /** True when the rect touches any road slab (extended by `pad`). */
  private touchesRoad(r: Rect, pad = 0): boolean {
    for (const road of this.roads) {
      if (
        r.x - pad < road.x + road.w &&
        r.x + r.w + pad > road.x &&
        r.y - pad < road.y + road.h &&
        r.y + r.h + pad > road.y
      ) {
        return true;
      }
    }
    return false;
  }

  /** True when the rect touches the freight line (extended by `pad`). */
  private touchesRail(r: Rect, pad = 0): boolean {
    for (const t of this.rails) {
      if (
        r.x - pad < t.x + t.w &&
        r.x + r.w + pad > t.x &&
        r.y - pad < t.y + t.h &&
        r.y + r.h + pad > t.y
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * True for points inside the circus ring — the plaza and its apron. This
   * is protected ground: the square at the map centre is where every wave
   * converges and where the player spawns, so no generation pass may leave
   * anything heavier than crushable street furniture standing in it.
   */
  private insideCircus(x: number, y: number): boolean {
    return Math.max(Math.abs(x - CX), Math.abs(y - CY)) < CIRCUS + ROAD_WIDTHS.arterial / 2;
  }

  private inBounds(r: Rect): boolean {
    const m = FRINGE + 8;
    return r.x >= m && r.y >= m && r.x + r.w <= WORLD_WIDTH - m && r.y + r.h <= WORLD_HEIGHT - m;
  }

  /**
   * Place an obstacle if the spot is legal. `roadPad < 0` means the kind is
   * allowed on asphalt (traffic, roadblocks) and the road test is skipped.
   */
  private tryAdd(kind: ObstacleKind, rect: Rect, pad = 30, roadPad = 12): boolean {
    if (!this.inBounds(rect)) return false;
    if (this.overlaps(rect, pad)) return false;
    if (roadPad >= 0 && this.touchesRoad(rect, roadPad)) return false;
    if (roadPad >= 0 && this.touchesRail(rect, roadPad)) return false;
    this.add(kind, rect);
    return true;
  }

  private patch(kind: PatchKind, rect: Rect): void {
    this.patches.push({ kind, rect });
  }

  // ══════════════════════════════════════════════════════════ generate ══
  private generate(): void {
    this.buildFringe();
    this.buildRailway();
    this.buildRoadNetwork();
    this.buildLandmarks();
    this.developStreets();
    this.fillBlockInteriors();
    this.dressJunctions();
    this.parkVehicles();
    this.buildCivicCore();
    this.enforceRoadSafety();
  }

  /** Impassable rubble bank around the whole map. */
  private buildFringe(): void {
    const t = FRINGE;
    const w = WORLD_WIDTH;
    const h = WORLD_HEIGHT;
    this.add("border", { x: -t, y: -t, w: w + 2 * t, h: t });
    this.add("border", { x: -t, y: h, w: w + 2 * t, h: t });
    this.add("border", { x: -t, y: 0, w: t, h });
    this.add("border", { x: w, y: 0, w: t, h });
  }

  // ───────────────────────────────────────────────────────────── roads ──
  private slab(cls: RoadClass, x: number, y: number, w: number, h: number): void {
    const r: Rect = { x, y, w, h };
    this.slabs.push({ rect: r, vertical: h > w, cls });
    this.roads.push(r);
  }

  private buildRoadNetwork(): void {
    const A = ROAD_WIDTHS.avenue;
    const B = ROAD_WIDTHS.belt;
    const C = ROAD_WIDTHS.arterial;
    const O = ROAD_WIDTHS.outer;
    const L = ROAD_WIDTHS.link;

    // The circus: a ring road carrying both avenues around the plaza. The
    // civic square in the middle is the only place in town with no asphalt
    // through it — which is exactly why it reads as the heart of the map.
    const cLo = CX - CIRCUS - C / 2;
    const cSpan = CIRCUS * 2 + C;
    this.slab("arterial", cLo, cLo, cSpan, C);
    this.slab("arterial", cLo, CY + CIRCUS - C / 2, cSpan, C);
    this.slab("arterial", cLo, cLo, C, cSpan);
    this.slab("arterial", CX + CIRCUS - C / 2, cLo, C, cSpan);

    // The avenues run from the map edge and terminate in the circus.
    const stopN = CY - CIRCUS + C / 2;
    const stopS = CY + CIRCUS - C / 2;
    this.slab("avenue", CX - A / 2, 0, A, stopN);
    this.slab("avenue", CX - A / 2, stopS, A, WORLD_HEIGHT - stopS);
    this.slab("avenue", 0, CY - A / 2, stopN, A);
    this.slab("avenue", stopS, CY - A / 2, WORLD_WIDTH - stopS, A);

    // Beltway: a closed ring bounding downtown.
    const bLo = BELT_MIN - B / 2;
    const bSpan = BELT_MAX - BELT_MIN + B;
    this.slab("belt", bLo, bLo, bSpan, B);
    this.slab("belt", bLo, BELT_MAX - B / 2, bSpan, B);
    this.slab("belt", bLo, bLo, B, bSpan);
    this.slab("belt", BELT_MAX - B / 2, bLo, B, bSpan);

    // Outer ring through the themed districts.
    const oLo = OUTER_MIN - O / 2;
    const oSpan = OUTER_MAX - OUTER_MIN + O;
    this.slab("outer", oLo, oLo, oSpan, O);
    this.slab("outer", oLo, OUTER_MAX - O / 2, oSpan, O);
    this.slab("outer", oLo, oLo, O, oSpan);
    this.slab("outer", OUTER_MAX - O / 2, oLo, O, oSpan);

    // Radial links: map edge → beltway, one per outer district per side.
    for (const l of LINKS) {
      this.slab("link", l - L / 2, 0, L, BELT_MIN);
      this.slab("link", l - L / 2, BELT_MAX, L, WORLD_HEIGHT - BELT_MAX);
      this.slab("link", 0, l - L / 2, BELT_MIN, L);
      this.slab("link", BELT_MAX, l - L / 2, WORLD_WIDTH - BELT_MAX, L);
    }

    this.findJunctions();
    this.placeStreetLamps();
  }

  /**
   * A junction is where a vertical and a horizontal slab cross *through*
   * each other. Overlaps that merely touch a slab's end — the four corners
   * where the ring roads meet themselves — are not junctions, and must not
   * get stop lines or zebra crossings painted across them.
   */
  private findJunctions(): void {
    const interior = (s: RoadSlab, ov: Rect): boolean => {
      const r = s.rect;
      return s.vertical
        ? ov.y > r.y + 10 && ov.y + ov.h < r.y + r.h - 10
        : ov.x > r.x + 10 && ov.x + ov.w < r.x + r.w - 10;
    };
    for (let i = 0; i < this.slabs.length; i++) {
      for (let j = i + 1; j < this.slabs.length; j++) {
        const a = this.slabs[i]!;
        const b = this.slabs[j]!;
        if (a.vertical === b.vertical) continue;
        const v = a.vertical ? a : b;
        const h = a.vertical ? b : a;
        const ox = Math.max(v.rect.x, h.rect.x);
        const oy = Math.max(v.rect.y, h.rect.y);
        const ow = Math.min(v.rect.x + v.rect.w, h.rect.x + h.rect.w) - ox;
        const oh = Math.min(v.rect.y + v.rect.h, h.rect.y + h.rect.h) - oy;
        if (ow <= 0 || oh <= 0) continue;
        const overlap: Rect = { x: ox, y: oy, w: ow, h: oh };
        if (!interior(v, overlap) || !interior(h, overlap)) continue;
        this.junctions.push({
          v,
          h,
          overlap,
          zebra: worldHash(this.seed + 43, Math.round(ox), Math.round(oy)) % 3 !== 0,
        });
      }
    }
  }

  /** Lamps march down the sidewalk of every road, skipping junction zones. */
  private placeStreetLamps(): void {
    for (const s of this.slabs) {
      if (s.cls === "link" && this.rng.next() < 0.4) continue;
      const spacing = s.cls === "avenue" || s.cls === "belt" ? 230 : 290;
      const r = s.rect;
      const a0 = (s.vertical ? r.y : r.x) + 140;
      const a1 = (s.vertical ? r.y + r.h : r.x + r.w) - 140;
      let flip = this.rng.next() < 0.5;
      for (let a = a0; a < a1; a += spacing) {
        if (this.nearJunction(s, a, 120)) continue;
        flip = !flip;
        const off = flip ? -(SIDEWALK - 8) : (s.vertical ? r.w : r.h) + 8;
        this.streetLamps.push(
          s.vertical ? { x: r.x + off, y: a } : { x: a, y: r.y + off },
        );
      }
    }
  }

  private nearJunction(s: RoadSlab, along: number, clear: number): boolean {
    for (const j of this.junctions) {
      if (j.v !== s && j.h !== s) continue;
      const c = s.vertical
        ? j.overlap.y + j.overlap.h / 2
        : j.overlap.x + j.overlap.w / 2;
      const half = (s.vertical ? j.overlap.h : j.overlap.w) / 2;
      if (Math.abs(along - c) < half + clear) return true;
    }
    return false;
  }

  /**
   * Stretches of a road with no junction in them — the "blocks". Returned in
   * along-axis coordinates.
   */
  private freeSpans(s: RoadSlab, clear: number): Array<[number, number]> {
    const r = s.rect;
    const lo = (s.vertical ? r.y : r.x) + 40;
    const hi = (s.vertical ? r.y + r.h : r.x + r.w) - 40;
    const cuts: Array<[number, number]> = [];
    // Every perpendicular road that touches this one interrupts the
    // frontage — T-junctions into the rings included, not just the
    // four-way crossings that get painted.
    for (const o of this.slabs) {
      if (o === s || o.vertical === s.vertical) continue;
      const a = Math.max(r.x, o.rect.x);
      const b = Math.max(r.y, o.rect.y);
      const w = Math.min(r.x + r.w, o.rect.x + o.rect.w) - a;
      const h = Math.min(r.y + r.h, o.rect.y + o.rect.h) - b;
      if (w <= 0 || h <= 0) continue;
      const s0 = s.vertical ? b : a;
      const s1 = s.vertical ? b + h : a + w;
      cuts.push([s0 - clear, s1 + clear]);
    }
    cuts.sort((p, q) => p[0] - q[0]);
    const out: Array<[number, number]> = [];
    let cur = lo;
    for (const [a, b] of cuts) {
      if (a > cur + 40) out.push([cur, Math.min(a, hi)]);
      cur = Math.max(cur, b);
    }
    if (cur < hi - 40) out.push([cur, hi]);
    return out.filter(([a, b]) => b - a > 110);
  }

  private buildRailway(): void {
    const y = 176;
    this.rails.push({ x: 0, y, w: WORLD_WIDTH, h: 54 });
    // Ballast apron either side reads as track bed, not lawn.
    this.patch("gravel", { x: 0, y: y - 36, w: WORLD_WIDTH, h: 126 });
  }

  // ──────────────────────────────────────────────────────── landmarks ──
  private buildLandmarks(): void {
    this.buildFreightYard();
    this.buildLake();
    this.buildCheckpoint();
    this.buildPowerLine();
    this.buildFuelStation();
  }

  /** Industrial north: a container yard, silos and tanks inside the ring. */
  private buildFreightYard(): void {
    const rng = this.rng;
    this.patch("concrete", { x: 560, y: 470, w: 620, h: 400 });
    // Two rows of stacked containers on the yard apron.
    for (let row = 0; row < 2; row++) {
      let x = 600 + rng.next() * 50;
      while (x < 1120) {
        const len = 170 + Math.floor(rng.next() * 60);
        this.tryAdd("container", { x, y: 510 + row * 120, w: len, h: 74 }, 16, 16);
        x += len + 30 + rng.next() * 60;
      }
    }
    // Tank farm and silo cluster east of the avenue.
    const silos: Array<[number, number, number]> = [
      [2380, 520, 126],
      [2545, 545, 102],
      [2450, 690, 92],
    ];
    for (const [sx, sy, d] of silos) this.tryAdd("silo", { x: sx, y: sy, w: d, h: d }, 18, 16);
    this.tryAdd("tank", { x: 2960, y: 520, w: 150, h: 150 }, 18, 16);
    this.tryAdd("tank", { x: 3160, y: 566, w: 114, h: 114 }, 18, 16);
    this.patch("dirt", { x: 2340, y: 470, w: 960, h: 400 });
    for (let i = 0; i < 14; i++) {
      this.tryAdd(
        "barrel",
        { x: 2940 + rng.next() * 340, y: 700 + rng.next() * 110, w: 26, h: 34 },
        8,
        10,
      );
    }
  }

  /** Riverside park south: a boating lake, footpaths and a pavilion. */
  private buildLake(): void {
    this.tryAdd("pond", { x: 1330, y: 3150, w: 540, h: 330 }, 20, 26);
    this.tryAdd("pond", { x: 2170, y: 3190, w: 470, h: 270 }, 20, 26);
    this.patch("sand", { x: 1290, y: 3096, w: 620, h: 80 });
    this.patch("lawn", { x: 900, y: 3096, w: 1200, h: 420 });
    this.patch("lawn", { x: 2300, y: 3110, w: 1000, h: 380 });
    this.tryAdd("gazebo", { x: 1420, y: 3560, w: 132, h: 132 }, 26, 26);
    this.tryAdd("gazebo", { x: 2560, y: 3560, w: 124, h: 124 }, 26, 26);
    // Footpaths threading between the beltway and the water.
    this.paths.push({ x: 1290, y: 3110, w: 1420, h: 24 });
    this.paths.push({ x: 1290, y: 3110, w: 24, h: 500 });
    this.paths.push({ x: 2686, y: 3110, w: 24, h: 500 });
    this.paths.push({ x: 1290, y: 3586, w: 1420, h: 24 });
    this.paths.push({ x: 1900, y: 3134, w: 24, h: 452 });
    const benches: Array<[number, number, boolean]> = [
      [1400, 3096, true],
      [1620, 3096, true],
      [1780, 3096, true],
      [2260, 3096, true],
      [1480, 3500, true],
      [2300, 3500, true],
    ];
    for (const [bx, by, horiz] of benches) {
      this.tryAdd("bench", { x: bx, y: by, w: horiz ? 52 : 18, h: horiz ? 18 : 52 }, 12, 14);
    }
  }

  /** Quarantine east: an army checkpoint straddling the avenue gate. */
  private buildCheckpoint(): void {
    const gy = CY;
    // Barrier lines flanking the avenue — the middle lanes stay open so the
    // gate can never be sealed shut.
    this.tryAdd("jersey", { x: 3200, y: gy - 260, w: 26, h: 160 }, 8, -1);
    this.tryAdd("jersey", { x: 3200, y: gy + 100, w: 26, h: 160 }, 8, -1);
    this.tryAdd("sandbag", { x: 3300, y: gy - 240, w: 56, h: 130 }, 8, -1);
    this.tryAdd("sandbag", { x: 3300, y: gy + 110, w: 56, h: 130 }, 8, -1);
    this.tryAdd("watchtower", { x: 3390, y: gy - 320, w: 96, h: 96 }, 16, 14);
    this.tryAdd("watchtower", { x: 3390, y: gy + 224, w: 96, h: 96 }, 16, 14);
    // Field hospital behind the line.
    for (const [tx, ty] of [[3160, 1610], [3160, 1750], [3160, 2250], [3160, 2390]] as const) {
      this.tryAdd("tent", { x: tx, y: ty, w: 190, h: 96 }, 18, 16);
    }
    this.patch("concrete", { x: 3120, y: 1560, w: 400, h: 900 });
    this.tryAdd("sign", { x: 3130, y: gy - 350, w: 92, h: 30 }, 10, 12);
  }

  /** Suburbs west: a transmission line marching down the district. */
  private buildPowerLine(): void {
    for (let y = 300; y < WORLD_HEIGHT - 240; y += 520) {
      this.tryAdd("pylon", { x: 132, y, w: 108, h: 108 }, 20, 18);
    }
  }

  /** A filling station on the downtown ring's north-west block. */
  private buildFuelStation(): void {
    const x = 1140;
    const y = 1140;
    this.patch("concrete", { x: x - 40, y: y - 40, w: 330, h: 250 });
    this.tryAdd("fuel_pump", { x, y, w: 132, h: 40 }, 14, 16);
    this.tryAdd("fuel_pump", { x, y: y + 96, w: 132, h: 40 }, 14, 16);
    this.tryAdd("kiosk", { x: x + 178, y: y + 12, w: 92, h: 112 }, 16, 16);
  }

  private developStreets(): void {
    const rng = this.rng;
    // Process wide roads first so the big landmarks claim the best plots.
    const order = [...this.slabs].sort((a, b) => rank(b.cls) - rank(a.cls));
    for (const s of order) {
      if (s.cls === "link" && rng.next() < 0.2) continue;
      const clear = s.cls === "avenue" || s.cls === "belt" ? 74 : 52;
      const spans = this.freeSpans(s, clear);
      for (const side of [-1, 1] as const) {
        for (const [a0, a1] of spans) {
          this.developFrontage(s, side, a0, a1);
        }
      }
    }
  }

  private developFrontage(s: RoadSlab, side: -1 | 1, a0: number, a1: number): void {
    let cur = a0 + 12;
    let guard = 0;
    while (cur < a1 - 80 && guard++ < 30) {
      const built = this.buildPlot(s, side, cur, a1);
      cur += built.len > 0 ? built.len + built.gap : 66;
    }
  }

  /** Rect for a plot at `along`, set back from the road on the given side. */
  private frontRect(
    s: RoadSlab,
    side: -1 | 1,
    along: number,
    alongLen: number,
    depth: number,
    setback: number,
  ): Rect {
    const r = s.rect;
    if (s.vertical) {
      const x = side < 0 ? r.x - setback - depth : r.x + r.w + setback;
      return { x, y: along, w: depth, h: alongLen };
    }
    const y = side < 0 ? r.y - setback - depth : r.y + r.h + setback;
    return { x: along, y, w: alongLen, h: depth };
  }

  /**
   * How much open land there is behind this kerb before the next road (or
   * the map fringe). Plot depths scale to this, which is what stops a narrow
   * band between two ring roads from being stuffed with buildings that would
   * collide in the middle of the block.
   */
  private depthAvailable(s: RoadSlab, side: -1 | 1, along: number): number {
    const r = s.rect;
    const vertical = s.vertical;
    const edge = vertical ? (side < 0 ? r.x : r.x + r.w) : side < 0 ? r.y : r.y + r.h;
    const limit = vertical ? WORLD_WIDTH : WORLD_HEIGHT;
    let best = side < 0 ? edge - FRINGE : limit - FRINGE - edge;
    for (const other of [...this.roads, ...this.rails]) {
      if (other === r) continue;
      if (vertical) {
        if (along < other.y - 20 || along > other.y + other.h + 20) continue;
        const d = side < 0 ? edge - (other.x + other.w) : other.x - edge;
        if (d >= 0 && d < best) best = d;
      } else {
        if (along < other.x - 20 || along > other.x + other.w + 20) continue;
        const d = side < 0 ? edge - (other.y + other.h) : other.y - edge;
        if (d >= 0 && d < best) best = d;
      }
    }
    return Math.max(0, best);
  }

  /**
   * Place a frontage building, retrying at a smaller footprint before
   * giving up. Blocks are tight and corners are contested, so a plot that
   * cannot take a full-size building can usually still take a narrow one —
   * which is what keeps the streets continuously built up instead of
   * pockmarked with gaps wherever the first roll happened to collide.
   */
  private tryPlot(
    kind: ObstacleKind,
    s: RoadSlab,
    side: -1 | 1,
    along: number,
    len: number,
    depth: number,
    setback: number,
    pad: number,
  ): { len: number; depth: number } | null {
    for (const k of [1, 0.8, 0.62]) {
      const l = Math.round(len * k);
      const dp = Math.round(depth * (k < 1 ? 0.84 : 1));
      if (l < 62 || dp < 48) break;
      const box = this.frontRect(s, side, along, l, dp, setback);
      if (this.tryAdd(kind, box, pad, 12)) return { len: l, depth: dp };
    }
    return null;
  }

  /**
   * Build one plot of street frontage. Returns how much street it consumed
   * and the gap to leave before the next one — terraced downtown, generous
   * in the suburbs, ragged in the ruins.
   */
  private buildPlot(s: RoadSlab, side: -1 | 1, along: number, limit: number): Plot {
    const rng = this.rng;
    const room = limit - along;
    const wide = s.cls === "avenue" || s.cls === "belt";
    const NONE: Plot = { len: 0, gap: 0 };

    const probe = this.frontRect(s, side, along, 60, 60, 60);
    const d = districtAt(probe.x + probe.w / 2, probe.y + probe.h / 2);
    const band = this.depthAvailable(s, side, along + 40);
    if (band < 90) return NONE;

    /** Fit a requested footprint into the street room and block depth left. */
    const fit = (
      wantLen: number,
      minLen: number,
      wantSetback: number,
      depthFrac: number,
      minDepth: number,
    ): { len: number; depth: number; setback: number } | null => {
      const len = Math.min(wantLen, room - 12);
      if (len < minLen) return null;
      const sb = Math.min(wantSetback, Math.max(8, band * 0.16));
      const depth = Math.min(band * depthFrac, band - sb - 14);
      if (depth < minDepth) return null;
      return { len: Math.round(len), depth: Math.round(depth), setback: Math.round(sb) };
    };

    switch (d) {
      case "park": {
        // The park is deliberately open: an avenue of street trees, the
        // occasional bench, and nothing that blocks a sight line.
        const roll = rng.next();
        if (roll < 0.3) return NONE;
        const kind: ObstacleKind = roll < 0.78 ? "tree" : roll < 0.92 ? "planter" : "bench";
        const len = kind === "bench" ? 52 : 46;
        if (len > room) return NONE;
        const box = this.frontRect(s, side, along, len, kind === "bench" ? 18 : 46, 38);
        return this.tryAdd(kind, box, 16, 14) ? { len, gap: 74 + rng.next() * 90 } : NONE;
      }

      case "core":
      case "downtown": {
        // The civic apron inside the circus is protected open ground: the
        // ring road's inner frontage gets street trees, never buildings, so
        // the plaza can never be walled in. Only the outward-facing side of
        // the circus is built up.
        if (this.insideCircus(probe.x + probe.w / 2, probe.y + probe.h / 2)) {
          const r2 = rng.next();
          if (r2 < 0.45 || room < 46) return NONE;
          const kind: ObstacleKind = r2 < 0.86 ? "tree" : "planter";
          const box = this.frontRect(s, side, along, 46, 46, 32);
          return this.tryAdd(kind, box, 18, 16) ? { len: 46, gap: 90 + rng.next() * 130 } : NONE;
        }
        const roll = rng.next();
        if (roll < 0.12) return NONE; // alley / forecourt
        // Towers front the avenues and the beltway; mid-rises everything else.
        const tower = wide && roll < 0.44;
        const f = fit(
          tower ? 190 + rng.next() * 110 : 130 + rng.next() * 120,
          tower ? 150 : 90,
          22 + rng.next() * 18,
          0.33,
          tower ? 104 : 74,
        );
        if (!f) return NONE;
        const got = this.tryPlot(tower ? "tower" : "building", s, side, along, f.len, f.depth, f.setback, 16);
        if (!got) return NONE;
        this.dressStreetEdge(s, side, along, got.len, f.setback, d);
        return { len: got.len, gap: 16 + rng.next() * 44 };
      }

      case "industrial": {
        const roll = rng.next();
        if (roll < 0.18) return NONE;
        if (roll < 0.66) {
          const f = fit(210 + rng.next() * 210, 128, 40 + rng.next() * 26, 0.34, 84);
          if (!f) return NONE;
          const got = this.tryPlot("warehouse", s, side, along, f.len, f.depth, f.setback, 18);
          if (!got) return NONE;
          // Loading apron between the shed and the kerb.
          this.patch(
            "concrete",
            this.frontRect(s, side, along - 10, got.len + 20, Math.max(20, f.setback - 6), 4),
          );
          return { len: got.len, gap: 34 + rng.next() * 80 };
        }
        if (roll < 0.84) {
          // Open yard: a container stack on gravel.
          const f = fit(150 + rng.next() * 110, 108, 52 + rng.next() * 26, 0.22, 58);
          if (!f) return NONE;
          const got = this.tryPlot("container", s, side, along, f.len, Math.min(78, f.depth), f.setback, 16);
          if (!got) return NONE;
          this.patch("gravel", this.frontRect(s, side, along - 20, got.len + 40, f.setback + 110, 10));
          return { len: got.len, gap: 44 + rng.next() * 90 };
        }
        // A silo or a chemical tank on the yard edge.
        const size = Math.min(130, Math.max(72, band * 0.42));
        if (size + 24 > room) return NONE;
        const box = this.frontRect(s, side, along, size, size, 48);
        const kind: ObstacleKind = rng.next() < 0.5 ? "silo" : "tank";
        if (!this.tryAdd(kind, box, 18, 12)) return NONE;
        return { len: size, gap: 40 + rng.next() * 80 };
      }

      case "suburb": {
        const roll = rng.next();
        if (roll < 0.16) return NONE;
        const f = fit(126 + rng.next() * 84, 96, 58 + rng.next() * 30, 0.31, 76);
        if (!f) return NONE;
        const got = this.tryPlot("house", s, side, along, f.len, f.depth, f.setback, 18);
        if (!got) return NONE;
        this.patch("lawn", this.frontRect(s, side, along - 14, got.len + 28, Math.max(18, f.setback - 8), 6));
        // Front fence with a gate gap, plus a mailbox at the kerb.
        const fw = Math.floor(got.len * 0.4);
        this.tryAdd("fence", this.frontRect(s, side, along + 4, fw, 12, 30), 8, 12);
        this.tryAdd("fence", this.frontRect(s, side, along + got.len - fw - 4, fw, 12, 30), 8, 12);
        this.tryAdd("mailbox", this.frontRect(s, side, along + got.len - 20, 14, 22, 12), 8, 10);
        if (rng.next() < 0.4) {
          this.tryAdd(
            "tree",
            this.frontRect(s, side, along + Math.floor(got.len / 2), 40, 40, Math.max(14, f.setback - 52)),
            14,
            12,
          );
        }
        return { len: got.len, gap: 38 + rng.next() * 66 };
      }

      case "ruins": {
        const roll = rng.next();
        if (roll < 0.24) return NONE;
        if (roll < 0.82) {
          const f = fit(134 + rng.next() * 136, 96, 32 + rng.next() * 30, 0.33, 76);
          if (!f) return NONE;
          const got = this.tryPlot("building", s, side, along, f.len, f.depth, f.setback, 16);
          if (!got) return NONE;
          const box = this.frontRect(s, side, along, got.len, got.depth, f.setback);
          // Collapse: scorched ground and rubble spilling toward the street.
          this.patch("scorch", { x: box.x - 40, y: box.y - 40, w: box.w + 80, h: box.h + 80 });
          this.tryAdd(
            "rubble",
            this.frontRect(
              s,
              side,
              along + Math.floor(got.len * 0.3),
              Math.floor(got.len * 0.4),
              Math.max(22, f.setback - 10),
              6,
            ),
            10,
            8,
          );
          if (rng.next() < 0.35) {
            this.craters.push({
              x: box.x + box.w / 2 + (rng.next() - 0.5) * 150,
              y: box.y + box.h / 2 + (rng.next() - 0.5) * 150,
              r: 42 + rng.next() * 36,
            });
          }
          return { len: got.len, gap: 26 + rng.next() * 84 };
        }
        // Quarantine post: a tent behind a sandbag line.
        const f = fit(170 + rng.next() * 40, 126, 50, 0.24, 62);
        if (!f) return NONE;
        const got = this.tryPlot("tent", s, side, along, f.len, Math.min(96, f.depth), f.setback, 16);
        if (!got) return NONE;
        this.tryAdd("sandbag", this.frontRect(s, side, along + 10, got.len - 20, 26, 16), 8, 12);
        return { len: got.len, gap: 54 + rng.next() * 80 };
      }
    }
  }

  /** Kerbside fittings in front of a freshly built downtown plot. */
  private dressStreetEdge(
    s: RoadSlab,
    side: -1 | 1,
    along: number,
    len: number,
    setback: number,
    d: District,
  ): void {
    if (setback < 26) return; // terraced frontage — no room at the kerb
    const rng = this.rng;
    const roll = rng.next();
    const near = Math.max(4, Math.floor(setback * 0.3));
    if (roll < 0.16) {
      this.tryAdd("bus_stop", this.frontRect(s, side, along + 18, 82, 24, near), 12, 10);
    } else if (roll < 0.3) {
      this.tryAdd("kiosk", this.frontRect(s, side, along + len - 66, 52, 42, near), 12, 10);
    } else if (roll < 0.46) {
      this.tryAdd("hydrant", this.frontRect(s, side, along + 12, 18, 24, near), 10, 8);
    } else if (roll < 0.62) {
      this.tryAdd("planter", this.frontRect(s, side, along + Math.floor(len / 2), 44, 44, near), 12, 8);
    } else if (roll < 0.72 && d === "downtown") {
      this.tryAdd("billboard", this.frontRect(s, side, along + 24, 110, 28, near), 14, 10);
    } else if (roll < 0.82) {
      this.tryAdd("tree", this.frontRect(s, side, along + Math.floor(len * 0.7), 38, 38, near), 12, 8);
    }
  }

  // ─────────────────────────────────────────────── block interior fill ──
  /**
   * Everything that is not street frontage: back yards, groves, scrub,
   * dumped crates and the odd wreck. Sampled on a coarse lattice so the
   * distribution stays even instead of clumping wherever the RNG landed.
   */
  private fillBlockInteriors(): void {
    const rng = this.rng;
    const STEP = 118;
    for (let gy = FRINGE + 90; gy < WORLD_HEIGHT - FRINGE - 90; gy += STEP) {
      for (let gx = FRINGE + 90; gx < WORLD_WIDTH - FRINGE - 90; gx += STEP) {
        const x = gx + rng.next() * (STEP - 40);
        const y = gy + rng.next() * (STEP - 40);
        const d = districtAt(x, y);
        this.scatterOne(d, x, y, rng);
      }
    }
    // Coarse surface patches so the open land is never one flat colour.
    const PSTEP = 300;
    for (let gy = 120; gy < WORLD_HEIGHT - 200; gy += PSTEP) {
      for (let gx = 120; gx < WORLD_WIDTH - 200; gx += PSTEP) {
        const h = worldHash(this.seed + 173, gx, gy);
        if (h % 5 > 2) continue;
        const d = districtAt(gx + 140, gy + 140);
        const kind: PatchKind =
          d === "industrial"
            ? (["gravel", "dirt", "concrete"] as const)[h % 3]!
            : d === "ruins"
              ? (["scorch", "concrete", "dirt"] as const)[h % 3]!
              : d === "park" || d === "suburb"
                ? (["lawn", "dirt", "lawn"] as const)[h % 3]!
                : (["concrete", "dirt", "gravel"] as const)[h % 3]!;
        const rect: Rect = {
          x: gx + 20 + ((h >> 4) % 120),
          y: gy + 20 + ((h >> 8) % 120),
          w: 150 + ((h >> 5) % 150),
          h: 120 + ((h >> 9) % 140),
        };
        if (this.touchesRoad(rect, 8)) continue;
        this.patch(kind, rect);
      }
    }
  }

  /** One interior prop appropriate to the district, if the spot is free. */
  private scatterOne(d: District, x: number, y: number, rng: Rng): void {
    const roll = rng.next();
    const sq = (k: ObstacleKind, size: number, pad = 10, roadPad = 14): void => {
      this.tryAdd(k, { x: x - size / 2, y: y - size / 2, w: size, h: size }, pad, roadPad);
    };
    switch (d) {
      case "core":
        // Sparse on purpose: the core is the arena everything converges on.
        if (this.insideCircus(x, y)) return;
        if (roll < 0.3) sq("tree", 42, 16, 22);
        else if (roll < 0.38) sq("planter", 44, 14, 20);
        else if (roll < 0.42) sq("bench", 46, 14, 20);
        return;
      case "downtown":
        if (roll < 0.15) sq("tree", 38, 12, 18);
        else if (roll < 0.24) sq("dumpster", 38, 10, 16);
        else if (roll < 0.32) sq("crate", 42, 10, 14);
        else if (roll < 0.42) sq("bush", 28, 8, 14);
        else if (roll < 0.45) sq("cart", 30, 10, 14);
        return;
      case "industrial":
        if (roll < 0.14) sq("crate", 44, 10, 14);
        else if (roll < 0.26) sq("barrel", 30, 8, 14);
        else if (roll < 0.32) sq("container", 74, 18, 18);
        else if (roll < 0.38) sq("wreck", 62, 14, 16);
        else if (roll < 0.46) sq("tree", 34, 14, 18);
        else if (roll < 0.52) sq("bush", 26, 8, 14);
        return;
      case "suburb":
        if (roll < 0.4) sq("tree", 46, 14, 18);
        else if (roll < 0.62) sq("bush", 30, 8, 14);
        else if (roll < 0.68) sq("crate", 40, 10, 14);
        else if (roll < 0.71) sq("cart", 30, 10, 14);
        return;
      case "park":
        if (roll < 0.56) sq("tree", 50, 14, 20);
        else if (roll < 0.84) sq("bush", 32, 8, 16);
        else if (roll < 0.86) sq("bench", 46, 14, 18);
        return;
      case "ruins":
        if (roll < 0.18) sq("rubble", 66, 12, 14);
        else if (roll < 0.28) sq("wreck", 64, 14, 16);
        else if (roll < 0.35) sq("barricade", 78, 10, 14);
        else if (roll < 0.45) sq("tree", 36, 14, 18);
        else if (roll < 0.52) sq("bush", 26, 8, 14);
        else if (roll < 0.56) sq("barrel", 30, 8, 14);
        return;
    }
  }

  // ────────────────────────────────────────────────── junction fittings ──
  /** Signals and signage on the corners of the busier junctions. */
  private dressJunctions(): void {
    const rng = this.rng;
    for (const j of this.junctions) {
      const major =
        j.v.cls === "avenue" || j.h.cls === "avenue" || j.v.cls === "belt" || j.h.cls === "belt";
      if (!major && rng.next() < 0.6) continue;
      const o = j.overlap;
      const corners: Array<[number, number]> = [
        [o.x - 30, o.y - 38],
        [o.x + o.w + 8, o.y - 38],
        [o.x - 30, o.y + o.h + 8],
        [o.x + o.w + 8, o.y + o.h + 8],
      ];
      let placed = 0;
      for (const [cx, cy] of corners) {
        if (placed >= (major ? 2 : 1)) break;
        if (this.tryAdd("traffic_light", { x: cx, y: cy, w: 22, h: 30 }, 10, 4)) placed++;
      }
      if (major && rng.next() < 0.45) {
        this.tryAdd("sign", { x: o.x - 116, y: o.y + o.h + 14, w: 84, h: 28 }, 10, 8);
      }
    }
  }

  // ───────────────────────────────────────────────────────── vehicles ──
  /** Abandoned traffic: kerb parking, jams near junctions, wrecks out east. */
  private parkVehicles(): void {
    const rng = this.rng;
    for (const s of this.slabs) {
      const spans = this.freeSpans(s, 90);
      for (const [a0, a1] of spans) {
        if (a1 - a0 < 260) continue;
        const d = districtAt(
          s.vertical ? s.rect.x + s.rect.w / 2 : (a0 + a1) / 2,
          s.vertical ? (a0 + a1) / 2 : s.rect.y + s.rect.h / 2,
        );
        const density = d === "ruins" ? 0.85 : d === "park" ? 0.25 : 0.55;
        if (rng.next() > density) continue;
        const side = rng.next() < 0.5 ? -1 : 1;
        const count = 1 + (rng.next() < 0.45 ? 1 : 0) + (a1 - a0 > 700 && rng.next() < 0.5 ? 1 : 0);
        let along = a0 + 70;
        for (let i = 0; i < count && along < a1 - 80; i++) {
          const kind = pickVehicle(rng, d);
          const len =
            kind === "bus" ? 226 + Math.floor(rng.next() * 40) : kind === "van" ? 152 + Math.floor(rng.next() * 24) : 86 + Math.floor(rng.next() * 20);
          const across = kind === "bus" ? 62 : kind === "van" ? 53 : 45;
          const half = across / 2 + 8;
          const r = s.rect;
          const centre = s.vertical
            ? r.x + (side < 0 ? half : r.w - half)
            : r.y + (side < 0 ? half : r.h - half);
          const box: Rect = s.vertical
            ? { x: centre - across / 2, y: along - len / 2, w: across, h: len }
            : { x: along - len / 2, y: centre - across / 2, w: len, h: across };
          this.tryAdd(kind, box, 16, -1);
          along += len + 30 + Math.floor(rng.next() * 60);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────── civic core ──
  /**
   * The map's one deliberate, always-present landmark. Everything within
   * PLAZA_RADIUS of the centre is cleared (so the spawn point can never be
   * walled in), then the square is dressed: fountain, bench ring, planters
   * and ornamental trees. The wider core block gets lawns, footpaths and
   * four corner pavilions — deliberately open ground, because this is where
   * every wave converges.
   */
  private buildCivicCore(): void {
    const rng = this.rng;
    // Enforce the civic-core invariant no matter what earlier passes did:
    // the plaza itself is swept completely clear, and the apron out to the
    // circus keeps only crushable street furniture. Without this a single
    // unlucky frontage roll could ring the spawn point with buildings.
    this.obstacles = this.obstacles.filter((o) => {
      if (o.kind === "border") return true;
      const ox = o.rect.x + o.rect.w / 2;
      const oy = o.rect.y + o.rect.h / 2;
      if (!this.insideCircus(ox, oy)) return true;
      if (Math.hypot(ox - CX, oy - CY) <= PLAZA_RADIUS) return false;
      return crushable(o);
    });
    this.rebuildGrid();

    // Paved square, lawn quadrants and the paths that cut across them.
    const R = PLAZA_RADIUS;
    this.patch("concrete", { x: CX - R, y: CY - R, w: R * 2, h: R * 2 });
    this.paths.push({ x: CX - 16, y: CY - R + 20, w: 32, h: R * 2 - 40 });
    this.paths.push({ x: CX - R + 20, y: CY - 16, w: R * 2 - 40, h: 32 });
    // Four gravel parterres in the quadrants between the paths. Deliberately
    // NOT lawn: a green wash over the paving reads as fog from above, where
    // the plaza should read as a hard civic surface.
    const q = Math.round(R * 0.5);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      this.patch("gravel", {
        x: CX + (sx < 0 ? -q - 46 : 46),
        y: CY + (sy < 0 ? -q - 46 : 46),
        w: q,
        h: q,
      });
    }

    /** Place a prop somewhere on a ring around the plaza centre. */
    const ring = (
      kind: ObstacleKind,
      w: number,
      h: number,
      minR: number,
      maxR: number,
      tries: number,
    ): boolean => {
      for (let i = 0; i < tries; i++) {
        const a2 = rng.next() * Math.PI * 2;
        const r = minR + rng.next() * (maxR - minR);
        const box: Rect = { x: CX + Math.cos(a2) * r - w / 2, y: CY + Math.sin(a2) * r - h / 2, w, h };
        if (this.tryAdd(kind, box, 14, 16)) return true;
      }
      return false;
    };

    // The fountain sits just north of the exact centre so the spawn point
    // itself always stays clear.
    this.tryAdd("monument", { x: CX - 27, y: CY - 150, w: 54, h: 54 }, 10, 20);
    // Formal ring of lamps, planters and ornamental trees.
    for (let i = 0; i < 8; i++) {
      const a2 = (i / 8) * Math.PI * 2 + 0.2;
      this.streetLamps.push({
        x: CX + Math.cos(a2) * (R - 46) - 5,
        y: CY + Math.sin(a2) * (R - 46) - 20,
      });
    }
    // Sparse rings only. The plaza is where every wave converges, so the
    // furniture must never form a closed barrier around it: each ring uses
    // few, small, crushable pieces with wide gaps, and nothing heavy is ever
    // placed on the approaches.
    for (let i = 0, n = 0; i < 12 && n < 4; i++) if (ring("bench", 52, 18, 180, 216, 4)) n++;
    for (let i = 0, n = 0; i < 12 && n < 4; i++) if (ring("planter", 46, 46, 246, 280, 4)) n++;
    for (let i = 0, n = 0; i < 14 && n < 7; i++) if (ring("tree", 46, 46, 296, 328, 4)) n++;
  }

  // ─────────────────────────────────────────────────────── safety pass ──
  /**
   * Final guarantee: nothing except traffic, roadblocks and the map fringe
   * may sit on asphalt, so what the player sees on the road is exactly what
   * they collide with there.
   */
  private enforceRoadSafety(): void {
    const kept: Obstacle[] = [];
    for (const o of this.obstacles) {
      if (ROAD_LEGAL.has(o.kind)) {
        kept.push(o);
        continue;
      }
      let onRoad = false;
      for (const r of this.roads) {
        if (
          o.rect.x < r.x + r.w &&
          o.rect.x + o.rect.w > r.x &&
          o.rect.y < r.y + r.h &&
          o.rect.y + o.rect.h > r.y
        ) {
          onRoad = true;
          break;
        }
      }
      if (!onRoad) kept.push(o);
    }
    this.obstacles = kept;
    this.rebuildGrid();
  }

  // ═════════════════════════════════════════════════════════ queries ══
  getNear(pos: Vec, radius: number): Rect[] {
    const x0 = Math.floor((pos.x - radius) / CELL);
    const x1 = Math.floor((pos.x + radius) / CELL);
    const y0 = Math.floor((pos.y - radius) / CELL);
    const y1 = Math.floor((pos.y + radius) / CELL);
    const seen = new Set<Obstacle>();
    const out: Rect[] = [];
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const list = this.grid.get(`${gx},${gy}`);
        if (!list) continue;
        for (const o of list) {
          if (seen.has(o)) continue;
          seen.add(o);
          out.push(o.rect);
        }
      }
    }
    return out;
  }

  blocked(pos: Vec, radius: number): boolean {
    for (const r of this.getNear(pos, radius)) {
      if (circleRectCollide(pos.x, pos.y, radius, r)) return true;
    }
    return false;
  }

  /**
   * Remove the nearest crushable obstacle touching the circle at `pos`.
   * Crushable = light scenery and thin barriers (trees, bushes, hydrants,
   * fences, sandbags, roadblocks…), never heavy structures. Used by the big
   * zombies that bulldoze whatever they wedge against.
   */
  tryCrushSmallObstacle(pos: Vec, radius: number): boolean {
    let best: Obstacle | null = null;
    let bestD = Infinity;
    for (const o of this.getNearObstacles(pos, radius)) {
      if (!crushable(o)) continue;
      const r = o.rect;
      const nx = Math.max(r.x, Math.min(pos.x, r.x + r.w));
      const ny = Math.max(r.y, Math.min(pos.y, r.y + r.h));
      const dx = pos.x - nx;
      const dy = pos.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 <= radius * radius && d2 < bestD) {
        bestD = d2;
        best = o;
      }
    }
    if (!best) return false;
    this.obstacles = this.obstacles.filter((o) => o !== best);
    this.rebuildGrid();
    return true;
  }

  private getNearObstacles(pos: Vec, radius: number): Obstacle[] {
    const x0 = Math.floor((pos.x - radius) / CELL);
    const x1 = Math.floor((pos.x + radius) / CELL);
    const y0 = Math.floor((pos.y - radius) / CELL);
    const y1 = Math.floor((pos.y + radius) / CELL);
    const seen = new Set<Obstacle>();
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const list = this.grid.get(`${gx},${gy}`);
        if (!list) continue;
        for (const o of list) seen.add(o);
      }
    }
    return [...seen];
  }

  randomFreePoint(
    rng: Rng,
    minDist = 0,
    maxDist = 0,
    awayFrom: Vec | null = null,
    radius = 24,
    tries = 80,
  ): Vec | null {
    for (let i = 0; i < tries; i++) {
      const p: Vec = {
        x: 80 + rng.next() * (WORLD_WIDTH - 160),
        y: 80 + rng.next() * (WORLD_HEIGHT - 160),
      };
      if (this.blocked(p, radius)) continue;
      if (awayFrom && minDist > 0) {
        const d = Math.hypot(p.x - awayFrom.x, p.y - awayFrom.y);
        if (d < minDist || (maxDist > 0 && d > maxDist)) continue;
      }
      return p;
    }
    return null;
  }

  /** District the given world point belongs to (HUD / debug readouts). */
  districtAt(x: number, y: number): District {
    return districtAt(x, y);
  }

  // ═════════════════════════════════════════════════════════ drawing ══
  drawGround(ctx: CanvasRenderingContext2D, cam: Camera, w?: number, h?: number): void {
    const vw = w ?? cam.viewW;
    const vh = h ?? cam.viewH;
    const view = cam.viewRect();

    // 1. Terrain.
    const xStart = Math.floor(view.x / TILE) * TILE;
    const yStart = Math.floor(view.y / TILE) * TILE;
    for (let wy = yStart; wy < view.y + view.h + TILE; wy += TILE) {
      for (let wx = xStart; wx < view.x + view.w + TILE; wx += TILE) {
        drawTerrainTile(ctx, wx - cam.renderOffset.x, wy - cam.renderOffset.y, wx, wy, this.seed);
      }
    }

    // 2. Large surface patches, then blast craters on top of them.
    for (const p of this.patches) {
      if (!rectsIntersect(view, p.rect)) continue;
      const s = applyRect(cam, p.rect);
      drawSurfacePatch(ctx, s.x, s.y, s.w, s.h, p.rect.x, p.rect.y, p.kind, this.seed);
    }
    for (const c of this.craters) {
      if (c.x + c.r < view.x || c.x - c.r > view.x + view.w) continue;
      if (c.y + c.r < view.y || c.y - c.r > view.y + view.h) continue;
      const s = cam.apply({ x: c.x, y: c.y });
      drawCrater(ctx, s.x, s.y, c.r, this.seed, c.x, c.y);
    }

    // 3. Footpaths and the freight line.
    for (const p of this.paths) {
      if (!rectsIntersect(view, p)) continue;
      const s = applyRect(cam, p);
      drawPathSegment(ctx, s.x, s.y, s.w, s.h, p.x, p.y, this.seed);
    }
    for (const r of this.rails) {
      if (!rectsIntersect(view, r)) continue;
      const s = applyRect(cam, r);
      drawRailSegment(ctx, s.x, s.y, s.w, s.h, r.h > r.w, r.x, r.y, this.seed);
    }

    // 4. Sidewalks below the asphalt so the kerb tucks under the road edge.
    for (const slab of this.slabs) {
      for (const band of sideBands(slab)) {
        if (!rectsIntersect(view, band)) continue;
        const s = applyRect(cam, band);
        drawSidewalkBand(ctx, s.x, s.y, s.w, s.h, band.x, band.y, slab.vertical, this.seed);
      }
    }

    // 5. Asphalt. Narrow roads first so the wide avenues paint over their
    //    junctions and the markings stay continuous along the main routes.
    const byWidth = [...this.slabs].sort((a, b) => rank(a.cls) - rank(b.cls));
    for (const slab of byWidth) {
      if (!rectsIntersect(view, slab.rect)) continue;
      const s = applyRect(cam, slab.rect);
      drawRoadSlab(ctx, s.x, s.y, s.w, s.h, slab.vertical, slab.rect.x, slab.rect.y, slab.cls, this.seed);
    }

    // 6. Junction paint.
    for (const j of this.junctions) {
      if (!rectsIntersect(view, j.overlap)) continue;
      const o = applyRect(cam, j.overlap);
      const v = applyRect(cam, j.v.rect);
      const hr = applyRect(cam, j.h.rect);
      drawJunctionPaint(ctx, o.x, o.y, o.w, o.h, v.x, v.w, hr.y, hr.h, j.zebra);
    }

    // 7. Litter.
    this.drawScatterDecals(ctx, cam, vw, vh);
  }

  /** Sparse district-flavoured litter strewn over open ground. */
  private drawScatterDecals(ctx: CanvasRenderingContext2D, cam: Camera, vw: number, vh: number): void {
    const view = cam.viewRect();
    const cell = 220;
    const x0 = Math.floor(view.x / cell);
    const x1 = Math.floor((view.x + view.w) / cell);
    const y0 = Math.floor(view.y / cell);
    const y1 = Math.floor((view.y + view.h) / cell);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const h = worldHash(this.seed + 401, gx, gy);
        if (h % 5 > 2) continue;
        const cx = gx * cell + 24 + ((h >> 5) % (cell - 48));
        const cy = gy * cell + 24 + ((h >> 9) % (cell - 48));
        if (this.blocked({ x: cx, y: cy }, 18)) continue;
        const sp = cam.apply({ x: cx, y: cy });
        if (sp.x < -40 || sp.x > vw + 40 || sp.y < -40 || sp.y > vh + 40) continue;
        drawGroundDecal(ctx, Math.round(sp.x), Math.round(sp.y), this.seed, h, districtAt(cx, cy));
      }
    }
  }

  /**
   * @param windowLights When true, structures whose deterministic world seed
   *   puts them in the ~70% lit group render illuminated windows; when false
   *   every window renders dark (WINDOW LIGHTS setting = OFF).
   */
  drawObstacles(ctx: CanvasRenderingContext2D, cam: Camera, windowLights = false): void {
    const view = cam.viewRect();
    const x0 = Math.floor(view.x / CELL);
    const x1 = Math.floor((view.x + view.w) / CELL);
    const y0 = Math.floor(view.y / CELL);
    const y1 = Math.floor((view.y + view.h) / CELL);
    const drawn = new Set<Obstacle>();
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const list = this.grid.get(`${gx},${gy}`);
        if (!list) continue;
        for (const o of list) {
          if (drawn.has(o)) continue;
          drawn.add(o);
          if (!rectsIntersect(view, o.rect)) continue;
          this.drawObstacle(ctx, cam, o.rect, o.kind, windowLights);
        }
      }
    }
    for (const lamp of this.streetLamps) {
      if (lamp.x < view.x - 40 || lamp.x > view.x + view.w + 40) continue;
      if (lamp.y < view.y - 40 || lamp.y > view.y + view.h + 40) continue;
      const sp = cam.apply(lamp);
      drawStreetLamp(ctx, sp.x, sp.y);
    }
  }

  private drawObstacle(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    rect: Rect,
    kind: ObstacleKind,
    windowLights: boolean,
  ): void {
    const sr = applyRect(cam, rect);
    // Structures share a palette across a whole neighbourhood; smaller props
    // mix in a per-prop hash so a street never repeats the same object.
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const d = districtAt(cx, cy);
    const zone = worldHash(this.seed + 811, Math.floor(cx / 900), Math.floor(cy / 900));
    const perProp = worldHash(this.seed + 823, rect.x, rect.y);
    const structure = kind === "building" || kind === "house" || kind === "tower" || kind === "warehouse";
    const styleVariant = structure ? (zone + DISTRICT_STYLE[d]) % 8 : (zone + perProp) % 8;
    const lit = windowLights && windowLightSeed(rect.x, rect.y) >= 30;
    drawPropSprite(ctx, kind, sr.x, sr.y, sr.w, sr.h, lit, styleVariant, rect.x, rect.y);
  }

  // ═════════════════════════════════════════════════════════ minimap ══
  private buildMinimap(): HTMLCanvasElement {
    const scale = MINIMAP_SIZE / WORLD_WIDTH;
    const canvas = document.createElement("canvas");
    canvas.width = MINIMAP_SIZE;
    canvas.height = MINIMAP_SIZE;
    const ctx = canvas.getContext("2d")!;

    // District ground so the minimap reads as a real city plan.
    const step = 4;
    for (let y = 0; y < MINIMAP_SIZE; y += step) {
      for (let x = 0; x < MINIMAP_SIZE; x += step) {
        const d = districtAt((x / scale) + step / 2, (y / scale) + step / 2);
        ctx.fillStyle = GROUND[d].minimap;
        ctx.fillRect(x, y, step, step);
      }
    }
    // Water first — it reads as a landmark even at 160px.
    ctx.fillStyle = "#24484C";
    for (const o of this.obstacles) {
      if (o.kind !== "pond") continue;
      ctx.fillRect(o.rect.x * scale, o.rect.y * scale, o.rect.w * scale, o.rect.h * scale);
    }
    // Rail line.
    ctx.fillStyle = "#4A4436";
    for (const r of this.rails) ctx.fillRect(r.x * scale, r.y * scale, r.w * scale, Math.max(1, r.h * scale));
    // Roads, widest last so the avenues stay legible.
    for (const s of [...this.slabs].sort((a, b) => rank(a.cls) - rank(b.cls))) {
      ctx.fillStyle = s.cls === "avenue" ? "#4A4B50" : s.cls === "belt" ? "#414248" : "#35363B";
      ctx.fillRect(
        s.rect.x * scale,
        s.rect.y * scale,
        Math.max(1.5, s.rect.w * scale),
        Math.max(1.5, s.rect.h * scale),
      );
    }
    for (const o of this.obstacles) {
      const c = MINIMAP_COLOR[o.kind];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(
        o.rect.x * scale,
        o.rect.y * scale,
        Math.max(1, o.rect.w * scale),
        Math.max(1, o.rect.h * scale),
      );
    }
    // Plaza marker at the spawn crossroads.
    ctx.strokeStyle = "#E8C468";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(CX * scale, CY * scale, PLAZA_RADIUS * scale, 0, Math.PI * 2);
    ctx.stroke();
    return canvas;
  }
}

// ═══════════════════════════════════════════════════════════ helpers ══

/** Road importance — used for draw order and frontage priority. */
function rank(c: RoadClass): number {
  return { avenue: 5, belt: 4, arterial: 3, outer: 2, link: 1 }[c];
}

/** Structure palettes are offset per district so zones read differently. */
const DISTRICT_STYLE: Record<District, number> = {
  core: 0,
  downtown: 1,
  industrial: 2,
  suburb: 3,
  park: 4,
  ruins: 5,
};

const MINIMAP_COLOR: Partial<Record<ObstacleKind, string>> = {
  tower: "#6E6A82",
  building: "#5A5666",
  warehouse: "#5E5A48",
  house: "#7A6248",
  container: "#357E80",
  silo: "#8B8778",
  tank: "#436063",
  watchtower: "#8A7A46",
  tent: "#5A6048",
  gazebo: "#5A3A2C",
  monument: "#E8C468",
  tree: "#204826",
  bush: "#1C3A20",
  rubble: "#6E6254",
  wreck: "#4A382C",
  bus: "#B08934",
  border: "#22231F",
  pylon: "#575D5A",
};

/** Light scenery and thin barriers that a big zombie can simply bulldoze. */
const CRUSH_HEAVY: ReadonlySet<ObstacleKind> = new Set<ObstacleKind>([
  "building",
  "tower",
  "warehouse",
  "house",
  "container",
  "silo",
  "tank",
  "pond",
  "watchtower",
  "gazebo",
  "bus",
  "van",
  "wreck",
  "border",
  "car_red",
  "car_blue",
  "car_yellow",
  "car_police",
]);

function crushable(o: Obstacle): boolean {
  if (CRUSH_HEAVY.has(o.kind)) return false;
  const r = o.rect;
  return (r.w <= 64 && r.h <= 64) || Math.min(r.w, r.h) <= 28;
}

const VEHICLE_COLORS: ReadonlyArray<ObstacleKind> = ["car_red", "car_blue", "car_yellow"];

function pickVehicle(rng: Rng, d: District): ObstacleKind {
  const roll = rng.next();
  if (d === "ruins") {
    if (roll < 0.5) return "wreck";
    if (roll < 0.62) return "bus";
    if (roll < 0.74) return "van";
    return VEHICLE_COLORS[Math.floor(rng.next() * 3)]!;
  }
  if (d === "industrial") {
    if (roll < 0.42) return "van";
    if (roll < 0.56) return "bus";
    if (roll < 0.68) return "wreck";
    return VEHICLE_COLORS[Math.floor(rng.next() * 3)]!;
  }
  if (roll < 0.6) return VEHICLE_COLORS[Math.floor(rng.next() * 3)]!;
  if (roll < 0.72) return "car_police";
  if (roll < 0.84) return "van";
  if (roll < 0.92) return "wreck";
  return "bus";
}

/** The two sidewalk bands flanking a road slab. */
function sideBands(s: RoadSlab): Rect[] {
  const r = s.rect;
  if (s.vertical) {
    return [
      { x: r.x - SIDEWALK, y: r.y, w: SIDEWALK, h: r.h },
      { x: r.x + r.w, y: r.y, w: SIDEWALK, h: r.h },
    ];
  }
  return [
    { x: r.x, y: r.y - SIDEWALK, w: r.w, h: SIDEWALK },
    { x: r.x, y: r.y + r.h, w: r.w, h: SIDEWALK },
  ];
}

function applyRect(cam: Camera, r: Rect): Rect {
  return { x: r.x - cam.renderOffset.x, y: r.y - cam.renderOffset.y, w: r.w, h: r.h };
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
