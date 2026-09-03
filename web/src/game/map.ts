// src/game/map.ts
// Procedural city map. Mirrors map.py. Roads, buildings, houses, trees,
// cars, containers, crates, barricades + a small spatial grid for queries.

import { MAP_SEED, WORLD_HEIGHT, WORLD_WIDTH, MINIMAP_SIZE } from "./settings";
import { circleRectCollide, type Rect } from "./collision";
import { mulberry32, type Rng } from "../lib/rng";
import type { Vec } from "./vec";
import type { Camera } from "./camera";
import { TILE_SIZE, drawGroundTile, drawPropSprite, drawRoadDetails, drawStreetLamp, pixelVariant } from "./pixelArt";

export const CELL = 400;

/**
 * Deterministic window-light seed for the obstacle whose world-space origin
 * is at (worldX, worldY). Depends ONLY on world coordinates — never on the
 * camera or time — so the same building always keeps the same window state.
 * Values in [0, 100): seeds >= 30 represent the ~70% "lit" group.
 */
export function windowLightSeed(worldX: number, worldY: number): number {
  return ((Math.round(worldX) * 13 + Math.round(worldY) * 7) % 100 + 100) % 100;
}

export type ObstacleKind =
  | "border"
  | "building"
  | "house"
  | "tree"
  | "bush"
  | "car_red"
  | "car_blue"
  | "car_yellow"
  | "container"
  | "crate"
  | "barrel"
  | "hydrant"
  | "dumpster"
  | "barricade";

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

  private overlaps(rect: Rect, pad: number, checkRoads = false): boolean {
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
    if (checkRoads) {
      for (const r of this.roads) {
        if (
          test.x < r.x + r.w &&
          test.x + test.w > r.x &&
          test.y < r.y + r.h &&
          test.y + test.h > r.y
        ) {
          return true;
        }
      }
    }
    return false;
  }

  private generate(): void {
    const rng = this.rng;
    const w = WORLD_WIDTH;
    const h = WORLD_HEIGHT;
    const t = 60;

    // Border walls.
    this.add("border", { x: -t, y: -t, w: w + 2 * t, h: t });
    this.add("border", { x: -t, y: h, w: w + 2 * t, h: t });
    this.add("border", { x: -t, y: 0, w: t, h });
    this.add("border", { x: w, y: 0, w: t, h });

    // Roads: 2 vertical + 2 horizontal.
    const xs = sampleRange(rng, 600, w - 600, 400, 2).sort((a, b) => a - b);
    const ys = sampleRange(rng, 600, h - 600, 400, 2).sort((a, b) => a - b);
    const rw = 140;
    for (const x of xs) this.roads.push({ x: x - rw / 2, y: 0, w: rw, h });
    for (const y of ys) this.roads.push({ x: 0, y: y - rw / 2, w, h: rw });
    for (const road of this.roads) {
      const vertical = road.w < road.h;
      const start = vertical ? road.y + 130 : road.x + 130;
      const end = vertical ? road.y + road.h - 100 : road.x + road.w - 100;
      for (let along = start; along < end; along += 260) {
        this.streetLamps.push(vertical
          ? { x: road.x + road.w - 18, y: along }
          : { x: along, y: road.y + road.h - 18 });
      }
    }

    // Where a vertical road meets a horizontal one, remember the crossing so
    // zebra markings can be painted at the four approaches.
    for (let i = 0; i < this.roads.length; i++) {
      for (let j = i + 1; j < this.roads.length; j++) {
        const a = this.roads[i]!;
        const b = this.roads[j]!;
        const aVert = a.w < a.h;
        const bVert = b.w < b.h;
        if (aVert === bVert) continue; // parallel roads never cross
        const v = aVert ? a : b; // the vertical road
        const h = aVert ? b : a; // the horizontal road
        const ox = Math.max(v.x, h.x);
        const oy = Math.max(v.y, h.y);
        const ow = Math.min(v.x + v.w, h.x + h.w) - ox;
        const oh = Math.min(v.y + v.h, h.y + h.h) - oy;
        if (ow > 0 && oh > 0) {
          this.crossings.push({ v, h, overlap: { x: ox, y: oy, w: ow, h: oh } });
        }
      }
    }

    // Buildings.
    let placed = 0;
    let attempts = 0;
    while (placed < 16 && attempts < 300) {
      attempts++;
      const bw = randInt(rng, 200, 420);
      const bh = randInt(rng, 160, 320);
      const r: Rect = {
        x: randInt(rng, t + 40, w - bw - t - 40),
        y: randInt(rng, t + 40, h - bh - t - 40),
        w: bw,
        h: bh,
      };
      if (!this.overlaps(r, 70)) {
        this.add("building", r);
        placed++;
      }
    }

    // Houses.
    placed = 0;
    attempts = 0;
    while (placed < 12 && attempts < 300) {
      attempts++;
      const hw = randInt(rng, 120, 210);
      const hh = randInt(rng, 110, 180);
      const r: Rect = {
        x: randInt(rng, t + 20, w - hw - t - 20),
        y: randInt(rng, t + 20, h - hh - t - 20),
        w: hw,
        h: hh,
      };
      if (!this.overlaps(r, 50)) {
        this.add("house", r);
        placed++;
      }
    }

    // Cars.
    for (let i = 0; i < 14; i++) {
      const road = rng.pick(this.roads);
      let car: Rect;
      if (road.w < road.h) {
        const side = rng.pick([-1, 1]);
        const cx = road.x + road.w / 2 + side * (road.w / 2 - 32);
        const cy = randInt(rng, t + 80, h - t - 80);
        car = { x: cx - 45, y: cy - 25, w: 90, h: 50 };
      } else {
        const side = rng.pick([-1, 1]);
        const cx = randInt(rng, t + 80, w - t - 80);
        const cy = road.y + road.h / 2 + side * (road.h / 2 - 32);
        car = { x: cx - 45, y: cy - 25, w: 90, h: 50 };
      }
      if (!this.overlaps(car, 8)) {
        const color = rng.pick(["red", "blue", "yellow"] as const);
        this.add(`car_${color}` as ObstacleKind, car);
      }
    }

    // Containers.
    for (let i = 0; i < 8; i++) {
      const road = rng.pick(this.roads);
      const vertical = road.w < road.h;
      const cw = vertical ? { w: 70, h: 170 } : { w: 170, h: 70 };
      const posX = !vertical
        ? road.x + road.w / 2 + randInt(rng, -260, 260)
        : road.x + road.w / 2 + rng.pick([-1, 1]) * randInt(rng, 160, 300);
      const posY = vertical
        ? road.y + road.h / 2 + randInt(rng, -260, 260)
        : road.y + road.h / 2 + rng.pick([-1, 1]) * randInt(rng, 160, 300);
      const box: Rect = {
        x: posX,
        y: posY,
        w: cw.w,
        h: cw.h,
      };
      // Clamp into world.
      if (box.x < t) {
        box.x = t;
      } else if (box.x + box.w > w - t) {
        box.x = w - t - box.w;
      }
      if (box.y < t) {
        box.y = t;
      } else if (box.y + box.h > h - t) {
        box.y = h - t - box.h;
      }
      if (!this.overlaps(box, 25)) this.add("container", box);
    }

    // Crates.
    for (let i = 0; i < 26; i++) {
      const box: Rect = {
        x: randInt(rng, t, w - t - 42),
        y: randInt(rng, t, h - t - 42),
        w: randInt(rng, 36, 48),
        h: randInt(rng, 36, 48),
      };
      if (!this.overlaps(box, 18)) this.add("crate", box);
    }

    // Barricades.
    for (let i = 0; i < 16; i++) {
      const horiz = rng.next() < 0.5;
      const size = horiz ? { w: 90, h: 18 } : { w: 18, h: 90 };
      const box: Rect = {
        x: randInt(rng, t, w - t - size.w),
        y: randInt(rng, t, h - t - size.h),
        w: size.w,
        h: size.h,
      };
      if (!this.overlaps(box, 16)) this.add("barricade", box);
    }

    // Trees.
    for (let i = 0; i < 95; i++) {
      const radius = randInt(rng, 17, 28);
      const cx = randInt(rng, t + radius, w - t - radius);
      const cy = randInt(rng, t + radius, h - t - radius);
      const box: Rect = { x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 };
      if (!this.overlaps(box, 10)) this.add("tree", box);
    }

    // Shrubs: small leafy clumps scattered like trees.
    for (let i = 0; i < 26; i++) {
      const radius = randInt(rng, 12, 18);
      const cx = randInt(rng, t + radius, w - t - radius);
      const cy = randInt(rng, t + radius, h - t - radius);
      const box: Rect = { x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 };
      if (!this.overlaps(box, 10)) this.add("bush", box);
    }

    // Barrels clustered near containers (props that read as a loading zone).
    const containers = this.obstacles.filter((o) => o.kind === "container");
    for (const cont of containers) {
      const n = randInt(rng, 0, 3);
      const longSide = cont.rect.w > cont.rect.h; // container orientation
      for (let k = 0; k < n; k++) {
        const side = rng.next() < 0.5 ? -1 : 1;
        // Offset along the container's short axis so the barrel clears its
        // footprint (> pad margin); position along the long axis is random.
        const bx = longSide
          ? cont.rect.x + cont.rect.w / 2 + side * (cont.rect.w / 2 + 26)
          : cont.rect.x + cont.rect.w / 2 + side * randInt(rng, 0, 28);
        const by = longSide
          ? cont.rect.y + cont.rect.h / 2 + side * randInt(rng, 0, 28)
          : cont.rect.y + cont.rect.h / 2 + side * (cont.rect.h / 2 + 26);
        const box: Rect = { x: bx - 12, y: by - 16, w: 24, h: 32 };
        if (box.x > t && box.y > t && box.x + box.w < w - t && box.y + box.h < h - t) {
          if (!this.overlaps(box, 6)) this.add("barrel", box);
        }
      }
    }

    // Hydrants + dumpsters along random building / house façades.
    const structures = this.obstacles.filter(
      (o) => o.kind === "building" || o.kind === "house",
    );
    for (let i = 0; i < 7 && structures.length > 0; i++) {
      const s = rng.pick(structures);
      const side = rng.next() < 0.5 ? 0 : 1; // 0=top/bottom edge, 1=left/right edge
      const edge = rng.next() < 0.5 ? -1 : 1;
      // Prop box is 18x24 and must sit fully OUTSIDE the structure (> pad 8).
      const gap = 20; // structure edge -> prop centre line
      let cx: number;
      let cy: number;
      if (side === 0) {
        cx = s.rect.x + s.rect.w / 2 + edge * randInt(rng, 0, Math.max(10, s.rect.w / 2 - 40));
        cy = edge < 0 ? s.rect.y - gap : s.rect.y + s.rect.h + gap;
      } else {
        cx = edge < 0 ? s.rect.x - gap : s.rect.x + s.rect.w + gap;
        cy = s.rect.y + s.rect.h / 2 + edge * randInt(rng, 0, Math.max(10, s.rect.h / 2 - 40));
      }
      const box: Rect = { x: cx - 9, y: cy - 12, w: 18, h: 24 };
      if (box.x > t && box.y > t && box.x + box.w < w - t && box.y + box.h < h - t) {
        if (!this.overlaps(box, 8)) this.add(i % 2 === 0 ? "hydrant" : "dumpster", box);
      }
    }
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
        // Pass the tile's world origin as well as its screen position so the
        // ground's decorative flecks stay glued to fixed world cells.
        drawGroundTile(
          ctx,
          x - cam.offset.x + cam.jitter.x,
          y - cam.offset.y + cam.jitter.y,
          x,
          y,
          pixelVariant(this.seed, x, y, 6),
          this.seed,
        );
      }
    }
    // Curb + worn shoulder strip along both long edges of every road, drawn
    // BEFORE the slabs so road crossings naturally cover them. Reads as a
    // raised concrete kerb against the grass.
    const band = 10;
    const shoulders: Array<{ ex: number; ey: number; ew: number; eh: number; vertical: boolean }> = [];
    for (const road of this.roads) {
      const vertical = road.w < road.h;
      const edges = vertical
        ? [
            { ex: road.x - band, ey: road.y, ew: band, eh: road.h },
            { ex: road.x + road.w, ey: road.y, ew: band, eh: road.h },
          ]
        : [
            { ex: road.x, ey: road.y - band, ew: road.w, eh: band },
            { ex: road.x, ey: road.y + road.h, ew: road.w, eh: band },
          ];
      for (const e of edges) shoulders.push({ ...e, vertical });
    }
    for (const e of shoulders) {
      const se = applyRect(cam, { x: e.ex, y: e.ey, w: e.ew, h: e.eh });
      if (!intersectsRect(se, vw, vh)) continue;
      ctx.fillStyle = "#272C22";
      ctx.fillRect(se.x, se.y, se.w, se.h);
      // Lighter grass lip right next to the asphalt.
      ctx.fillStyle = "#333A28";
      if (e.vertical) ctx.fillRect(se.x, se.y, 3, se.h);
      else ctx.fillRect(se.x, se.y, se.w, 3);
      // Joint ticks every 64 world px along the shoulder.
      const along = e.vertical ? e.ey : e.ex;
      const span = e.vertical ? e.eh : e.ew;
      const start = Math.max(along, e.vertical ? view.y : view.x);
      const end = Math.min(along + span, e.vertical ? view.y + view.h : view.x + view.w);
      ctx.fillStyle = "rgba(10,12,8,0.35)";
      for (let p = Math.floor(start / 64) * 64; p < end; p += 64) {
        if (e.vertical) ctx.fillRect(se.x + 4, p - cam.offset.y + cam.jitter.y, se.w - 5, 2);
        else ctx.fillRect(p - cam.offset.x + cam.jitter.x, se.y + 4, 2, se.h - 5);
      }
    }

    // Roads sit above terrain and shoulders so worn edges, cracked asphalt,
    // and markings stay sharp.
    for (const road of this.roads) {
      const sr = applyRect(cam, road);
      if (!intersectsRect(sr, vw, vh)) continue;
      drawRoadDetails(ctx, sr.x, sr.y, sr.w, sr.h, road.w < road.h);
    }

    // Zebra crosswalks at the four approaches of every road crossing.
    const zebra = "rgba(226,222,210,0.82)";
    for (const c of this.crossings) {
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
      // Above and below the overlap, across the vertical road.
      drawStripes(vwRect.x + 4, ov.y - 12, vwRect.w - 8, true);
      drawStripes(vwRect.x + 4, ov.y + ov.h + 6, vwRect.w - 8, true);
      // Left and right of the overlap, across the horizontal road.
      drawStripes(ov.x - 12, hwRect.y + 4, hwRect.h - 8, false);
      drawStripes(ov.x + ov.w + 6, hwRect.y + 4, hwRect.h - 8, false);
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
      if (lamp.x < view.x - 24 || lamp.x > view.x + view.w + 24 || lamp.y < view.y - 24 || lamp.y > view.y + view.h + 24) continue;
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
    if (String(kind) !== "border") {
      // Deterministic lit/dark choice locked to the obstacle's WORLD position:
      // (x*13 + y*7) % 100 >= 30 gives ~70% lit buildings, ~30% permanently
      // dark. Never derived from camera/screen state, so the exact same
      // buildings stay lit (or dark) no matter how the player moves.
      const litWindows = windowLights && windowLightSeed(rect.x, rect.y) >= 30;
      // Façade / prop colour variety is also world-anchored (never camera).
      const styleVariant = pixelVariant(1, rect.x, rect.y, 4);
      drawPropSprite(ctx, kind, sr.x, sr.y, sr.w, sr.h, litWindows, styleVariant);
      return;
    }
    switch (kind) {
      case "building": {
        ctx.fillStyle = "#3A3842";
        ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
        ctx.fillStyle = "#4A4854";
        ctx.fillRect(sr.x + 7, sr.y + 7, sr.w - 14, sr.h - 14);
        ctx.strokeStyle = "#2E2E32";
        ctx.lineWidth = 3;
        ctx.strokeRect(sr.x, sr.y, sr.w, sr.h);
        ctx.fillStyle = "#82827E";
        for (let wx = sr.x + 22; wx < sr.x + sr.w - 26; wx += 44) {
          for (let wy = sr.y + 22; wy < sr.y + sr.h - 26; wy += 52) {
            if ((Math.floor(wx / 44) + Math.floor(wy / 52)) % 3 !== 0) {
              ctx.fillRect(wx, wy, 12, 16);
            }
          }
        }
        break;
      }
      case "house": {
        ctx.fillStyle = "#563E30";
        ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
        ctx.fillStyle = "#6C503C";
        ctx.fillRect(sr.x + 9, sr.y + 9, sr.w - 18, sr.h - 18);
        ctx.strokeStyle = "#281C16";
        ctx.lineWidth = 3;
        ctx.strokeRect(sr.x, sr.y, sr.w, sr.h);
        break;
      }
      case "tree": {
        const cx = sr.x + sr.w / 2;
        const cy = sr.y + sr.h / 2;
        ctx.fillStyle = "#12221A";
        ctx.beginPath();
        ctx.arc(cx + 4, cy + 5, sr.w / 2 + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#224E28";
        ctx.beginPath();
        ctx.arc(cx, cy, sr.w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#18381E";
        ctx.beginPath();
        ctx.arc(cx - 4, cy - 4, sr.w / 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "car_red":
      case "car_blue":
      case "car_yellow": {
        const c = kind === "car_red" ? "#8C2C2C" : kind === "car_blue" ? "#304484" : "#A88A30";
        ctx.fillStyle = c;
        roundRect(ctx, sr, 10);
        ctx.fillStyle = "#14141A";
        roundRect(ctx, { x: sr.x + 8, y: sr.y + 7, w: sr.w - 16, h: sr.h - 14 }, 6);
        ctx.fill();
        ctx.strokeStyle = "#0F0F12";
        ctx.lineWidth = 2;
        roundRect(ctx, sr, 10);
        ctx.stroke();
        break;
      }
      case "container": {
        ctx.fillStyle = "#346060";
        ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
        ctx.strokeStyle = "#264A4A";
        ctx.lineWidth = 1;
        for (let i = 0; i < sr.w; i += 14) {
          ctx.beginPath();
          ctx.moveTo(sr.x + i, sr.y);
          ctx.lineTo(sr.x + i, sr.y + sr.h);
          ctx.stroke();
        }
        ctx.strokeStyle = "#1A3636";
        ctx.lineWidth = 3;
        ctx.strokeRect(sr.x, sr.y, sr.w, sr.h);
        break;
      }
      case "crate": {
        ctx.fillStyle = "#806238";
        roundRect(ctx, sr, 3);
        ctx.fill();
        ctx.strokeStyle = "#563E20";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sr.x, sr.y);
        ctx.lineTo(sr.x + sr.w, sr.y + sr.h);
        ctx.moveTo(sr.x + sr.w, sr.y);
        ctx.lineTo(sr.x, sr.y + sr.h);
        ctx.stroke();
        ctx.strokeStyle = "#3C2C18";
        ctx.lineWidth = 2;
        roundRect(ctx, sr, 3);
        ctx.stroke();
        break;
      }
      case "barricade": {
        ctx.fillStyle = "#6E6E70";
        ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
        ctx.fillStyle = "#C8A028";
        if (sr.w > sr.h) {
          for (let i = sr.x; i < sr.x + sr.w; i += 24) {
            ctx.beginPath();
            ctx.moveTo(i, sr.y + sr.h);
            ctx.lineTo(i + 12, sr.y + sr.h);
            ctx.lineTo(i + 24, sr.y);
            ctx.lineTo(i + 12, sr.y);
            ctx.closePath();
            ctx.fill();
          }
        } else {
          for (let i = sr.y; i < sr.y + sr.h; i += 24) {
            ctx.beginPath();
            ctx.moveTo(sr.x + sr.w, i);
            ctx.lineTo(sr.x + sr.w, i + 12);
            ctx.lineTo(sr.x, i + 24);
            ctx.lineTo(sr.x, i + 12);
            ctx.closePath();
            ctx.fill();
          }
        }
        break;
      }
      case "border": {
        ctx.fillStyle = "#2E2E32";
        ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
        break;
      }
    }
  }

  // ------------------------------------------------------------- minimap -
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
          return "#46444E";
        case "house":
          return "#604838";
        case "tree":
          return "#1E4224";
        case "container":
          return "#305858";
        case "crate":
          return "#685232";
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

function randInt(rng: Rng, a: number, b: number): number {
  return a + Math.floor(rng.next() * (b - a + 1));
}

function sampleRange(rng: Rng, lo: number, hi: number, step: number, n: number): number[] {
  const arr: number[] = [];
  for (let v = lo; v <= hi; v += step) arr.push(v);
  // partial Fisher-Yates
  for (let i = 0; i < n && i < arr.length; i++) {
    const k = i + Math.floor(rng.next() * (arr.length - i));
    [arr[i], arr[k]] = [arr[k]!, arr[i]!];
  }
  return arr.slice(0, n);
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

function roundRect(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  radius: number,
): void {
  const x = r.x,
    y = r.y,
    w = r.w,
    h = r.h,
    rad = Math.min(radius, w / 2, h / 2);
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
