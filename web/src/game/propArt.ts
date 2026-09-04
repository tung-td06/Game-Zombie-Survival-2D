// src/game/propArt.ts
// Detailed world prop / structure rendering for the map (top-down).
// All art is pure: given a world rect, a kind and a deterministic style
// variant it paints the same pixels every time, so visuals stay glued to
// their collision rects no matter how the camera moves.

import {
  getPixelArtAtlas,
  px,
  rect,
  worldHash,
} from "./pixelArt";

export type PropKind =
  | "border"
  | "building"
  | "house"
  | "tree"
  | "bush"
  | "car_red"
  | "car_blue"
  | "car_yellow"
  | "car_police"
  | "van"
  | "bus"
  | "wreck"
  | "container"
  | "crate"
  | "barrel"
  | "hydrant"
  | "dumpster"
  | "barricade"
  | "rubble"
  | "mailbox"
  | "bench"
  | "cart"
  | "monument";

// ---------------------------------------------------------------------
// Façade palettes. styleVariant selects a district-consistent palette; the
// high bit flags a fire-damaged ("ruined") structure.
// ---------------------------------------------------------------------
const FACADE: ReadonlyArray<{
  wall: string;
  dark: string;
  light: string;
  frame: string;
  trim: string;
  brick: boolean;
  skylight: boolean;
}> = [
  // Concrete panel block
  { wall: "#52525E", dark: "#3E3E4A", light: "#6A6A76", frame: "#1B1D23", trim: "#6E6E7C", brick: false, skylight: false },
  // Red brick commercial
  { wall: "#74463E", dark: "#5A342E", light: "#8A5A50", frame: "#24130F", trim: "#96645A", brick: true, skylight: false },
  // Grey-blue industrial
  { wall: "#46545E", dark: "#36424A", light: "#586770", frame: "#121A20", trim: "#64737C", brick: false, skylight: true },
  // Sand stucco
  { wall: "#8A7A5C", dark: "#6E6046", light: "#A08E6C", frame: "#2A2114", trim: "#AB9978", brick: false, skylight: false },
  // Taupe mixed-use w/ storefront
  { wall: "#6E5A4E", dark: "#55443A", light: "#85705F", frame: "#211610", trim: "#917C6A", brick: true, skylight: false },
  // Faded teal panels
  { wall: "#4E5E58", dark: "#3C4A44", light: "#60726B", frame: "#141E1B", trim: "#6C7F77", brick: false, skylight: false },
];

const HOUSE_ROOF = ["#4C302C", "#3F3A3C", "#3E3A50", "#5A4630"];
const HOUSE_WALL = ["#72503C", "#8A7A68", "#7C6B62", "#8C7A54"];

const VEHICLE_BODY: Record<string, string> = {
  car_red: "#A93B36",
  car_blue: "#355A9C",
  car_yellow: "#B49234",
  car_police: "#C7C9CE",
  van: "#9AA0A4",
  bus: "#B08934",
  wreck: "#3A312C",
};
const VEHICLE_DARK: Record<string, string> = {
  car_red: "#7E2A26",
  car_blue: "#274273",
  car_yellow: "#8A6E24",
  car_police: "#3A3F4A",
  van: "#6E7478",
  bus: "#8A6A22",
  wreck: "#241E1A",
};

export function drawPropSprite(
  ctx: CanvasRenderingContext2D,
  kind: string,
  x: number,
  y: number,
  w: number,
  h: number,
  litWindows = false,
  styleVariant = 0,
  worldX: number,
  worldY: number,
): void {
  getPixelArtAtlas(ctx);
  // Screen→world delta. Every deterministic hash below must use WORLD
  // coordinates: hashing the screen rect would regenerate the pattern from
  // the camera position, making windows/roof details/flecks shift and flicker
  // as the player walks. The drawing positions stay screen-relative.
  const dx = x - worldX;
  const dy = y - worldY;
  if (kind === "border") return drawBorder(ctx, x, y, w, h, styleVariant, dx, dy);
  if (kind === "building") return drawBuilding(ctx, x, y, w, h, litWindows, styleVariant, dx, dy);
  if (kind === "house") return drawHouse(ctx, x, y, w, h, litWindows, styleVariant, dx, dy);
  if (kind === "tree") return drawTree(ctx, x, y, w, h, styleVariant);
  if (kind === "bush") return drawBush(ctx, x, y, w, h, styleVariant);
  if (kind === "container") return drawContainer(ctx, x, y, w, h, styleVariant, dx, dy);
  if (kind === "crate") return drawCrate(ctx, x, y, w, h, styleVariant);
  if (kind === "barricade") return drawBarricade(ctx, x, y, w, h, styleVariant);
  if (kind === "barrel") return drawBarrel(ctx, x, y, w, h, styleVariant);
  if (kind === "hydrant") return drawHydrant(ctx, x, y, w, h);
  if (kind === "dumpster") return drawDumpster(ctx, x, y, w, h, dx, dy);
  if (kind === "rubble") return drawRubble(ctx, x, y, w, h, styleVariant, dx, dy);
  if (kind === "mailbox") return drawMailbox(ctx, x, y, w, h, dx, dy);
  if (kind === "bench") return drawBench(ctx, x, y, w, h);
  if (kind === "cart") return drawCart(ctx, x, y, w, h);
  if (kind === "monument") return drawMonument(ctx, x, y, w, h);
  if (
    kind === "car_red" ||
    kind === "car_blue" ||
    kind === "car_yellow" ||
    kind === "car_police" ||
    kind === "van" ||
    kind === "bus" ||
    kind === "wreck"
  ) {
    return drawVehicle(ctx, kind, x, y, w, h, styleVariant);
  }
  rect(ctx, x, y, w, h, "#303137");
  ctx.strokeStyle = "#17181C";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

// ------------------------------------------------------------------ border
// Ruined urban fringe: crumbled earth bank with a leaning chain-link fence,
// debris and charred stumps. Reads as "end of the map", not an invisible wall.
function drawBorder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  _sv: number,
  dx: number,
  dy: number,
): void {
  rect(ctx, x, y, w, h, "#191A16");
  const vertical = h > w;
  const base = "#262821";
  const earth = "#3A3628";
  const fence = "#3E4436";
  const span = vertical ? h : w;
  const step = 110;
  const s0 = vertical ? y : x;
  for (let s = s0; s < s0 + span - 4; s += step) {
    const hh = worldHash(6011, (vertical ? x : s) - dx, (vertical ? s : y) - dy);
    if (hh % 3 === 0) {
      // Rubble mound along the inner lip.
      ctx.fillStyle = earth;
      ctx.beginPath();
      if (vertical) {
        ctx.arc(x + 10, s + 20, 14 + (hh % 8), 0, Math.PI * 2);
      } else {
        ctx.arc(s + 20, y + 10, 14 + (hh % 8), 0, Math.PI * 2);
      }
      ctx.fill();
    }
    // Fence post.
    ctx.fillStyle = fence;
    if (vertical) {
      rect(ctx, x + 4, s, 3, step, "#2C3126");
      rect(ctx, x + 2, s + step / 2, 7, 2, "#22261C");
      // barbed top rail
      rect(ctx, x, s + 6, 2, 2, "#2C3126");
    } else {
      rect(ctx, s, y + 4, step, 3, "#2C3126");
      rect(ctx, s + step / 2, y + 2, 2, 7, "#22261C");
      rect(ctx, s + 6, y, 2, 2, "#2C3126");
    }
  }
  // Rust streaks / char patches on the bank.
  const n = Math.floor((w + h) / 90);
  for (let i = 0; i < n; i++) {
    const hh = worldHash(6023 + i, x - dx, y - dy);
    const ox = x + (hh % Math.max(1, w - 6));
    const oy = y + ((hh >> 4) % Math.max(1, h - 6));
    px(ctx, ox, oy, hh % 5 === 0 ? "#46301A" : "#111310", 3);
  }
}

// ------------------------------------------------------------- buildings --
// ─────────────────────────────────────────────────────────────────────
// Shared building-art pieces. Positions are screen-space (already integer
// thanks to the pixel-snapped render camera); every worldHash input is
// converted back to WORLD space via the per-prop delta (dx/dy) so no
// pattern can shift or flicker while the camera moves.
// ─────────────────────────────────────────────────────────────────────

const ROOF_FLAT = ["#3A3A44", "#2C2C34"]; // flat shingle / concrete roofs
const ROOF_STEEL = ["#33363C", "#26282E"]; // corrugated industrial roof
const ROOF_TILE = ["#4E3A30", "#3A2A22"]; // clay-tile gables

/** Subtle wall material: brick coursing or concrete seams + weather patch. */
function wallTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  brick: boolean,
  wx0: number,
  wy0: number,
): void {
  if (brick) {
    ctx.fillStyle = "rgba(20,10,8,0.18)";
    for (let yy = y + 4; yy < y + h - 4; yy += 6) rect(ctx, x, yy, w, 1, "rgba(20,10,8,0.18)");
    ctx.fillStyle = "rgba(255,235,210,0.045)";
    let r = 0;
    for (let yy = y + 2; yy < y + h - 6; yy += 6) {
      const off = r % 2 === 0 ? 0 : 4;
      for (let xx = x + 2 + off; xx < x + w - 4; xx += 9) rect(ctx, xx, yy, 2, 2, "rgba(255,235,210,0.045)");
      r++;
    }
  } else {
    // Concrete / plaster: vertical panel seams (world-anchored) + a weather
    // band + one damp patch (rare).
    const seam = ((wx0 % 52) + 52) % 52;
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    for (let xx = x + seam; xx < x + w - 2; xx += 52) rect(ctx, xx, y, 2, h, "rgba(0,0,0,0.10)");
    rect(ctx, x, y + Math.floor(h * 0.62), w, 1, "rgba(0,0,0,0.08)");
    const st = worldHash(4101, wx0, wy0);
    if (st % 4 === 0) {
      const px0 = x + 5 + ((st >> 3) % Math.max(8, w - 20));
      const py0 = y + Math.floor(h * 0.55) + ((st >> 7) % Math.max(4, Math.floor(h * 0.3)));
      ctx.fillStyle = "rgba(8,8,10,0.14)";
      ctx.beginPath();
      ctx.arc(px0, py0, 6 + (st % 5), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * One window: frame + sill + inner glass. state: 0 glass, 1 boarded,
 * 2 broken, 3 curtains. Lit windows stay muted (never brighter than the
 * player). All state comes from the caller's world-anchored hash.
 */
function drawWin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  frame: string,
  trim: string,
  lit: boolean,
  state: number,
): void {
  rect(ctx, x - 1, y - 1, w + 2, h + 2, frame);
  rect(ctx, x, y, w, h, lit ? "#C9A34E" : "#0E1118");
  if (lit) {
    rect(ctx, x + 1, y + 1, w - 2, Math.max(2, Math.floor(h * 0.3)), "#E6CB7B");
    rect(ctx, x + w - 3, y + 1, 1, h - 2, "#B98F3E");
  }
  if (state === 1) {
    // Boarded over: three planks + diagonal brace + nails.
    const b = Math.max(3, Math.floor(h / 3));
    for (let i = 0; i < 3; i++) {
      const yy = y + 2 + i * (b + 1);
      rect(ctx, x + 2, yy, w - 4, b, "#33291C");
      rect(ctx, x + 3, yy + 1, w - 6, 1, "#4A3C28");
      px(ctx, x + 4, yy + b - 1, "#241B10", 2);
      px(ctx, x + w - 6, yy + b - 1, "#241B10", 2);
    }
    ctx.fillStyle = "#3A2E1E";
    ctx.beginPath();
    ctx.moveTo(x + 2, y + h - 2);
    ctx.lineTo(x + 6, y + h - 2);
    ctx.lineTo(x + w - 2, y + 4);
    ctx.lineTo(x + w - 2, y + 8);
    ctx.closePath();
    ctx.fill();
  } else if (state === 2) {
    // Broken: dark hole, shards at the sill, one crack.
    rect(ctx, x + 1, y + 1, w - 2, h - 2, "#05070C");
    px(ctx, x + 2, y + h - 3, "#9DB8C2", 3);
    px(ctx, x + 6, y + h - 2, "#C3D6DC", 2);
    px(ctx, x + w - 5, y + h - 3, "#7E9AA6", 2);
    ctx.strokeStyle = "rgba(160,190,200,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 4);
    ctx.lineTo(x + w - 4, y + h - 4);
    ctx.stroke();
  } else if (state === 3) {
    // Curtains: darker recess + two curtain panels + valance.
    rect(ctx, x + 1, y + 1, w - 2, h - 2, "#1A1E26");
    rect(ctx, x + 2, y + 2, 3, h - 4, "#3A3226");
    rect(ctx, x + 6, y + 2, 2, h - 4, "#2C271E");
    rect(ctx, x + w - 5, y + 2, 3, h - 4, "#3A3226");
    rect(ctx, x + 2, y + 2, w - 4, 2, "#241E14");
  } else {
    // Glass: mullion + tiny reflection.
    rect(ctx, x + Math.floor(w / 2) - 1, y + 1, 2, h - 2, frame);
    px(ctx, x + 3, y + 3, "rgba(190,215,225,0.22)", 2);
  }
  rect(ctx, x - 1, y + h - 1, w + 2, 2, trim);
  rect(ctx, x - 1, y + h + 1, w + 2, 1, "rgba(0,0,0,0.3)");
}

/**
 * One door: frame + step + panels + handle. state: 0 normal, 1 boarded,
 * 2 broken-open. `roller` draws a warehouse roller shutter instead.
 */
function drawDoor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  frame: string,
  state: number,
  roller = false,
): void {
  rect(ctx, x - 2, y - 2, w + 4, h + 4, frame);
  rect(ctx, x - 3, y + h, w + 6, 3, "#34352F");
  if (roller) {
    rect(ctx, x, y, w, h, "#33363C");
    for (let sx = x + 2; sx < x + w - 1; sx += 5) rect(ctx, sx, y, 1, h, "#26282E");
    rect(ctx, x, y, w, 3, "#4A4E56");
    rect(ctx, x, y + h - 4, w, 4, "#1C1E22");
    return;
  }
  rect(ctx, x, y, w, h, "#121419");
  rect(ctx, x + 2, y + 2, w - 4, h - 4, "#1C1E26");
  const ph = Math.floor((h - 8) / 2);
  rect(ctx, x + 4, y + 4, w - 8, ph - 2, "#14161C");
  rect(ctx, x + 4, y + 6 + ph, w - 8, h - 10 - ph, "#14161C");
  px(ctx, x + w - 5, y + Math.floor(h / 2), "#C9A34E", 2);
  rect(ctx, x + 1, y + 2, 1, h - 4, "rgba(0,0,0,0.35)");
  if (state === 1) {
    for (let yy = y + 2; yy < y + h - 3; yy += 8) {
      rect(ctx, x + 2, yy, w - 4, 6, "#33291C");
      px(ctx, x + 3, yy + 5, "#241B10", 2);
      px(ctx, x + w - 5, yy + 5, "#241B10", 2);
    }
    ctx.fillStyle = "#3A2E1E";
    ctx.beginPath();
    ctx.moveTo(x + 2, y + h - 2);
    ctx.lineTo(x + 6, y + h - 2);
    ctx.lineTo(x + w - 2, y + 4);
    ctx.lineTo(x + w - 2, y + 8);
    ctx.closePath();
    ctx.fill();
  } else if (state === 2) {
    rect(ctx, x + 2, y + 2, w - 4, h - 2, "#04060A");
    px(ctx, x + 3, y + h - 2, "#5E5444", 3);
    px(ctx, x + w - 5, y + h - 1, "#6E6250", 3);
  }
}

/** Flat roof band along the north edge: parapet lip, panels, stains, AC. */
function drawFlatRoof(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  rh: number,
  roof: string,
  roofDark: string,
  edge: string,
  wx0: number,
  wy0: number,
  equipment: boolean,
  skylights = false,
): void {
  rect(ctx, x, y, w, rh, roofDark);
  rect(ctx, x + 1, y + 2, w - 2, rh - 4, roof);
  const seam = ((wx0 % 26) + 26) % 26;
  ctx.fillStyle = "rgba(0,0,0,0.13)";
  for (let sx = x + 3 + seam; sx < x + w - 2; sx += 26) rect(ctx, sx, y + 2, 1, rh - 5, "rgba(0,0,0,0.13)");
  const rh0 = worldHash(4603, wx0, wy0);
  if (rh0 % 3 === 0) {
    const sx = x + 6 + ((rh0 >> 4) % Math.max(6, w - 26));
    ctx.fillStyle = "rgba(18,22,16,0.15)";
    ctx.beginPath();
    ctx.arc(sx, y + 4 + ((rh0 >> 7) % Math.max(3, rh - 10)), 4 + (rh0 % 6), 0, Math.PI * 2);
    ctx.fill();
  }
  if (skylights) {
    ctx.fillStyle = "rgba(190,214,224,0.14)";
    for (let sx = x + 14; sx < x + w - 18; sx += 52) rect(ctx, sx, y + 4, 30, 2, "rgba(190,214,224,0.14)");
  }
  rect(ctx, x + 1, y + 1, w - 2, 1, edge);
  rect(ctx, x + 1, y + 1, 1, rh - 3, edge);
  if (equipment) {
    const step = Math.max(64, Math.min(104, w / 4));
    for (let rx = x + 26; rx < x + w - 26; rx += step) {
      const rv = worldHash(3037, rx - (x - wx0), y - (y - wy0));
      if (rv % 2 === 0) {
        const ux = rx + (rv % 12);
        const uh = 8 + ((rv >> 3) % 4);
        rect(ctx, ux, y - uh + 4, 16, uh, "#8E8E9A");
        rect(ctx, ux + 2, y - uh + 6, 12, 3, "#AEAEBA");
        rect(ctx, ux + 5, y - uh + 6, 4, 2, "#5A5A66");
      }
      if (rv % 5 === 0) {
        rect(ctx, rx + 18, y + 3, 4, 4, "#66666E");
        rect(ctx, rx + 19, y - 1, 2, 4, "#888892");
      }
    }
  }
}

/** Pitched gable roof: tile courses climbing to a ridge + eave shadow. */
function drawGableRoof(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  gh: number,
  roof: string,
  ridge: string,
  wx0: number,
  wy0: number,
): void {
  const cx = x + w / 2;
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(x + 1, y + gh - 1);
  ctx.lineTo(cx, y + 1);
  ctx.lineTo(x + w - 1, y + gh - 1);
  ctx.closePath();
  ctx.fill();
  // Tile courses: staggered dashes climbing toward the ridge (world-anchored).
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  let c = 0;
  for (let yy = y + gh - 5; yy > y + 8; yy -= 5) {
    const t = (yy - y) / gh;
    const hw = t * (w / 2 - 6);
    const x0 = cx - hw;
    const off = ((Math.floor(wx0 / 7) + c) % 2) === 0 ? 0 : 4;
    for (let sx = x0 + off; sx < cx + hw - 2; sx += 8) rect(ctx, sx, yy, 4, 2, "rgba(0,0,0,0.16)");
    c++;
  }
  ctx.fillStyle = "rgba(255,240,210,0.06)";
  ctx.beginPath();
  ctx.moveTo(x + 4, y + gh - 6);
  ctx.lineTo(cx, y + 4);
  ctx.lineTo(x + 10, y + gh - 6);
  ctx.closePath();
  ctx.fill();
  rect(ctx, Math.round(cx - 2), y + gh - 4, 4, 4, ridge);
  rect(ctx, x + 1, y + gh - 2, w - 2, 2, "rgba(0,0,0,0.35)");
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  litWindows: boolean,
  styleVariant: number,
  dx: number,
  dy: number,
): void {
  const ruined = styleVariant >= 6;
  const p = FACADE[((styleVariant % 6) + 6) % 6]!;
  const wx0 = x - dx;
  const wy0 = y - dy;
  const bh = worldHash(1201, wx0, wy0);

  // Silhouette first: 0 industrial/warehouse, 1 storefront, 2 flat block,
  // 3 apartment, 4 pitched shop — from footprint + per-building hash.
  const big = w * h >= 56000;
  const elongated = Math.max(w, h) / Math.min(w, h) > 1.4;
  const type = big ? 0 : elongated ? 1 : bh % 4 === 0 ? 4 : bh % 3 === 0 ? 3 : 2;
  const damage = ruined ? 2 : bh % 9 === 0 ? 1 : 0;
  const boarded = damage > 0 || bh % 7 === 0;
  const barricade = !ruined && bh % 13 === 0;
  const overgrown = !ruined && bh % 15 === 0;

  const rh = Math.min(46, Math.max(24, Math.round(h * 0.28)));
  const wallTop = y + rh;
  const wallH = h - rh;

  // Contact shadow + foundation.
  ctx.fillStyle = "rgba(4,6,5,0.30)";
  ctx.fillRect(x + 4, y + 5, w, h);
  ctx.fillStyle = "rgba(4,6,5,0.12)";
  ctx.fillRect(x + 9, y + 10, w - 4, h - 4);

  // Wall: dark thickness border, inset panel, corner posts, baseboard.
  rect(ctx, x, y, w, h, p.dark);
  rect(ctx, x + 3, wallTop, w - 6, wallH - 3, p.wall);
  rect(ctx, x, wallTop, 3, wallH, "#14161A");
  rect(ctx, x + w - 3, wallTop, 3, wallH, "#14161A");
  rect(ctx, x + 1, y + h - 4, w - 2, 4, "#1A1C20");
  wallTexture(ctx, x + 3, wallTop, w - 6, wallH - 3, p.brick, wx0, wy0 + 300);

  if (damage === 2) {
    // Fire damage: charred wall + soot + a collapsed corner.
    rect(ctx, x + 3, wallTop, w - 6, wallH - 3, "#241C1A");
    ctx.fillStyle = "rgba(10,8,8,0.45)";
    ctx.fillRect(x + 6, wallTop + 4, w - 12, wallH - 10);
    const c1 = worldHash(4401, wx0, wy0);
    const corner = c1 % 4;
    ctx.fillStyle = "#141110";
    if (corner === 0) ctx.fillRect(x + w - 26, y + 2, 22, 26);
    else if (corner === 1) ctx.fillRect(x + 2, y + h - 30, 24, 26);
    else if (corner === 2) ctx.fillRect(x + 2, y + 2, 24, 28);
    else ctx.fillRect(x + w - 28, y + h - 30, 24, 26);
    ctx.fillStyle = "rgba(8,6,6,0.55)";
    for (let sx = x + 26; sx < x + w - 30; sx += 46) {
      const sh = worldHash(4409, sx - dx, y - dy);
      if (sh % 2 === 0) {
        const top = wallTop + 6 + ((sh >> 2) % 10);
        ctx.fillRect(sx + 5, top, 4, wallTop + wallH - 18 - top);
      }
    }
  }

  const winFrame = p.frame;
  const trim = p.trim;
  const winState = (wpx: number, wpy: number): number => {
    const wh = worldHash(8831, wpx, wpy);
    if (damage === 2 || wh % 10 === 0) return 1;
    if (wh % 9 === 0 || wh % 9 === 1) return 2;
    if (wh % 7 === 0) return 3;
    return 0;
  };
  const winLit = (wpx: number, wpy: number, i: number): boolean =>
    litWindows && winState(wpx, wpy) === 0 && i % 3 !== 0;

  if (type === 3) {
    // Apartment: dense framed-window grid + balconies.
    const cols = Math.max(2, Math.floor((w - 26) / 30));
    const rows = Math.max(1, Math.min(2, Math.floor((wallH - 64) / 40)));
    const bw = 22;
    const bhh = 20;
    const gapX = cols > 1 ? (w - 26 - cols * bw) / (cols - 1) : 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = x + 13 + Math.round(c * (bw + gapX));
        const wy2 = wallTop + 14 + r * 40;
        drawWin(ctx, wx, wy2, bw, bhh, winFrame, trim, winLit(wx - dx, wy2 - dy, c + r * cols), winState(wx - dx, wy2 - dy));
      }
    }
    // Balcony rail on a middle apartment window.
    const balcX = x + 13 + Math.round(Math.floor(cols / 2) * (bw + gapX));
    rect(ctx, balcX - 1, wallTop + 36, bw + 2, 2, "#3A3C44");
    for (let bx = balcX - 1; bx < balcX + bw; bx += 5) rect(ctx, bx, wallTop + 33, 2, 5, "#3A3C44");
  } else if (type === 1) {
    // Storefront: wide display windows + faded sign band.
    const winW = Math.min(64, Math.floor((w - 44) / 2));
    const winH = 26;
    const wy2 = y + h - winH - 42;
    drawWin(ctx, x + 14, wy2, winW, winH, winFrame, trim, litWindows && bh % 2 === 0, winState(x + 14 - dx, wy2 - dy));
    drawWin(ctx, x + w - 14 - winW, wy2, winW, winH, winFrame, trim, litWindows && bh % 2 === 1, winState(x + w - 14 - winW - dx, wy2 - dy));
    rect(ctx, x + 8, wallTop + 6, w - 16, 8, "#17191E");
    const sg = worldHash(6331, wx0, wy0);
    if (sg % 2 === 0) {
      ctx.fillStyle = "rgba(150,60,70,0.5)";
      for (let sx = x + 12; sx < x + w - 20; sx += 18) rect(ctx, sx, wallTop + 8, 8, 4, "rgba(150,60,70,0.5)");
    }
  } else if (type === 0) {
    // Industrial / warehouse: small high windows + big roller door.
    const cols = Math.max(2, Math.floor((w - 32) / 36));
    const wy2 = wallTop + 12;
    for (let c = 0; c < cols; c++) {
      const wx = x + 16 + Math.round(c * ((w - 32) / cols));
      drawWin(ctx, wx, wy2, 16, 14, winFrame, trim, litWindows && c % 3 === 1, winState(wx - dx, wy2 - dy));
    }
    const dW = Math.min(46, Math.round(w * 0.32));
    drawDoor(ctx, x + Math.round((w - dW) / 2), y + h - 34, dW, 34, p.frame, boarded ? 1 : damage === 2 ? 2 : 0, true);
  } else {
    // Flat block / pitched shop: 1-2 rows of standard windows.
    const cols = Math.max(2, Math.floor((w - 30) / 34));
    const rows = type === 4 ? 1 : 2;
    const bw = 24;
    const bhh = 22;
    const gapX = cols > 1 ? (w - 30 - cols * bw) / (cols - 1) : 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = x + 15 + Math.round(c * (bw + gapX));
        const wy2 = wallTop + 12 + r * 38;
        drawWin(ctx, wx, wy2, bw, bhh, winFrame, trim, winLit(wx - dx, wy2 - dy, c + r * cols), winState(wx - dx, wy2 - dy));
      }
    }
  }

  // Standard entrance (roller door already handled for industrial).
  if (type !== 0) {
    const dW = Math.max(18, Math.min(26, Math.round(w * 0.15)));
    drawDoor(ctx, x + Math.round((w - dW) / 2), y + h - 32, dW, 32, p.frame, boarded ? 1 : damage === 2 ? 2 : 0, false);
  }

  // ── Roof (drawn over the wall band) ──
  if (type === 4) {
    drawGableRoof(ctx, x, y, w, rh, ROOF_TILE[0]!, ROOF_TILE[1]!, wx0, wy0);
  } else if (type === 0) {
    drawFlatRoof(ctx, x, y, w, rh, ROOF_STEEL[0]!, ROOF_STEEL[1]!, p.light, wx0, wy0, true, true);
  } else {
    drawFlatRoof(ctx, x, y, w, rh, ROOF_FLAT[0]!, ROOF_FLAT[1]!, p.light, wx0, wy0, true);
  }
  if (damage === 2) {
    // Roof hole + debris.
    const hh2 = worldHash(2271, wx0, wy0);
    const hx = x + 12 + ((hh2 >> 3) % Math.max(6, w - 34));
    const hy = y + 6 + ((hh2 >> 6) % Math.max(3, rh - 16));
    ctx.fillStyle = "#0A0C0E";
    ctx.beginPath();
    ctx.arc(hx, hy, 5 + (hh2 % 5), 0, Math.PI * 2);
    ctx.fill();
    px(ctx, hx + 4, hy + 3, "#4A4438", 3);
    px(ctx, hx - 5, hy + 1, "#5E5444", 3);
  }

  if (barricade) {
    // Sandbag row along the base in front of the entrance.
    const sbx = x + Math.round((w - 46) / 2);
    for (let i = 0; i < 3; i++) {
      px(ctx, sbx + i * 16, y + h - 6, "#6E7054", 12);
      px(ctx, sbx + i * 16 + 3, y + h - 6, "#83855F", 6);
    }
  }
  if (overgrown) {
    const side = bh % 3;
    ctx.fillStyle = "rgba(52,96,54,0.65)";
    if (side === 0) {
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(x + 5, wallTop + 10 + i * (wallH * 0.16), 5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (side === 1) {
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(x + w - 5, wallTop + 10 + i * (wallH * 0.16), 5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x + w * 0.82, y + 8 + i * 10, 6 - i, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (bh % 7 === 0 && !ruined) {
    // Graffiti tag on the wall.
    ctx.fillStyle = "rgba(150,60,80,0.5)";
    ctx.fillRect(x + w * 0.22, wallTop + Math.floor(wallH * 0.3), 3, 9);
    ctx.fillRect(x + w * 0.25, wallTop + Math.floor(wallH * 0.3), 3, 9);
    ctx.fillStyle = "rgba(120,170,140,0.45)";
    ctx.fillRect(x + w * 0.18, wallTop + Math.floor(wallH * 0.38), 11, 2);
  }
}

function drawHouse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  litWindows: boolean,
  styleVariant: number,
  dx: number,
  dy: number,
): void {
  const ruined = styleVariant >= 6;
  const sv = ((styleVariant % 4) + 4) % 4;
  const roof = HOUSE_ROOF[sv]!;
  const wall = HOUSE_WALL[sv]!;
  const wx0 = x - dx;
  const wy0 = y - dy;
  const bh = worldHash(1409, wx0, wy0);

  const modern = bh % 4 === 0; // flat-parapet house
  const large = w * h >= 32000; // annex / L-shape
  const damaged = ruined || bh % 11 === 0;
  const boarded = damaged || bh % 7 === 0;
  const barricade = !ruined && bh % 17 === 0;
  const overgrown = !ruined && bh % 13 === 0;

  // Shadow + lawn strip + foundation.
  ctx.fillStyle = "rgba(4,6,5,0.3)";
  ctx.fillRect(x + 4, y + 5, w, h);
  rect(ctx, x - 6, y + h - 2, w + 12, 8, "#3A4030");
  rect(ctx, x - 3, y + h - 3, w + 6, 3, "#2A2C26");

  if (modern) {
    // Flat-roof house: parapet + roof field + two windows + door.
    const rh = Math.min(38, Math.max(22, Math.round(h * 0.24)));
    rect(ctx, x, y, w, h, "#241A14");
    drawFlatRoof(ctx, x, y, w, rh, ROOF_FLAT[0]!, ROOF_FLAT[1]!, "rgba(255,255,255,0.08)", wx0, wy0, false);
    rect(ctx, x + 4, y + rh, w - 8, h - rh - 6, wall);
    rect(ctx, x, y + rh, 3, h - rh, "#1A1410");
    rect(ctx, x + w - 3, y + rh, 3, h - rh, "#1A1410");
    rect(ctx, x + 2, y + h - 4, w - 4, 4, "#1C1E18");
    wallTexture(ctx, x + 4, y + rh, w - 8, h - rh - 6, false, wx0, wy0 + 800);
    const bw = 24;
    const bhh = 22;
    const wy2 = y + rh + 12;
    const stL = boarded ? 1 : damaged ? 2 : worldHash(6643, wx0, wy0) % 6 === 0 ? 3 : 0;
    const stR = boarded ? 1 : damaged ? 2 : worldHash(6650, wx0 + 7, wy0) % 6 === 0 ? 3 : 0;
    drawWin(ctx, x + 12, wy2, bw, bhh, "#14181E", "#4A463A", litWindows && stL === 0 && bh % 2 === 0, stL);
    drawWin(ctx, x + w - 12 - bw, wy2, bw, bhh, "#14181E", "#4A463A", litWindows && stR === 0 && bh % 2 === 1, stR);
    const dW = Math.max(16, Math.min(22, Math.round(w * 0.14)));
    drawDoor(ctx, x + Math.round((w - dW) / 2), y + h - 30, dW, 30, "#1A1410", boarded ? 1 : damaged ? 2 : 0);
  } else {
    // Gable house: roof triangle + wall below + porch door.
    const gh = Math.min(40, Math.max(22, Math.round(h * 0.28)));
    rect(ctx, x, y, w, h, "#241A14");
    drawGableRoof(ctx, x, y, w, gh, roof, "rgba(255,240,210,0.10)", wx0, wy0);
    const chX = Math.round(x + w * (0.5 + (sv % 3) * 0.13));
    rect(ctx, chX, y + 3, 12, 16, "#5C4632");
    rect(ctx, chX - 1, y + 2, 14, 4, "#7A5C3E");
    px(ctx, chX + 2, y + 5, "#3A2A1A", 3);
    rect(ctx, x + 4, y + gh, w - 8, h - gh - 4, wall);
    rect(ctx, x, y + gh, 3, h - gh, "#1A1410");
    rect(ctx, x + w - 3, y + gh, 3, h - gh, "#1A1410");
    rect(ctx, x + 2, y + h - 4, w - 4, 4, "#1C1E18");
    wallTexture(ctx, x + 4, y + gh, w - 8, h - gh - 4, false, wx0, wy0 + 500);
    const bw = 20;
    const bhh = 20;
    const wy2 = y + gh + 12;
    const stL = boarded ? 1 : damaged ? 2 : worldHash(6643, wx0, wy0) % 7 === 0 ? 3 : 0;
    const stR = boarded ? 1 : damaged ? 2 : worldHash(6650, wx0 + 7, wy0) % 7 === 0 ? 3 : 0;
    drawWin(ctx, x + 12, wy2, bw, bhh, "#14181E", "#3A3A2E", litWindows && stL === 0 && bh % 2 === 0, stL);
    drawWin(ctx, x + w - 32, wy2, bw, bhh, "#14181E", "#3A3A2E", litWindows && stR === 0 && bh % 2 === 1, stR);
    if (w > 150) {
      const stS = boarded ? 1 : damaged ? 2 : worldHash(6657, wx0, wy0 + 9) % 5 === 0 ? 3 : 0;
      drawWin(ctx, x + Math.round(w / 2) - 10, y + gh + 34, 20, 16, "#14181E", "#3A3A2E", litWindows && stS === 0, stS);
    }
    const dW = Math.max(15, Math.min(20, Math.round(w * 0.14)));
    const dX = x + Math.round((w - dW) / 2);
    rect(ctx, dX - 7, y + h - 36, dW + 14, 8, roof);
    rect(ctx, dX - 8, y + h - 34, dW + 16, 2, "rgba(0,0,0,0.35)");
    drawDoor(ctx, dX, y + h - 30, dW, 30, "#1A1410", boarded ? 1 : damaged ? 2 : 0);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(dX - 6, y + h - 30, 3, 30);
    ctx.fillRect(dX + dW + 3, y + h - 30, 3, 30);
  }

  if (damaged && !modern) {
    // Roof hole + char/soot streaks.
    const hh2 = worldHash(2271, wx0, wy0);
    const hx = x + 12 + ((hh2 >> 3) % Math.max(6, w - 30));
    ctx.fillStyle = "#12100E";
    ctx.beginPath();
    ctx.arc(hx, y + 14, 6 + (hh2 % 4), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(8,6,6,0.5)";
    for (let sx = x + 22; sx < x + w - 26; sx += 40) {
      const sh = worldHash(5511, sx - dx, y - dy);
      if (sh % 2 === 0) ctx.fillRect(sx, y + 18, 3, Math.max(6, Math.floor(h * 0.3)));
    }
  }

  if (barricade) {
    const sbx = x + Math.round((w - 34) / 2);
    for (let i = 0; i < 2; i++) {
      px(ctx, sbx + i * 18, y + h - 6, "#6E7054", 12);
      px(ctx, sbx + i * 18 + 3, y + h - 6, "#83855F", 6);
    }
  }

  if (overgrown) {
    const side = bh % 3;
    ctx.fillStyle = "rgba(52,96,54,0.7)";
    if (side === 0) {
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(x + 5, y + 16 + i * (h * 0.15), 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (side === 1) {
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(x + w - 5, y + 16 + i * (h * 0.15), 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x + w * 0.8, y + 10 + i * 11, 8 - i, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  if (large) {
    // Annex / garage block at the east side: smaller structure, own roof.
    const aw = Math.min(64, Math.round(w * 0.32));
    const agh = Math.min(22, Math.round(aw * 0.3));
    rect(ctx, x + w - aw, y + 8, aw, h - 16, "#201A14");
    drawGableRoof(ctx, x + w - aw, y + 8, aw, agh, roof, "rgba(255,240,210,0.10)", wx0 + 300, wy0);
    rect(ctx, x + w - aw + 3, y + 8 + agh, aw - 6, h - 16 - agh, wall);
    drawDoor(ctx, x + w - aw + Math.round(aw / 2) - 8, y + h - 24, 16, 24, "#1A1410", 0);
  }
}

// ------------------------------------------------------------- greenery --
function drawTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  styleVariant: number,
): void {
  const dead = styleVariant % 5 === 2;
  const r = w * 0.36;
  const cx = x + w / 2;
  const cy = y + h / 2;

  ctx.fillStyle = "rgba(5,7,6,0.35)";
  ctx.beginPath();
  ctx.arc(cx + 4, cy + 5, r + 4, 0, Math.PI * 2);
  ctx.fill();

  if (dead) {
    // Dead tree: grey trunk + bare branches.
    rect(ctx, cx - 3, cy - r * 0.4, 6, r * 1.1, "#4A453C");
    ctx.strokeStyle = "#57524A";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.2);
    ctx.lineTo(cx - r * 0.8, cy - r * 0.9);
    ctx.moveTo(cx, cy - r * 0.3);
    ctx.lineTo(cx + r * 0.85, cy - r * 0.7);
    ctx.moveTo(cx, cy - r * 0.1);
    ctx.lineTo(cx + r * 0.4, cy - r * 1.1);
    ctx.moveTo(cx, cy - r * 0.2);
    ctx.lineTo(cx - r * 0.4, cy - r * 1.2);
    ctx.stroke();
    ctx.fillStyle = "#2B2722";
    ctx.beginPath();
    ctx.arc(cx - r * 0.3, cy - r * 0.5, 4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  rect(ctx, cx - 4, cy + r * 0.2, 8, r * 0.9, "#241610");
  rect(ctx, cx - 1, cy + r * 0.2, 4, r * 0.7, "#4C321D");
  ctx.fillStyle = "#0F1F14";
  ctx.beginPath();
  ctx.arc(cx + 4, cy + r * 0.3 + 5, r + 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#17301F";
  ctx.beginPath();
  ctx.arc(cx + 2, cy + r * 0.22 + 2, r + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#275A35";
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.2, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3C7545";
  ctx.beginPath();
  ctx.arc(x + w * 0.36, y + h * 0.1, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.beginPath();
  ctx.arc(x + w * 0.34, y + h * 0.08, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

function drawBush(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  styleVariant: number,
): void {
  ctx.fillStyle = "rgba(5,7,6,0.3)";
  ctx.beginPath();
  ctx.arc(x + w / 2 + 3, y + h * 0.62, w * 0.4, 0, Math.PI * 2);
  ctx.fill();
  rect(ctx, x + 4, y + h * 0.82, w - 8, h * 0.18, "#241610");
  const dry = styleVariant % 4 === 1;
  ctx.fillStyle = dry ? "#6A5A30" : "#12291A";
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h * 0.55, w * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dry ? "#84713A" : "#1E4528";
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h * 0.5, w * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dry ? "#9C8642" : "#2F6336";
  ctx.beginPath();
  ctx.arc(x + w * 0.36, y + h * 0.42, w * 0.2, 0, Math.PI * 2);
  ctx.fill();
  if (!dry) {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.arc(x + w * 0.3, y + h * 0.38, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ----------------------------------------------------------- containers --
function drawContainer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  styleVariant: number,
  dx: number,
  dy: number,
): void {
  const vertical = h > w;
  const palettes = [
    ["#356B6C", "#0E2A2C", "#4B8280"],
    ["#7A5A3A", "#2C2014", "#9A7A50"],
    ["#5A5E78", "#20222E", "#7A7E98"],
    ["#4E7446", "#1C3018", "#6E9A62"],
  ];
  const p = palettes[((styleVariant % 4) + 4) % 4]!;

  ctx.fillStyle = "rgba(4,6,5,0.26)";
  ctx.fillRect(x + 4, y + 5, w, h);
  rect(ctx, x, y, w, h, p[1]);
  rect(ctx, x + 3, y + 3, w - 6, h - 6, p[0]);
  rect(ctx, x + 3, y + 3, w - 6, 5, p[2]);

  // Corrugated ribs (along the short axis) + rust streaks.
  const along = vertical ? w : h;
  const across = vertical ? h : w;
  const ribGap = 15;
  const nRib = Math.floor((across - 8) / ribGap);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  for (let i = 1; i <= nRib; i++) {
    const off = 3 + i * ribGap;
    if (vertical) rect(ctx, x + 3, y + off, w - 6, 2, "rgba(0,0,0,0.22)");
    else rect(ctx, x + off, y + 3, 2, h - 6, "rgba(0,0,0,0.22)");
  }
  // Steel texture flecks along the ribs.
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < along / 12; i++) {
    const hh = worldHash(9101 + i, x - dx, y - dy);
    const offA = 6 + (hh % Math.max(1, across - 12));
    const offB = 5 + ((hh >> 6) % Math.max(1, along - 10));
    if (vertical) px(ctx, x + offA, y + offB, "#FFFFFF", 2);
    else px(ctx, x + offB, y + offA, "#FFFFFF", 2);
  }
  // Corner castings + door hardware.
  px(ctx, x + 2, y + 2, "#9A552D", 5);
  px(ctx, x + w - 7, y + 2, "#9A552D", 5);
  px(ctx, x + 2, y + h - 7, "#9A552D", 5);
  px(ctx, x + w - 7, y + h - 7, "#9A552D", 5);
  ctx.fillStyle = "rgba(90,50,20,0.4)";
  if (vertical) {
    rect(ctx, x + 6, y + h - 16, w - 12, 3, "rgba(90,50,20,0.4)");
    rect(ctx, x + w / 2 - 1, y + 8, 2, h - 16, "rgba(0,0,0,0.25)");
  } else {
    rect(ctx, x + w - 16, y + 6, 3, h - 12, "rgba(90,50,20,0.4)");
    rect(ctx, x + 8, y + h / 2 - 1, w - 16, 2, "rgba(0,0,0,0.25)");
  }
  ctx.strokeStyle = "#0C1F21";
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
}

// ----------------------------------------------------------------- props --
function drawCrate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  styleVariant: number,
): void {
  ctx.fillStyle = "rgba(5,7,6,0.3)";
  ctx.fillRect(x + 3, y + 4, w, h);
  const military = styleVariant % 4 === 1;
  const c = military ? "#5A6A4A" : "#8A6237";
  rect(ctx, x, y, w, h, c);
  // Planks + nails.
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(x, y + h * 0.34, w, 2);
  ctx.fillRect(x, y + h * 0.68, w, 2);
  px(ctx, x + 2, y + 2, "rgba(0,0,0,0.5)", 2);
  px(ctx, x + w - 4, y + 2, "rgba(0,0,0,0.5)", 2);
  ctx.strokeStyle = military ? "#39452E" : "#4F341F";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 4, y + 4);
  ctx.lineTo(x + w - 4, y + h - 4);
  ctx.moveTo(x + w - 4, y + 4);
  ctx.lineTo(x + 4, y + h - 4);
  ctx.stroke();
  if (military) {
    // Stencil marking.
    ctx.fillStyle = "rgba(220,220,190,0.4)";
    ctx.fillRect(x + 5, y + h * 0.4, w * 0.4, 2);
    ctx.fillRect(x + 5, y + h * 0.44, w * 0.28, 2);
  }
  ctx.strokeStyle = "#3C2C18";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

function drawBarricade(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  styleVariant: number,
): void {
  const vertical = h > w;
  const horiz = !vertical;
  ctx.fillStyle = "rgba(5,7,6,0.35)";
  ctx.fillRect(x + 3, y + 4, w, h);
  // Legs / base.
  ctx.fillStyle = "#3A3E48";
  if (horiz) {
    rect(ctx, x + 4, y + h - 5, w - 8, 5, "#3A3E48");
    rect(ctx, x + 6, y + 2, 5, h - 4, "#3A3E48");
    rect(ctx, x + w - 11, y + 2, 5, h - 4, "#3A3E48");
  } else {
    rect(ctx, x, y + 4, 5, h - 8, "#3A3E48");
    rect(ctx, x + w - 5, y + 4, 5, h - 8, "#3A3E48");
    rect(ctx, x + 2, y + 6, w - 4, 5, "#3A3E48");
    rect(ctx, x + 2, y + h - 11, w - 4, 5, "#3A3E48");
  }
  // Chevron stripes.
  ctx.fillStyle = "#C8A028";
  if (horiz) {
    for (let i = -h; i < w; i += 24) {
      ctx.beginPath();
      ctx.moveTo(x + i, y + h);
      ctx.lineTo(x + i + 12, y + h);
      ctx.lineTo(x + i + h + 12, y);
      ctx.lineTo(x + i + h, y);
      ctx.closePath();
      ctx.fill();
    }
    rect(ctx, x + 4, y + h - 8, w - 8, 3, "#6E6E70");
  } else {
    for (let i = -w; i < h; i += 24) {
      ctx.beginPath();
      ctx.moveTo(x + w, y + i);
      ctx.lineTo(x + w, y + i + 12);
      ctx.lineTo(x, y + i + w + 12);
      ctx.lineTo(x, y + i + w);
      ctx.closePath();
      ctx.fill();
    }
    rect(ctx, x + w - 8, y + 4, 3, h - 8, "#6E6E70");
  }
  ctx.strokeStyle = "#23262E";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

function drawBarrel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  styleVariant: number,
): void {
  const c = ((styleVariant % 4) + 4) % 4;
  const body = c === 0 ? "#A63B32" : c === 1 ? "#3F6B3C" : c === 2 ? "#8A8A8E" : "#C26A20";
  ctx.fillStyle = "rgba(5,7,6,0.35)";
  ctx.fillRect(x + 3, y + 4, w, h);
  rect(ctx, x, y, w, h, "#1A1410");
  rect(ctx, x + 2, y + 2, w - 4, h - 4, body);
  rect(ctx, x + 2, y + h * 0.28, w - 4, 3, "rgba(0,0,0,0.35)");
  rect(ctx, x + 2, y + h * 0.6, w - 4, 3, "rgba(255,255,255,0.14)");
  rect(ctx, x + w * 0.18, y + 3, 3, h - 6, "rgba(0,0,0,0.18)");
  rect(ctx, x + w * 0.7, y + 3, 3, h - 6, "rgba(0,0,0,0.18)");
  rect(ctx, x + 4, y + 2, w - 8, 4, "rgba(255,255,255,0.12)");
  // Hazard label stripe.
  if (c === 0 || c === 3) {
    ctx.fillStyle = "rgba(255,230,150,0.5)";
    ctx.fillRect(x + 5, y + h * 0.42, w - 10, 2);
  }
}

function drawHydrant(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = "rgba(5,7,6,0.35)";
  ctx.fillRect(x + 3, y + 4, w, h);
  rect(ctx, x, y, w, h, "#101014");
  rect(ctx, x + 2, y + h - 6, w - 4, 6, "#8E3A2E");
  rect(ctx, x + 5, y + 6, w - 10, h - 12, "#C04736");
  rect(ctx, x + 2, y + 8, w - 4, 7, "#8E3A2E");
  px(ctx, x + w / 2 - 2, y + h - 9, "#E8CE80", 4);
  rect(ctx, x + 5, y, 2, 7, "#E8CE80");
}

function drawDumpster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  dx: number,
  dy: number,
): void {
  ctx.fillStyle = "rgba(5,7,6,0.35)";
  ctx.fillRect(x + 3, y + 4, w, h);
  rect(ctx, x, y, w, h, "#10151B");
  rect(ctx, x + 2, y + 3, w - 4, h - 8, "#2E4A38");
  rect(ctx, x + 2, y + 3, w - 4, 5, "#3F644A");
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  for (let sx = x + 8; sx < x + w - 8; sx += 14) rect(ctx, sx, y + 8, 2, h - 16, "rgba(0,0,0,0.25)");
  // Lid lip + latch + overfill.
  rect(ctx, x + 3, y + h - 13, w - 6, 4, "#1C2E22");
  rect(ctx, x + 8, y + 3, 4, 2, "#0E1512");
  const hh = worldHash(8021, x - dx, y - dy);
  if (hh % 3 === 0) {
    ctx.fillStyle = "#4A4A44";
    px(ctx, x + 10, y + h - 9, "#6E6E66", 4);
    px(ctx, x + 16, y + h - 11, "#5A5A52", 4);
  }
  ctx.strokeStyle = "#0A0D0F";
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
}

function drawRubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  _sv: number,
  dx: number,
  dy: number,
): void {
  ctx.fillStyle = "rgba(5,7,6,0.3)";
  ctx.fillRect(x + 2, y + 3, w, h);
  // Broken wall fragment + debris mound.
  ctx.fillStyle = "#5E5144";
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.5);
  ctx.lineTo(x + w * 0.2, y);
  ctx.lineTo(x + w * 0.32, y);
  ctx.lineTo(x + w * 0.4, y + h * 0.4);
  ctx.lineTo(x + w * 0.7, y + h * 0.2);
  ctx.lineTo(x + w, y + h * 0.4);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#463B30";
  ctx.beginPath();
  ctx.moveTo(x + w * 0.2, y + 6);
  ctx.lineTo(x + w * 0.34, y + 10);
  ctx.lineTo(x + w * 0.28, y + h);
  ctx.lineTo(x + w * 0.1, y + h * 0.7);
  ctx.closePath();
  ctx.fill();
  // Brick chunks + rebar.
  const n = Math.floor((w * h) / 900) + 3;
  for (let i = 0; i < n; i++) {
    const hh = worldHash(9317 + i, x - dx, y - dy);
    const bx = x + (hh % Math.max(1, w - 12));
    const by = y + h * 0.55 + ((hh >> 5) % Math.max(1, h * 0.45 - 8));
    ctx.fillStyle = hh % 3 === 0 ? "#7A5A48" : hh % 3 === 1 ? "#6E6E68" : "#59402E";
    ctx.fillRect(bx, by, 7 + (hh % 5), 5);
  }
  ctx.strokeStyle = "#8A6A4A";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.42, y + 14);
  ctx.lineTo(x + w * 0.46, y + h * 0.5);
  ctx.moveTo(x + w * 0.55, y + h * 0.4);
  ctx.lineTo(x + w * 0.58, y + h * 0.72);
  ctx.stroke();
}

function drawMailbox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  dx: number,
  dy: number,
): void {
  ctx.fillStyle = "rgba(5,7,6,0.35)";
  ctx.fillRect(x + 2, y + 3, w, h);
  rect(ctx, x + 1, y + h - 5, w - 2, 5, "#3A4044");
  rect(ctx, x + 2, y + h - 9, w - 4, 4, "#55606A");
  // Post.
  rect(ctx, x + w / 2 - 2, y + 2, 4, h - 5, "#4C5248");
  const hh = worldHash(5401, x - dx, y - dy);
  rect(ctx, x, y, w, h * 0.55, hh % 2 === 0 ? "#2E6EA8" : "#A23A34");
  rect(ctx, x + 2, y + 2, w - 4, 3, hh % 2 === 0 ? "#57A0D8" : "#D0655E");
}

function drawBench(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = "rgba(5,7,6,0.3)";
  ctx.fillRect(x + 2, y + 3, w, h);
  rect(ctx, x + 2, y + h - 6, w - 4, 6, "#33393C");
  rect(ctx, x + 4, y + 2, w - 8, h - 8, "#5C4A30");
  ctx.fillStyle = "#3C2E1C";
  for (let sx = x + 5; sx < x + w - 5; sx += 5) rect(ctx, sx, y + 2, 2, h - 8, "#3C2E1C");
  rect(ctx, x + 3, y + 2, w - 6, 2, "#7A6240");
}

function drawCart(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const vertical = h > w;
  ctx.fillStyle = "rgba(5,7,6,0.35)";
  ctx.fillRect(x + 2, y + 3, w, h);
  rect(ctx, x, y, w, h, "#131518");
  // Basket wireframe.
  ctx.strokeStyle = "#5A6166";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 2, y + 3, w - 4, h - 8);
  ctx.beginPath();
  if (vertical) {
    for (let lx = x + 5; lx < x + w - 4; lx += 5) {
      ctx.moveTo(lx, y + 3);
      ctx.lineTo(lx, y + h - 5);
    }
  } else {
    for (let ly = y + 5; ly < y + h - 4; ly += 5) {
      ctx.moveTo(x + 2, ly);
      ctx.lineTo(x + w - 2, ly);
    }
  }
  ctx.stroke();
  // Wheels.
  px(ctx, x + 2, y + h - 6, "#0B0B0E", 5);
  px(ctx, x + w - 7, y + h - 6, "#0B0B0E", 5);
  px(ctx, x + 2, y + 2, "#0B0B0E", 4);
  px(ctx, x + w - 6, y + 2, "#0B0B0E", 4);
}

/** Town-square centrepiece: a small stone fountain with a statue pedestal. */
function drawMonument(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) / 2;
  ctx.fillStyle = "rgba(4,6,5,0.32)";
  ctx.beginPath();
  ctx.arc(cx + 3, cy + 4, r + 3, 0, Math.PI * 2);
  ctx.fill();
  // Stone rim.
  ctx.fillStyle = "#6E6A5E";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4A4638";
  ctx.beginPath();
  ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
  ctx.fill();
  // Still water pool + a soft highlight.
  ctx.fillStyle = "rgba(70,120,140,0.55)";
  ctx.beginPath();
  ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(190,224,232,0.25)";
  ctx.beginPath();
  ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  // Pedestal + statue silhouette.
  rect(ctx, cx - 4, cy - r * 0.55, 8, r * 0.95, "#8A8674");
  rect(ctx, cx - 7, cy - r * 0.6, 14, 6, "#9A9684");
  ctx.fillStyle = "#565244";
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.78, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#332F26";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

// -------------------------------------------------------------- vehicles --
function drawVehicle(
  ctx: CanvasRenderingContext2D,
  kind: string,
  x: number,
  y: number,
  w: number,
  h: number,
  styleVariant: number,
): void {
  const body = VEHICLE_BODY[kind] ?? "#8C2C2C";
  const dark = VEHICLE_DARK[kind] ?? "#5A1E1E";
  const L = Math.max(w, h);
  const S = Math.min(w, h);

  // Parking-lane shadow always aligned with the footprint.
  ctx.fillStyle = "rgba(4,6,5,0.3)";
  ctx.fillRect(x + 4, y + 5, w, h);

  ctx.save();
  ctx.translate(Math.round(x + w / 2), Math.round(y + h / 2));
  if (w < h) ctx.rotate(Math.PI / 2);
  // Local: long axis = X, centred on origin, front toward +X.
  const facing = (styleVariant & 1) === 0;
  if (!facing) ctx.rotate(Math.PI);
  const halfL = L / 2;
  const halfS = S / 2;

  // Tyres (four).
  ctx.fillStyle = "#0B0B0E";
  const wheelW = Math.max(3, S * 0.22);
  ctx.fillRect(-halfL + 5, -halfS, wheelW, 4);
  ctx.fillRect(halfL - 5 - wheelW, -halfS, wheelW, 4);
  ctx.fillRect(-halfL + 5, halfS - 4, wheelW, 4);
  ctx.fillRect(halfL - 5 - wheelW, halfS - 4, wheelW, 4);
  // Outer shadow under body.
  ctx.fillRect(-halfL, -halfS + 2, L, S - 4);

  const isBus = kind === "bus";
  const isVan = kind === "van";
  const isPolice = kind === "car_police";
  const isWreck = kind === "wreck";
  const inset = Math.max(2, S * 0.08);

  // Body.
  rect(ctx, -halfL + 3, -halfS + inset, L - 6, S - inset * 2, body);
  rect(ctx, -halfL + 3, -halfS + inset, L - 6, 3, dark);
  // Hood seam + trunk line.
  rect(ctx, halfL * 0.12, -halfS + inset, 2, S - inset * 2, dark);
  rect(ctx, -halfL * 0.34, -halfS + inset, 2, S - inset * 2, dark);
  // Door line.
  rect(ctx, -halfL * 0.06, -halfS + inset, 1.5, S - inset * 2, "rgba(0,0,0,0.3)");

  const gl = "#2C4A56";
  const gh = "#9DBFC8";

  if (isBus) {
    // Bus: long roof, two roof AC units + skylight strip, big windshield.
    rect(ctx, -halfL * 0.16, -halfS + inset, L * 0.16, 4, "rgba(255,255,255,0.18)");
    rect(ctx, halfL * 0.3, -halfS + inset + 2, S * 0.6, 4, "#7E6A28");
    rect(ctx, halfL * 0.32, -halfS + inset + 2, S * 0.6, 2, "#5C4E1E");
    rect(ctx, -halfL * 0.72, -halfS + inset + 2, S * 0.6, 4, "#7E6A28");
    // Windshield band near front.
    const winX = halfL - 3 - L * 0.14;
    rect(ctx, winX, -halfS + inset + 2, L * 0.12, S - inset * 2 - 4, gl);
    rect(ctx, winX, -halfS + inset + 3, L * 0.12, 3, gh);
    // Skylight.
    rect(ctx, -halfL * 0.6, -2, L * 0.34, 4, "rgba(190,220,230,0.35)");
  } else if (isVan) {
    // Van: short nose + big cargo box; side windows only on the cab.
    rect(ctx, halfL * 0.1, -halfS + inset, 2, S - inset * 2, dark);
    rect(ctx, halfL - 3 - L * 0.18, -halfS + inset + 2, L * 0.14, S - inset * 2 - 4, gl);
    rect(ctx, halfL - 3 - L * 0.18, -halfS + inset + 3, L * 0.14, 3, gh);
    // Sliding-door rail.
    rect(ctx, -halfL * 0.2, halfS - inset - 3, L * 0.5, 1.5, "rgba(0,0,0,0.35)");
  } else if (isWreck) {
    // Burned-out car: no glass, charred roof, rust + soot.
    rect(ctx, -halfL + 4, -halfS + inset + 2, L - 8, S - inset * 2 - 4, "#241E1A");
    ctx.fillStyle = "#141110";
    ctx.fillRect(-halfL * 0.42, -halfS + inset + 4, L * 0.84, S - inset * 2 - 8);
    ctx.fillStyle = "rgba(90,50,25,0.5)";
    ctx.fillRect(halfL * 0.1, halfS - inset - 2, L * 0.14, 3);
    ctx.fillRect(-halfL * 0.3, -halfS + inset + 1, L * 0.12, 2);
    px(ctx, -halfL * 0.1, -halfS + inset + 4, "#5E4326", 3);
    px(ctx, halfL * 0.24, -halfS + inset + 6, "#6E4A2A", 3);
  } else {
    // Sedan glass: windshield, roof side glass and rear window.
    const gx = -halfL * 0.28;
    const gw = L * 0.52;
    rect(ctx, gx, -halfS + inset + 2, gw, S - inset * 2 - 4, gl);
    rect(ctx, gx + 2, -halfS + inset + 3, gw - 4, 3, gh);
    // Roof pillar shading.
    rect(ctx, gx + gw * 0.24, -halfS + inset + 2, 2, S - inset * 2 - 4, "rgba(0,0,0,0.25)");
  }

  // Head + tail lights.
  if (!isWreck) {
    if (isPolice) {
      // Lightbar on the roof.
      rect(ctx, -L * 0.12, -halfS - 1, L * 0.16, S * 0.28, "#1C1E26");
      rect(ctx, -L * 0.12 + 2, -halfS, L * 0.05, S * 0.28, "#D8403E");
      rect(ctx, -L * 0.05, -halfS, L * 0.05, S * 0.28, "#3E6ED8");
    }
    ctx.fillStyle = "#E5D071";
    rect(ctx, halfL - 6, -halfS + inset + 1, 4, 2, "#E5D071");
    rect(ctx, halfL - 6, halfS - inset - 3, 4, 2, "#E5D071");
    ctx.fillStyle = "#C84643";
    rect(ctx, -halfL + 2, -halfS + inset + 1, 4, 2, "#C84643");
    rect(ctx, -halfL + 2, halfS - inset - 3, 4, 2, "#C84643");
  }
  ctx.restore();
}
