// src/game/map.ts
// Procedural abandoned-town map. A near-grid of roads carves the world into
// blocks; buildings, houses, shops and ruins line the streets (with alleys
// between them), vehicles are parked / wrecked along the curbs, and the open
// blocks become yards, lots, parking and overgrowth. Everything that blocks
// movement is an Obstacle with a rect registered in a spatial grid, and every
// obstacle renders from that same rect — visuals and collision can never
// drift apart.

import {
  MAP_SEED,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  MINIMAP_SIZE,
} from "./settings";
import { circleRectCollide, type Rect } from "./collision";
import { mulberry32, type Rng } from "../lib/rng";
import type { Vec } from "./vec";
import type { Camera } from "./camera";
import {
  TILE_SIZE,
  drawGroundDecal,
  drawGroundTile,
  drawRoadDetails,
  drawStreetLamp,
  drawTileZone,
  pixelVariant,
  worldHash,
} from "./pixelArt";
import { drawPropSprite, type PropKind } from "./propArt";

export const CELL = 400;
export const ROAD_WIDTH = 140;
export const SIDEWALK = 26;

/**
 * Deterministic window-light seed for the obstacle whose world-space origin
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

interface RoadCrossing {
  v: Rect; // vertical road
  h: Rect; // horizontal road
  overlap: Rect;
}

export class GameMap {
  seed: number;
  rng: Rng;
  roads: Rect[] = [];
  crossings: RoadCrossing[] = [];
  streetLamps: Vec[] = [];
  obstacles: Obstacle[] = [];
  minimap: HTMLCanvasElement | null = null;
  private grid: Map<string, Obstacle[]> = new Map();

  constructor(seed: number = MAP_SEED) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.generate();
    this.minimap = this.buildMinimap();
  }

  // --------------------------------------------------------- generation --
  private add(kind: ObstacleKind, rect: Rect): void {
    const o: Obstacle = { rect, kind };
    this.obstacles.push(o);
    const x0 = Math.floor(rect.x / CELL);
    const x1 = Math.floor((rect.x + rect.w) / CELL);
    const y0 = Math.floor(rect.y / CELL);
    const y1 = Math.floor((rect.y + rect.h) / CELL);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const key = `${gx},${gy}`;
        const list = this.grid.get(key);
        if (list) list.push(o);
        else this.grid.set(key, [o]);
      }
    }
  }

  /** Rebuild the spatial grid from scratch (used after any late pruning). */
  private rebuildGrid(): void {
    this.grid.clear();
    for (const o of this.obstacles) {
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
  }

  private overlaps(rect: Rect, pad: number): boolean {
    const test = {
      x: rect.x - pad,
      y: rect.y - pad,
      w: rect.w + pad * 2,
      h: rect.h + pad * 2,
    };
    for (const o of this.obstacles) {
      if (
        test.x < o.rect.x + o.rect.w &&
        test.x + test.w > o.rect.x &&
        test.y < o.rect.y + o.rect.h &&
        test.y + test.h > o.rect.y
      ) {
        return true;
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

  private generate(): void {
    const rng = this.rng;
    const w = WORLD_WIDTH;
    const h = WORLD_HEIGHT;
    const t = 60;

    // Border fringe.
    this.add("border", { x: -t, y: -t, w: w + 2 * t, h: t });
    this.add("border", { x: -t, y: h, w: w + 2 * t, h: t });
    this.add("border", { x: -t, y: 0, w: t, h });
    this.add("border", { x: w, y: 0, w: t, h });

    // Roads: a 3+3 full-length grid whose centre-lines cross exactly at the
    // map centre — the player spawns on that crossroads, in the heart of
    // town (never the random near-duplicate lanes the old generator made).
    const xs = pickAxis(rng, w).sort((a, b) => a - b);
    const ys = pickAxis(rng, h).sort((a, b) => a - b);
    const rw = ROAD_WIDTH;
    for (const x of xs) this.roads.push({ x: x - rw / 2, y: 0, w: rw, h });
    for (const y of ys) this.roads.push({ x: 0, y: y - rw / 2, w, h: rw });
    for (const road of this.roads) {
      const vertical = road.w < road.h;
      const start = vertical ? road.y + 160 : road.x + 160;
      const end = vertical ? road.y + road.h - 140 : road.x + road.w - 140;
      // Lamps live on the sidewalk (outside the road edge), never mid-street.
      const perpendicular = vertical ? ys : xs;
      for (let along = start; along < end; along += 300) {
        const nearCrossing = perpendicular.some((c) => Math.abs(c - along) < 330);
        if (nearCrossing) continue;
        const lampSide = rng.next() < 0.5 ? -1 : 1;
        this.streetLamps.push(
          vertical
            ? { x: road.x + road.w + (lampSide < 0 ? 6 : SIDEWALK - 6), y: along }
            : { x: along, y: road.y + road.h + (lampSide < 0 ? 6 : SIDEWALK - 6) },
        );
      }
    }

    // Crossing records (zebra + intersection handling).
    for (let i = 0; i < this.roads.length; i++) {
      for (let j = i + 1; j < this.roads.length; j++) {
        const a = this.roads[i]!;
        const b = this.roads[j]!;
        const aVert = a.w < a.h;
        const bVert = b.w < b.h;
        if (aVert === bVert) continue;
        const v = aVert ? a : b;
        const hRoad = aVert ? b : a;
        const ox = Math.max(v.x, hRoad.x);
        const oy = Math.max(v.y, hRoad.y);
        const ow = Math.min(v.x + v.w, hRoad.x + hRoad.w) - ox;
        const oh = Math.min(v.y + v.h, hRoad.y + hRoad.h) - oy;
        if (ow > 0 && oh > 0) {
          this.crossings.push({ v, h: hRoad, overlap: { x: ox, y: oy, w: ow, h: oh } });
        }
      }
    }

    // ── Buildings, houses and shopfronts line the streets ────────────────
    // Each road side is split into blocks by the perpendicular crossings.
    // A developed block becomes a compact streetfront row (buildings with a
    // few gaps that read as alleys / driveways); undeveloped blocks stay open
    // as yards, parking and empty lots so the horde always has routes.
    const buildingCap = 30;
    const houseCap = 20;
    let buildings = 0;
    let houses = 0;
    const verticalStrips = openSegments(ys, h);
    const horizontalStrips = openSegments(xs, w);
    // Alternate axes while developing frontages so one direction never
    // consumes all the structures.
    const vRoads: Rect[] = [];
    const hRoads: Rect[] = [];
    for (const rd of this.roads) (rd.w < rd.h ? vRoads : hRoads).push(rd);
    const axisOrder: Rect[] = [];
    const maxLen = Math.max(vRoads.length, hRoads.length);
    for (let ai = 0; ai < maxLen; ai++) {
      if (ai < vRoads.length) axisOrder.push(vRoads[ai]!);
      if (ai < hRoads.length) axisOrder.push(hRoads[ai]!);
    }

    const capacityLeft = (): boolean => buildings < buildingCap || houses < houseCap;
    for (let ri = 0; ri < axisOrder.length && capacityLeft(); ri++) {
      const road = axisOrder[ri]!;
      const vertical = road.w < road.h;
      const strips = vertical ? verticalStrips : horizontalStrips;
      for (const side of [-1, 1] as const) {
        for (let s = 0; s < strips.length && capacityLeft(); s++) {
          const [segA, segB] = strips[s]!;
          const len = segB - segA;
          if (len < 200) continue;
          // ~55% of streetfronts are built up; the rest stay open (yards,
          // parking or empty lots), which keeps alleys and escape routes.
          if (rng.next() > 0.55) continue;
          const inset = randInt(rng, 46, 92);
          let cur = segA + 26;
          let guard = 0;
          while (cur < segB - 80 && guard < 10 && capacityLeft()) {
            guard++;
            const roll = rng.next();
            // ~18% of a block frontage stays a gap (alley, drive, empty lot).
            if (roll < 0.18) {
              cur += randInt(rng, 90, 220);
              continue;
            }
            let isHouse = roll > 0.6;
            if (isHouse && houses >= houseCap && buildings < buildingCap) isHouse = false;
            else if (!isHouse && buildings >= buildingCap && houses < houseCap) isHouse = true;
            if ((isHouse && houses >= houseCap) || (!isHouse && buildings >= buildingCap)) break;
            const alongLen = isHouse
              ? randInt(rng, 120, 190)
              : randInt(rng, 170, 320);
            const depth = isHouse ? randInt(rng, 130, 200) : randInt(rng, 190, 330);
            if (cur + alongLen > segB - 40) break;
            const sideCoord = vertical
              ? road.x + (side < 0 ? -(inset + depth) : road.w + inset)
              : road.y + (side < 0 ? -(inset + depth) : road.h + inset);
            const rect: Rect = vertical
              ? { x: sideCoord, y: cur, w: depth, h: alongLen }
              : { x: cur, y: sideCoord, w: alongLen, h: depth };
            if (rect.x >= t + 8 && rect.y >= t + 8 && rect.x + rect.w <= w - t - 8 && rect.y + rect.h <= h - t - 8) {
              if (!this.overlaps(rect, 40) && !this.touchesRoad(rect, 10)) {
                this.add(isHouse ? "house" : "building", rect);
                if (isHouse) houses++;
                else buildings++;
                cur += alongLen + randInt(rng, 70, 150);
                continue;
              }
            }
            cur += randInt(rng, 80, 180);
          }
        }
      }
    }

    // ── Parked / abandoned vehicles along every street ──────────────────
    for (let ri = 0; ri < axisOrder.length; ri++) {
      const road = axisOrder[ri]!;
      const vertical = road.w < road.h;
      const strips = vertical ? verticalStrips : horizontalStrips;
      for (let s = 0; s < strips.length; s++) {
        const [segA, segB] = strips[s]!;
        const len = segB - segA;
        if (len < 240) continue;
        if (rng.next() > 0.55) continue; // not every curb is a parking row
        const side = rng.next() < 0.5 ? -1 : 1;
        const count = 1 + (rng.next() < 0.4 ? 1 : 0) + (len > 700 && rng.next() < 0.5 ? 1 : 0);
        let along = segA + 60;
        for (let ci = 0; ci < count && along < segB - 60; ci++) {
          const kindRoll = rng.next();
          let kind: ObstacleKind = "car_red";
          const colors: ObstacleKind[] = ["car_red", "car_blue", "car_yellow"];
          if (kindRoll < 0.66) kind = colors[Math.floor(rng.next() * 3)]!;
          else if (kindRoll < 0.75) kind = "car_police";
          else if (kindRoll < 0.88) kind = "van";
          else if (kindRoll < 0.94) kind = "wreck";
          else kind = "bus";
          const length =
            kind === "bus" ? randInt(rng, 220, 260) : kind === "van" ? randInt(rng, 150, 175) : randInt(rng, 84, 104);
          const across = kind === "bus" ? randInt(rng, 58, 66) : kind === "van" ? randInt(rng, 50, 56) : randInt(rng, 42, 48);
          // Curb lane: offset so at least one lane stays fully drivable.
          const halfAcross = across / 2 + 6;
          const center =
            vertical
              ? road.x + (side < 0 ? halfAcross : road.w - halfAcross)
              : road.y + (side < 0 ? halfAcross : road.h - halfAcross);
          const rect: Rect = vertical
            ? { x: center - across / 2, y: along - length / 2, w: across, h: length }
            : { x: along - length / 2, y: center - across / 2, w: length, h: across };
          if (rect.x > t && rect.y > t && rect.x + rect.w < w - t && rect.y + rect.h < h - t) {
            if (!this.overlaps(rect, 14)) {
              this.add(kind, rect);
            }
          }
          along += length + randInt(rng, 26, 70);
        }
      }
    }

    // ── Industrial / ruined landmarks: containers, crates, roadblocks ───
    // Containers only ever sit OFF the road: roadside loading stacks on the
    // curb side of the street (never blocking a lane or an intersection).
    let containers = 0;
    for (let ci = 0; ci < 14 && containers < 7; ci++) {
      const road = rng.pick(this.roads);
      const vertical = road.w < road.h;
      const strips = vertical ? verticalStrips : horizontalStrips;
      const strip = strips[Math.floor(rng.next() * strips.length)]!;
      const segLen = strip[1] - strip[0];
      if (segLen < 300) continue;
      const side = rng.next() < 0.5 ? -1 : 1;
      const parallel = randInt(rng, 150, 240); // length along the road
      const across = 70;
      const along = strip[0] + 90 + rng.next() * Math.max(10, segLen - parallel - 180);
      const gap = 52; // container edge -> road edge (curb + sidewalk zone)
      const crossCenter = vertical
        ? road.x + (side < 0 ? -(across / 2 + gap) : road.w + across / 2 + gap)
        : road.y + (side < 0 ? -(across / 2 + gap) : road.h + across / 2 + gap);
      const rect: Rect = vertical
        ? { x: crossCenter - across / 2, y: along, w: across, h: parallel }
        : { x: along, y: crossCenter - across / 2, w: parallel, h: across };
      if (rect.x < t + 10 || rect.y < t + 10) continue;
      if (rect.x + rect.w > w - t - 10 || rect.y + rect.h > h - t - 10) continue;
      if (this.overlaps(rect, 26) || this.touchesRoad(rect, 14)) continue;
      this.add("container", rect);
      containers++;
    }
    // Roadblock chevrons close one approach lane at a few intersections.
    let barricades = 0;
    for (const c of this.crossings) {
      if (barricades >= 6 || rng.next() > 0.5) continue;
      const vertical = c.v.w < c.v.h;
      const arm = rng.next() < 0.5 ? -1 : 1;
      const oC = vertical ? c.overlap.y : c.overlap.x;
      const oSpan = vertical ? c.v.h : c.v.w;
      const pos = Math.max(120, Math.min(oSpan - 120, oC + arm * randInt(rng, 170, 260)));
      const rect: Rect = vertical
        ? { x: c.v.x + 8, y: pos - 9, w: c.v.w - 16, h: 18 }
        : { x: pos - 9, y: c.v.y + 8, w: 18, h: c.v.h - 16 };
      if (!this.overlaps(rect, 8)) {
        this.add("barricade", rect);
        barricades++;
      }
    }
    for (let i = 0; i < 8 && barricades < 12; i++) {
      // Alleys: block a few gaps between structures with light barriers.
      const horiz = rng.next() < 0.5;
      const size = horiz ? { w: 80, h: 16 } : { w: 16, h: 80 };
      const rect: Rect = {
        x: randInt(rng, t + 40, w - t - 40 - size.w),
        y: randInt(rng, t + 40, h - t - 40 - size.h),
        w: size.w,
        h: size.h,
      };
      if (!this.overlaps(rect, 12) && !this.touchesRoad(rect, 30)) {
        this.add("barricade", rect);
        barricades++;
      }
    }

    // Ruins: rubble piles against a few (fire-ruined or not) façades + a few
    // standalone wreck mounds in open blocks — reads as collapsed buildings.
    const ruinTargets = this.obstacles.filter((o) => o.kind === "building" || o.kind === "house");
    let rubble = 0;
    for (let i = 0; i < ruinTargets.length && rubble < 9; i++) {
      const s = ruinTargets[i]!;
      const hh = worldHash(this.seed + 77, s.rect.x, s.rect.y);
      if (hh % 3 !== 0) continue;
      const edge = (hh >> 2) % 4;
      const gap = 6;
      const rw2 = randInt(rng, 46, 90);
      const rh2 = randInt(rng, 34, 70);
      const p: Rect =
        edge === 0
          ? { x: s.rect.x + randInt(rng, 0, Math.max(6, s.rect.w - rw2)), y: s.rect.y - rh2 - gap, w: rw2, h: rh2 }
          : edge === 1
            ? { x: s.rect.x + s.rect.w + gap, y: s.rect.y + randInt(rng, 0, Math.max(6, s.rect.h - rh2)), w: rw2, h: rh2 }
            : edge === 2
              ? { x: s.rect.x + randInt(rng, 0, Math.max(6, s.rect.w - rw2)), y: s.rect.y + s.rect.h + gap, w: rw2, h: rh2 }
              : { x: s.rect.x - rw2 - gap, y: s.rect.y + randInt(rng, 0, Math.max(6, s.rect.h - rh2)), w: rw2, h: rh2 };
      if (p.x > t && p.y > t && p.x + p.w < w - t && p.y + p.h < h - t) {
        if (!this.overlaps(p, 8)) {
          this.add("rubble", p);
          rubble++;
        }
      }
    }

    // Supply crates cluster NEXT TO containers / roadblocks / vehicles
    // (loading drops + abandoned aid), always adjacent — never on top — and
    // never touching asphalt.
    const crateAnchors = this.obstacles.filter(
      (o) => o.kind === "container" || o.kind === "barricade" || o.kind === "bus" || o.kind === "wreck",
    );
    const crateSize = 42;
    let crates = 0;
    let attempts = 0;
    while (crates < 12 && attempts < 160 && crateAnchors.length > 0) {
      attempts++;
      const a = rng.pick(crateAnchors);
      // Four candidate spots around the anchor perimeter.
      const candidates: Array<[number, number]> = [
        [a.rect.x + a.rect.w / 2 - crateSize / 2, a.rect.y - crateSize - 6],
        [a.rect.x + a.rect.w / 2 - crateSize / 2, a.rect.y + a.rect.h + 6],
        [a.rect.x - crateSize - 6, a.rect.y + a.rect.h / 2 - crateSize / 2],
        [a.rect.x + a.rect.w + 6, a.rect.y + a.rect.h / 2 - crateSize / 2],
      ];
      const cand = candidates[Math.floor(rng.next() * candidates.length)]!;
      const box: Rect = { x: cand[0], y: cand[1], w: crateSize, h: crateSize };
      if (box.x < t + 8 || box.y < t + 8 || box.x + crateSize > w - t - 8 || box.y + crateSize > h - t - 8) continue;
      if (this.overlaps(box, 8) || this.touchesRoad(box, 10)) continue;
      this.add("crate", box);
      crates++;
    }
    for (let i = 0; i < 10 && crates < 16; i++) {
      const box: Rect = {
        x: randInt(rng, t + 30, w - t - 72),
        y: randInt(rng, t + 30, h - t - 72),
        w: randInt(rng, 36, 48),
        h: randInt(rng, 36, 48),
      };
      if (!this.overlaps(box, 16) && !this.touchesRoad(box, 12)) {
        this.add("crate", box);
        crates++;
      }
    }

    // Street furniture on sidewalks next to structures & block corners.
    // Multiple retries so nothing is ever dropped onto an existing object.
    const structuresForProps = this.obstacles.filter(
      (o) => o.kind === "building" || o.kind === "house" || o.kind === "container",
    );
    let propsDone = 0;
    let propTries = 0;
    while (propsDone < 14 && propTries < 120 && structuresForProps.length > 0) {
      propTries++;
      const s = rng.pick(structuresForProps);
      const side = rng.next() < 0.5 ? 0 : 1;
      const edge = rng.next() < 0.5 ? -1 : 1;
      const gap = 34;
      let cx: number;
      let cy: number;
      if (side === 0) {
        cx = s.rect.x + s.rect.w / 2 + edge * randInt(rng, 0, Math.max(10, s.rect.w / 2 - 70));
        cy = edge < 0 ? s.rect.y - gap : s.rect.y + s.rect.h + gap;
      } else {
        cx = edge < 0 ? s.rect.x - gap : s.rect.x + s.rect.w + gap;
        cy = s.rect.y + s.rect.h / 2 + edge * randInt(rng, 0, Math.max(10, s.rect.h / 2 - 70));
      }
      const kindRoll = rng.next();
      let kind: ObstacleKind = "hydrant";
      let size = { w: 18, h: 24 };
      if (kindRoll < 0.3) {
        kind = "hydrant";
      } else if (kindRoll < 0.55) {
        kind = "dumpster";
        size = { w: 30, h: 44 };
      } else if (kindRoll < 0.75) {
        kind = "mailbox";
        size = { w: 14, h: 22 };
      } else if (kindRoll < 0.9) {
        kind = "bench";
        size = { w: 46, h: 16 };
      } else {
        kind = "cart";
        size = { w: 30, h: 22 };
      }
      const box: Rect = { x: cx - size.w / 2, y: cy - size.h / 2, w: size.w, h: size.h };
      if (box.x < t + 4 || box.y < t + 4 || box.x + box.w > w - t - 4 || box.y + box.h > h - t - 4) continue;
      if (this.overlaps(box, 12) || this.touchesRoad(box, 16)) continue;
      this.add(kind, box);
      propsDone++;
    }

    // ── Greenery: street trees along curbs, groves + overgrowth in blocks ─
    let trees = 0;
    let tries = 0;
    while (trees < 54 && tries < 500) {
      tries++;
      const radius = randInt(rng, 17, 26);
      const cx = randInt(rng, t + radius + 20, w - t - radius - 20);
      const cy = randInt(rng, t + radius + 20, h - t - radius - 20);
      const box: Rect = { x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 };
      if (this.overlaps(box, 8) || this.touchesRoad(box, 12)) continue;
      this.add("tree", box);
      trees++;
      // Small grove: 2-3 more nearby.
      const grove = randInt(rng, 0, 2);
      for (let g = 0; g < grove && trees < 54; g++) {
        const r2 = randInt(rng, 15, 22);
        const gx = cx + randInt(rng, -70, 70);
        const gy = cy + randInt(rng, -70, 70);
        const gb: Rect = { x: gx - r2, y: gy - r2, w: r2 * 2, h: r2 * 2 };
        if (gb.x > t && gb.y > t && gb.x + gb.w < w - t && gb.y + gb.h < h - t) {
          if (!this.overlaps(gb, 6) && !this.touchesRoad(gb, 10)) {
            this.add("tree", gb);
            trees++;
          }
        }
      }
    }
    let bushes = 0;
    tries = 0;
    while (bushes < 26 && tries < 260) {
      tries++;
      const radius = randInt(rng, 11, 17);
      const cx = randInt(rng, t + radius, w - t - radius);
      const cy = randInt(rng, t + radius, h - t - radius);
      const box: Rect = { x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 };
      if (this.overlaps(box, 6) || this.touchesRoad(box, 10)) continue;
      this.add("bush", box);
      bushes++;
    }

    // Barrels clustered beside containers (loading-zone reads).
    const containers2 = this.obstacles.filter((o) => o.kind === "container");
    for (const cont of containers2) {
      const n = randInt(rng, 0, 3);
      const longSide = cont.rect.w > cont.rect.h;
      for (let k = 0; k < n; k++) {
        const side = rng.next() < 0.5 ? -1 : 1;
        const bx = longSide
          ? cont.rect.x + cont.rect.w / 2 + side * (cont.rect.w / 2 + 26)
          : cont.rect.x + cont.rect.w / 2 + side * randInt(rng, 0, 28);
        const by = longSide
          ? cont.rect.y + cont.rect.h / 2 + side * randInt(rng, 0, 28)
          : cont.rect.y + cont.rect.h / 2 + side * (cont.rect.h / 2 + 26);
        const box: Rect = { x: bx - 12, y: by - 16, w: 24, h: 32 };
        if (box.x > t && box.y > t && box.x + box.w < w - t && box.y + box.h < h - t) {
          if (!this.overlaps(box, 6) && !this.touchesRoad(box, 8)) this.add("barrel", box);
        }
      }
    }

    // A handful of overgrown patches (dead trees) in the open blocks.
    let dead = 0;
    tries = 0;
    while (dead < 8 && tries < 120) {
      tries++;
      const radius = randInt(rng, 16, 24);
      const cx = randInt(rng, t + radius, w - t - radius);
      const cy = randInt(rng, t + radius, h - t - radius);
      const box: Rect = { x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 };
      if (this.overlaps(box, 6) || this.touchesRoad(box, 14)) continue;
      this.add("tree", box); // drawn as a dead tree via style variant later
      dead++;
    }

    // ── Safety net ──────────────────────────────────────────────────────
    // Guarantee nothing except vehicles, roadblocks and the border ever sits
    // on a road slab, so visuals and collision always stay honest.
    const roadOk = new Set<ObstacleKind>([
      "car_red",
      "car_blue",
      "car_yellow",
      "car_police",
      "van",
      "bus",
      "wreck",
      "barricade",
      "border",
    ]);
    const kept: Obstacle[] = [];
    for (const o of this.obstacles) {
      if (roadOk.has(o.kind)) {
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

  // ------------------------------------------------------------ queries --
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
   * Remove the nearest crushable obstacle that touches the circle at `pos`.
   * Crushable = light scenery + road barricades: small props (trees, bushes,
   * hydrants, mailboxes, crates…) and thin barriers (police barricades), but
   * never heavy structures (buildings, houses, containers, vehicles, ruins,
   * borders). Used by big zombies that bulldoze what they wedge against.
   */
  tryCrushSmallObstacle(pos: Vec, radius: number): boolean {
    const HEAVY: ReadonlySet<ObstacleKind> = new Set([
      "building",
      "house",
      "container",
      "bus",
      "van",
      "wreck",
      "border",
      "car_red",
      "car_blue",
      "car_yellow",
      "car_police",
    ]);
    const crushable = (o: Obstacle): boolean => {
      if (HEAVY.has(o.kind)) return false;
      const r = o.rect;
      const small = r.w <= 64 && r.h <= 64; // props, crates
      const thin = Math.min(r.w, r.h) <= 26; // road barricades / kerbs
      return small || thin;
    };
    let best: Obstacle | null = null;
    let bestD = Infinity;
    for (const o of this.obstacles) {
      const r = o.rect;
      if (!crushable(o)) continue;
      const nx = Math.max(r.x, Math.min(pos.x, r.x + r.w));
      const ny = Math.max(r.y, Math.min(pos.y, r.y + r.h));
      const dx = pos.x - nx;
      const dy = pos.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 <= radius * radius) {
        const d = d2;
        if (d < bestD) {
          bestD = d;
          best = o;
        }
      }
    }
    if (!best) return false;
    this.obstacles = this.obstacles.filter((o) => o !== best);
    this.rebuildGrid();
    return true;
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

  // ------------------------------------------------------------ drawing --
  drawGround(ctx: CanvasRenderingContext2D, cam: Camera, w?: number, h?: number): void {
    const vw = w ?? cam.viewW;
    const vh = h ?? cam.viewH;
    const view = cam.viewRect();
    const xStart = Math.floor(view.x / TILE_SIZE) * TILE_SIZE;
    const yStart = Math.floor(view.y / TILE_SIZE) * TILE_SIZE;
    for (let y = yStart; y < view.y + view.h + TILE_SIZE; y += TILE_SIZE) {
      for (let x = xStart; x < view.x + view.w + TILE_SIZE; x += TILE_SIZE) {
        const sx = x - cam.offset.x + cam.jitter.x;
        const sy = y - cam.offset.y + cam.jitter.y;
        drawGroundTile(
          ctx,
          sx,
          sy,
          x,
          y,
          pixelVariant(this.seed, Math.floor(x / 128) * 128, Math.floor(y / 128) * 128, 6),
          this.seed,
        );
        drawTileZone(ctx, sx, sy, x, y, this.seed);
      }
    }

    // ── Sidewalks + kerb along every road, drawn before the asphalt so the
    // road slabs (and their crossings) cleanly cover the inner kerb edge. ──
    this.drawSidewalks(ctx, cam, vw, vh);

    // Roads above terrain and sidewalks: worn edges, cracked asphalt and
    // markings stay sharp.
    for (const road of this.roads) {
      const sr = applyRect(cam, road);
      if (!intersectsRect(sr, vw, vh)) continue;
      drawRoadDetails(ctx, sr.x, sr.y, sr.w, sr.h, road.w < road.h);
    }

    // Zebra crosswalks at only some crossings (real towns don't stripe every
    // junction) — deterministic per map seed.
    const zebra = "rgba(226,222,210,0.82)";
    for (const c of this.crossings) {
      if (worldHash(this.seed + 43, Math.round(c.overlap.x), Math.round(c.overlap.y)) % 3 !== 0) continue;
      const ov = applyRect(cam, c.overlap);
      if (!intersectsRect(ov, vw, vh)) continue;
      const vwRect = applyRect(cam, c.v);
      const hwRect = applyRect(cam, c.h);
      const drawStripes = (
        x0: number,
        y0: number,
        len: number,
        horiz: boolean,
      ): void => {
        ctx.fillStyle = zebra;
        if (horiz) {
          const cols = Math.floor(len / 14);
          for (let i = 0; i < cols; i++) ctx.fillRect(x0 + i * 14, y0, 8, 6);
        } else {
          const rows = Math.floor(len / 14);
          for (let i = 0; i < rows; i++) ctx.fillRect(x0, y0 + i * 14, 6, 8);
        }
      };
      drawStripes(vwRect.x + 4, ov.y - 12, vwRect.w - 8, true);
      drawStripes(vwRect.x + 4, ov.y + ov.h + 6, vwRect.w - 8, true);
      drawStripes(ov.x - 12, hwRect.y + 4, hwRect.h - 8, false);
      drawStripes(ov.x + ov.w + 6, hwRect.y + 4, hwRect.h - 8, false);
    }

    // ── Big open-land features: concrete/dirt/gravel lots + scattered
    // litter, blood, papers — world-anchored and away from roads. ──
    this.drawLotPatches(ctx, cam, vw, vh);
    this.drawScatterDecals(ctx, cam, vw, vh);
  }

  /** Concrete kerb + sidewalk slab running along both edges of every road. */
  private drawSidewalks(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    vw: number,
    vh: number,
  ): void {
    for (const road of this.roads) {
      const vertical = road.w < road.h;
      const bands: SideBand[] = vertical ? sideBands(road, true) : sideBands(road, false);
      for (const band of bands) {
        const s = applyRect(cam, { x: band.x, y: band.y, w: band.w, h: band.h });
        if (!intersectsRect(s, vw, vh)) continue;
        const bandW = band.w;
        const bandH = band.h;
        const isV = band.vertical;
        const roadX = road.x;
        const roadY = road.y;

        // Dirt shoulder behind the slab (the transition into the blocks).
        ctx.fillStyle = "#2A2B22";
        if (isV) ctx.fillRect(s.x, s.y, 5, s.h);
        else ctx.fillRect(s.x, s.y, s.w, 5);

        // Concrete slab, tone broken every ~3.2m by a segment hash.
        ctx.fillStyle = "#3B3C38";
        ctx.fillRect(s.x + (isV ? 5 : 0), s.y + (isV ? 0 : 5), bandW - 5, bandH - 5);
        const along0 = isV ? s.y : s.x;
        const along = isV ? bandH : bandW;
        // Expansion joints + per-segment grime.
        for (let p = 0; p < along; p += 200) {
          const sx0 = isV ? s.x : along0 + p;
          const sy0 = isV ? along0 + p : s.y;
          const hh = worldHash(this.seed + 31, Math.floor(sx0), Math.floor(sy0));
          const segTone = hh % 4;
          if (segTone === 1) {
            ctx.fillStyle = "rgba(56,54,48,0.8)";
            if (isV) ctx.fillRect(s.x + 5, sy0, bandW - 5, Math.min(200, along - p));
            else ctx.fillRect(sx0, s.y + 5, Math.min(200, along - p), bandH - 5);
          } else if (segTone === 2) {
            ctx.fillStyle = "rgba(80,76,66,0.5)";
            if (isV) ctx.fillRect(s.x + 5, sy0, bandW - 5, Math.min(200, along - p));
            else ctx.fillRect(sx0, s.y + 5, Math.min(200, along - p), bandH - 5);
          }
          // Joint line.
          ctx.fillStyle = "rgba(10,10,8,0.35)";
          if (isV) {
            ctx.fillRect(s.x + 6, sy0 + 198, bandW - 10, 2);
          } else {
            ctx.fillRect(sx0 + 198, s.y + 6, 2, bandH - 10);
          }
        }
        // Kerb lip at the asphalt edge.
        ctx.fillStyle = "#22231F";
        if (isV) ctx.fillRect(s.x + bandW - 3, s.y, 3, s.h);
        else ctx.fillRect(s.x, s.y + bandH - 3, s.w, 3);
        // Broken / dropped kerb gaps (driveways) + stains.
        for (let p = 140; p < along - 60; p += 400) {
          const hh = worldHash(this.seed + 61, Math.floor(isV ? roadX : p), Math.floor(isV ? p : roadY));
          if (hh % 2 === 0) continue;
          ctx.fillStyle = "#393A34";
          if (isV) ctx.fillRect(s.x + 5, s.y + p - 10, bandW - 8, 20);
          else ctx.fillRect(s.x + p - 10, s.y + 5, 20, bandH - 8);
        }
      }
    }
  }

  /**
   * Coarse plaza / lot patches inside the open blocks. Painted as low-alpha
   * concrete, dirt or gravel washes (world-anchored, sparse, never on roads)
   * so large districts stop reading as a single flat meadow.
   */
  private drawLotPatches(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    vw: number,
    vh: number,
  ): void {
    const view = cam.viewRect();
    const cell = 460;
    const x0 = Math.floor(view.x / cell);
    const x1 = Math.floor((view.x + view.w) / cell);
    const y0 = Math.floor(view.y / cell);
    const y1 = Math.floor((view.y + view.h) / cell);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const h = worldHash(this.seed + 173, gx, gy);
        const kind = h % 14;
        if (kind > 3) continue;
        const cxw = gx * cell;
        const cyw = gy * cell;
        const rx = cxw + 24 + ((h >> 4) % (cell - 130));
        const ry = cyw + 24 + ((h >> 8) % (cell - 130));
        const rw2 = 90 + ((h >> 5) % 130);
        const rh2 = 70 + ((h >> 9) % 110);
        const rect: Rect = { x: rx, y: ry, w: rw2, h: rh2 };
        if (this.touchesRoad(rect, 6)) continue;
        const sr = applyRect(cam, rect);
        if (!intersectsRect(sr, vw, vh)) continue;
        // Soft-edged blobs (several overlapping arcs) so lots never read as
        // hard-edged rectangles on the ground.
        const cx = sr.x + sr.w / 2;
        const cy = sr.y + sr.h / 2;
        const radius = Math.max(sr.w, sr.h) * 0.34;
        if (kind === 0) {
          // Concrete plaza / yard.
          ctx.fillStyle = "rgba(122,118,106,0.13)";
          for (let k = 0; k < 7; k++) {
            const hh = worldHash(this.seed + 179, gx * cell + k * 31, gy * cell);
            const ang = ((hh % 360) / 360) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(ang) * radius * 0.5, cy + Math.sin(ang) * radius * 0.42, radius * (0.5 + ((hh >> 4) % 40) / 100), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = "rgba(84,82,74,0.16)";
          for (let k = 0; k < 5; k++) {
            const hh = worldHash(this.seed + 181, gx * cell + k * 53, gy * cell - k * 17);
            const ang = ((hh % 360) / 360) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(ang) * radius * 0.4, cy + Math.sin(ang) * radius * 0.36, radius * 0.3, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = "rgba(28,26,22,0.1)";
          ctx.fillRect(sr.x, sr.y, sr.w, 2);
          ctx.fillRect(sr.x, sr.y, 2, sr.h);
        } else if (kind === 1) {
          // Dirt yard.
          ctx.fillStyle = "rgba(98,76,44,0.15)";
          for (let k = 0; k < 8; k++) {
            const hh = worldHash(this.seed + 183, gx * cell + k * 29, gy * cell + k * 11);
            const ang = ((hh % 360) / 360) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(ang) * radius * 0.55, cy + Math.sin(ang) * radius * 0.5, radius * (0.42 + ((hh >> 5) % 45) / 100), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = "rgba(70,54,30,0.13)";
          for (let k = 0; k < 6; k++) {
            const hh = worldHash(this.seed + 187, gx * cell + k * 71, gy * cell - k * 13);
            const ang = ((hh % 360) / 360) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(ang) * radius * 0.46, cy + Math.sin(ang) * radius * 0.4, radius * 0.3, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = "rgba(44,32,18,0.25)";
          ctx.fillRect(sr.x + sr.w * 0.28, sr.y + sr.h * 0.3, sr.w * 0.42, 2);
          ctx.fillRect(sr.x + sr.w * 0.2, sr.y + sr.h * 0.62, sr.w * 0.5, 2);
        } else if (kind === 2) {
          // Gravel lot.
          ctx.fillStyle = "rgba(106,102,90,0.14)";
          for (let k = 0; k < 6; k++) {
            const hh = worldHash(this.seed + 191, gx * cell + k * 37, gy * cell + k * 23);
            const ang = ((hh % 360) / 360) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(ang) * radius * 0.5, cy + Math.sin(ang) * radius * 0.45, radius * (0.45 + ((hh >> 6) % 35) / 100), 0, Math.PI * 2);
            ctx.fill();
          }
          for (let i = 0; i < 20; i++) {
            const hh = worldHash(this.seed + 193, rx + i * 13, ry - i * 7);
            ctx.fillStyle = hh % 2 === 0 ? "rgba(148,140,120,0.55)" : "rgba(66,64,56,0.5)";
            ctx.fillRect(
              sr.x + ((hh >> 3) % Math.max(1, sr.w - 4)),
              sr.y + ((hh >> 7) % Math.max(1, sr.h - 4)),
              3,
              3,
            );
          }
        } else {
          // Charred / soot-marked ground (fire remnants).
          ctx.fillStyle = "rgba(28,24,20,0.14)";
          for (let k = 0; k < 7; k++) {
            const hh = worldHash(this.seed + 197, gx * cell + k * 47, gy * cell - k * 9);
            const ang = ((hh % 360) / 360) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(ang) * radius * 0.5, cy + Math.sin(ang) * radius * 0.46, radius * (0.4 + ((hh >> 4) % 40) / 100), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = "rgba(74,50,30,0.16)";
          ctx.fillRect(sr.x + sr.w * 0.08, sr.y + sr.h * 0.08, sr.w * 0.6, 3);
          ctx.fillStyle = "rgba(20,16,12,0.2)";
          ctx.fillRect(sr.x + sr.w * 0.4, sr.y + sr.h * 0.5, sr.w * 0.34, 2);
        }
      }
    }
  }

  /** Sparse litter / remains strewn over the ground, away from roads. */
  private drawScatterDecals(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    vw: number,
    vh: number,
  ): void {
    const view = cam.viewRect();
    const cell = 240;
    const x0 = Math.floor(view.x / cell);
    const x1 = Math.floor((view.x + view.w) / cell);
    const y0 = Math.floor(view.y / cell);
    const y1 = Math.floor((view.y + view.h) / cell);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const h = worldHash(this.seed + 401, gx, gy);
        if (h % 3 !== 0) continue;
        const cx = gx * cell + 30 + ((h >> 5) % (cell - 60));
        const cy = gy * cell + 30 + ((h >> 9) % (cell - 60));
        const p = { x: cx, y: cy };
        if (this.blocked(p, 20)) continue;
        if (this.touchesRoad({ x: cx - 8, y: cy - 8, w: 26, h: 26 }, 4)) continue;
        const sp = cam.apply(p);
        if (sp.x < -40 || sp.x > vw + 40 || sp.y < -40 || sp.y > vh + 40) continue;
        drawGroundDecal(ctx, Math.round(sp.x), Math.round(sp.y), this.seed, h);
      }
    }
  }

  /**
   * @param windowLights When true, buildings whose deterministic world seed
   *   puts them in the ~70% lit group render illuminated windows; when false
   *   every window renders dark (WINDOW LIGHTS setting = OFF).
   */
  drawObstacles(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    windowLights = false,
  ): void {
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
      if (lamp.x < view.x - 30 || lamp.x > view.x + view.w + 30 || lamp.y < view.y - 30 || lamp.y > view.y + view.h + 30) continue;
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
    // Style variant is district-anchored so a whole neighbourhood shares one
    // palette. Smaller props (trees, vehicles, containers…) mix in a per-prop
    // hash so the same street doesn't repeat identical objects side by side.
    const districtX = Math.floor((rect.x + rect.w / 2) / 1000);
    const districtY = Math.floor((rect.y + rect.h / 2) / 1000);
    const district = pixelVariant(this.seed, districtX * 1000 + 500, districtY * 1000 + 500, 8);
    const perProp = pixelVariant(this.seed, rect.x, rect.y, 8);
    const structureLike = kind === "building" || kind === "house";
    const styleVariant = (structureLike ? district : (district + perProp) % 8);
    const litWindows = windowLights && windowLightSeed(rect.x, rect.y) >= 30;
    drawPropSprite(ctx, kind, sr.x, sr.y, sr.w, sr.h, litWindows, styleVariant);
  }

  // ------------------------------------------------------------- minimap --
  private buildMinimap(): HTMLCanvasElement {
    const scale = MINIMAP_SIZE / WORLD_WIDTH;
    const canvas = document.createElement("canvas");
    canvas.width = MINIMAP_SIZE;
    canvas.height = MINIMAP_SIZE;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0A0C0A";
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    ctx.fillStyle = "#2E2E32";
    for (const r of this.roads) {
      ctx.fillRect(
        r.x * scale,
        r.y * scale,
        Math.max(2, r.w * scale),
        Math.max(2, r.h * scale),
      );
    }
    const colorFor = (k: ObstacleKind): string => {
      switch (k) {
        case "building":
          return "#5E5A6A";
        case "house":
          return "#7A6248";
        case "container":
          return "#357E80";
        case "car_police":
          return "#AEB6C8";
        case "bus":
          return "#C09A44";
        case "wreck":
          return "#5A4638";
        case "tree":
          return "#1E4224";
        case "crate":
          return "#685232";
        case "rubble":
          return "#6E6254";
        case "border":
          return "#3C3C40";
        default:
          return "#383840";
      }
    };
    for (const o of this.obstacles) {
      const r = o.rect;
      ctx.fillStyle = colorFor(o.kind);
      ctx.fillRect(
        r.x * scale,
        r.y * scale,
        Math.max(1, r.w * scale),
        Math.max(1, r.h * scale),
      );
    }
    return canvas;
  }
}

// ------------------------------------------------------------ helpers --
interface SideBand {
  x: number;
  y: number;
  w: number;
  h: number;
  vertical: boolean;
}

function sideBands(road: Rect, vertical: boolean): SideBand[] {
  if (vertical) {
    return [
      { x: road.x - SIDEWALK, y: road.y, w: SIDEWALK, h: road.h, vertical: true },
      { x: road.x + road.w, y: road.y, w: SIDEWALK, h: road.h, vertical: true },
    ];
  }
  return [
    { x: road.x, y: road.y - SIDEWALK, w: road.w, h: SIDEWALK, vertical: false },
    { x: road.x, y: road.y + road.h, w: road.w, h: SIDEWALK, vertical: false },
  ];
}

function randInt(rng: Rng, a: number, b: number): number {
  return a + Math.floor(rng.next() * (b - a + 1));
}

/**
 * Three road centre-lines per axis, with the middle one pinned to the map
 * centre. The two side roads sit 980-1280px out, so the player spawns at a
 * central crossroads with proper city blocks radiating in every direction.
 */
function pickAxis(rng: Rng, length: number): number[] {
  const mid = length / 2;
  const g1 = 980 + rng.next() * 300;
  const g2 = 980 + rng.next() * 300;
  return [mid - g1, mid, mid + g2];
}

/**
 * Open stretches along a road once the perpendicular road crossings (and
 * their junction margins) are removed — the "blocks" between intersections.
 */
function openSegments(centers: number[], length: number, clear = 170): Array<[number, number]> {
  const bands = centers
    .map((c) => [c - clear, c + clear] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  let cur = 90;
  for (const [a, b] of bands) {
    if (a > cur + 60) out.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < length - 90 - 60) out.push([cur, length - 90]);
  return out.filter(([a, b]) => b - a > 150);
}

function applyRect(cam: Camera, r: Rect): Rect {
  return {
    x: r.x - cam.offset.x + cam.jitter.x,
    y: r.y - cam.offset.y + cam.jitter.y,
    w: r.w,
    h: r.h,
  };
}

function intersectsRect(r: Rect, w: number, h: number): boolean {
  return r.x + r.w >= 0 && r.x <= w && r.y + r.h >= 0 && r.y <= h;
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}
