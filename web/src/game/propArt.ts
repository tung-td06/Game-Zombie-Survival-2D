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
  | "cart";

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
): void {
  getPixelArtAtlas(ctx);
  if (kind === "border") return drawBorder(ctx, x, y, w, h, styleVariant);
  if (kind === "building") return drawBuilding(ctx, x, y, w, h, litWindows, styleVariant);
  if (kind === "house") return drawHouse(ctx, x, y, w, h, litWindows, styleVariant);
  if (kind === "tree") return drawTree(ctx, x, y, w, h, styleVariant);
  if (kind === "bush") return drawBush(ctx, x, y, w, h, styleVariant);
  if (kind === "container") return drawContainer(ctx, x, y, w, h, styleVariant);
  if (kind === "crate") return drawCrate(ctx, x, y, w, h, styleVariant);
  if (kind === "barricade") return drawBarricade(ctx, x, y, w, h, styleVariant);
  if (kind === "barrel") return drawBarrel(ctx, x, y, w, h, styleVariant);
  if (kind === "hydrant") return drawHydrant(ctx, x, y, w, h);
  if (kind === "dumpster") return drawDumpster(ctx, x, y, w, h);
  if (kind === "rubble") return drawRubble(ctx, x, y, w, h, styleVariant);
  if (kind === "mailbox") return drawMailbox(ctx, x, y, w, h);
  if (kind === "bench") return drawBench(ctx, x, y, w, h);
  if (kind === "cart") return drawCart(ctx, x, y, w, h);
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
    const hh = worldHash(6011, vertical ? x : s, vertical ? s : y);
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
    const hh = worldHash(6023 + i, x, y);
    const dx = x + (hh % Math.max(1, w - 6));
    const dy = y + ((hh >> 4) % Math.max(1, h - 6));
    px(ctx, dx, dy, hh % 5 === 0 ? "#46301A" : "#111310", 3);
  }
}

// ------------------------------------------------------------- buildings --
function drawBuilding(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  litWindows: boolean,
  styleVariant: number,
): void {
  const ruined = styleVariant >= 6;
  const p = FACADE[((styleVariant % 6) + 6) % 6]!;

  // Soft two-stage drop shadow (SE light) — light enough to never read as a
  // second overlapping object on the ground beside the footprint.
  ctx.fillStyle = "rgba(4,6,5,0.28)";
  ctx.fillRect(x + 5, y + 6, w, h);
  ctx.fillStyle = "rgba(4,6,5,0.12)";
  ctx.fillRect(x + 9, y + 10, w - 4, h - 4);

  // Concrete apron in front of the façade + side skirt.
  rect(ctx, x - 3, y + h - 4, w + 6, 10, "#3C3E38");
  rect(ctx, x - 4, y + h - 4, 3, 10, "#2E302B");
  rect(ctx, x + w + 1, y + h - 4, 3, 10, "#2E302B");

  // Wall.
  rect(ctx, x, y, w, h, p.dark);
  rect(ctx, x + 4, y + 4, w - 8, h - 8, p.wall);

  if (p.brick) {
    // Brick coursing: horizontal mortar lines + staggered vertical joints.
    ctx.fillStyle = "rgba(20,10,8,0.20)";
    for (let yy = y + 12; yy < y + h - 14; yy += 6) rect(ctx, x + 5, yy, w - 10, 1, "rgba(20,10,8,0.20)");
    ctx.fillStyle = "rgba(255,235,210,0.05)";
    for (let yy = y + 8; yy < y + h - 18; yy += 6) {
      let off = Math.floor((yy - y) / 6) % 2 === 0 ? 0 : 4;
      for (let xx = x + 8 + off; xx < x + w - 10; xx += 9) {
        rect(ctx, xx, yy, 2, 2, "rgba(255,235,210,0.05)");
      }
    }
  } else if (p.skylight) {
    // Warehouse roof: corrugation + skylight bands.
    ctx.fillStyle = "rgba(10,14,18,0.22)";
    for (let sx = x + 8; sx < x + w - 8; sx += 10) rect(ctx, sx, y + 6, 2, h - 12, "rgba(10,14,18,0.22)");
    ctx.fillStyle = "rgba(190,214,224,0.16)";
    for (let sx = x + 20; sx < x + w - 24; sx += 52) rect(ctx, sx, y + 8, 34, 3, "rgba(190,214,224,0.16)");
  }

  // Roof parapet + lip highlight.
  rect(ctx, x, y, w, 9, p.dark);
  rect(ctx, x, y + 8, w, 2, p.light);
  // Roof equipment (AC / vents / pipes) with deterministic spacing.
  const roofStep = Math.max(72, Math.min(110, w / 4));
  for (let rx = x + 24; rx < x + w - 24; rx += roofStep) {
    const rv = worldHash(3037, rx, y);
    if (rv % 2 === 0) {
      const ux = rx + (rv % 14);
      const uh = 9 + ((rv >> 3) % 4);
      rect(ctx, ux, y - uh + 5, 17, uh, "#93939E");
      rect(ctx, ux + 2, y - uh + 7, 13, 3, "#B4B4BE");
      rect(ctx, ux + 6, y - uh + 7, 5, 2, "#5C5C66");
    }
    if (rv % 5 === 0) {
      rect(ctx, rx + 20, y + 3, 4, 5, "#6A6A74");
      rect(ctx, rx + 21, y - 2, 2, 5, "#8A8A94");
    }
  }

  if (ruined) {
    // Fire damage: charred sections, soot above windows, collapsed corner.
    rect(ctx, x + 4, y + 4, w - 8, h - 8, "#241C1A");
    ctx.fillStyle = "rgba(10,8,8,0.5)";
    ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
    const c1 = worldHash(4401, x, y);
    const corner = c1 % 4;
    ctx.fillStyle = "#141110";
    if (corner === 0) ctx.fillRect(x + w - 24, y + 4, 20, 24);
    else if (corner === 1) ctx.fillRect(x + 4, y + h - 28, 22, 24);
    else if (corner === 2) ctx.fillRect(x + 4, y + 4, 22, 26);
    else ctx.fillRect(x + w - 26, y + h - 28, 22, 24);
    // Soot streaks rising from lower windows.
    ctx.fillStyle = "rgba(8,6,6,0.55)";
    for (let sx = x + 26; sx < x + w - 30; sx += 46) {
      const sh = worldHash(4409, sx, y);
      if (sh % 2 === 0) {
        const top = y + 12 + ((sh >> 2) % 12);
        ctx.fillRect(sx + 5, top, 4, y + h - 20 - top);
      }
    }
  }

  ctx.strokeStyle = p.frame;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);

  // Windows: dark / warm lit / boarded / broken, all world-anchored.
  const cols = Math.max(2, Math.floor((w - 36) / 32));
  const startX = x + (w - (cols * 32 - 2)) / 2;
  let row = 0;
  for (let wy = y + 20; wy < y + h - 40; wy += 34) {
    for (let c = 0; c < cols; c++) {
      const wx = startX + c * 32;
      const wh = worldHash(8831, wx, wy);
      const lit = litWindows && (c + row) % 3 !== 0;
      const state = wh % 10;
      // Frame + sill.
      rect(ctx, wx, wy, 18, 20, p.frame);
      if (ruined || state === 0) {
        // Boarded over.
        rect(ctx, wx + 2, wy + 2, 14, 16, "#33291C");
        rect(ctx, wx + 3, wy + 3, 12, 3, "#4A3C28");
        rect(ctx, wx + 3, wy + 8, 12, 3, "#4A3C28");
        rect(ctx, wx + 3, wy + 13, 12, 3, "#4A3C28");
        rect(ctx, wx + 2, wy + 2, 2, 16, "#241B10");
      } else if (state === 1 || state === 2) {
        // Broken: dark hole + glass shards at the sill.
        rect(ctx, wx + 2, wy + 2, 14, 16, "#0B0E14");
        px(ctx, wx + 3, wy + 15, "#9DB8C2", 3);
        px(ctx, wx + 8, wy + 16, "#C3D6DC", 2);
        px(ctx, wx + 12, wy + 14, "#7E9AA6", 2);
        rect(ctx, wx + 7, wy + 3, 2, 12, "#171B22");
      } else {
        rect(ctx, wx + 2, wy + 2, 14, 16, lit ? "#C9A34E" : "#161A22");
        if (lit) {
          rect(ctx, wx + 3, wy + 3, 12, 4, "#E8CE80");
          rect(ctx, wx + 3, wy + 8, 12, 1, "#B98F3E");
          rect(ctx, wx + 9, wy + 3, 1, 13, "#B98F3E");
        } else {
          rect(ctx, wx + 2, wy + 2, 14, 3, "#22262E");
          rect(ctx, wx + 7, wy + 3, 2, 13, "#1B1F28");
        }
      }
      rect(ctx, wx - 1, wy + 18, 20, 2, p.trim);
      // Soot/grime under sills on ruined facades.
      if (ruined) rect(ctx, wx + 1, wy + 19, 16, 3, "rgba(8,6,6,0.5)");
    }
    row++;
  }

  // Entrance: recessed door + step. Some get an awning / crates / graffiti.
  const dW = Math.max(16, Math.min(26, w * 0.18));
  const dX = x + (w - dW) / 2;
  rect(ctx, dX - 2, y + h - 26, dW + 4, 26, p.frame);
  rect(ctx, dX, y + h - 24, dW, 22, "#121419");
  rect(ctx, dX + 2, y + h - 22, dW - 4, 18, "#1C1E26");
  rect(ctx, dX + dW - 7, y + h - 15, 2, 7, "#C9A34E");
  rect(ctx, dX - 3, y + h - 3, dW + 6, 3, p.trim);
  const dh = worldHash(4477, x, y);
  if (dh % 5 === 0) {
    // Canvas awning over the door.
    rect(ctx, dX - 7, y + h - 34, dW + 14, 10, "#4E6E8E");
    for (let a = dX - 7; a < dX + dW + 7; a += 10) {
      rect(ctx, a, y + h - 34, 5, 10, "#8EB6D6");
    }
    rect(ctx, dX - 8, y + h - 25, dW + 16, 3, "rgba(0,0,0,0.35)");
  }
  if (ruined || dh % 9 === 0) {
    // Rubble / supply stack by the door.
    px(ctx, dX + dW + 6, y + h - 12, "#6E6250", 4);
    px(ctx, dX + dW + 12, y + h - 16, "#80725C", 5);
    px(ctx, dX + dW + 8, y + h - 20, "#5A5042", 4);
    px(ctx, dX - 12, y + h - 10, "#74684F", 4);
  }
  if (dh % 7 === 0) {
    // Graffiti tags on the wall.
    ctx.fillStyle = "rgba(150,60,80,0.55)";
    ctx.fillRect(x + w * 0.24, y + h * 0.3, 3, 10);
    ctx.fillRect(x + w * 0.27, y + h * 0.3, 3, 10);
    ctx.fillStyle = "rgba(120,170,140,0.5)";
    ctx.fillRect(x + w * 0.2, y + h * 0.38, 12, 2);
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
): void {
  const ruined = styleVariant >= 6;
  const sv = ((styleVariant % 4) + 4) % 4;
  const roof = HOUSE_ROOF[sv]!;
  const wall = HOUSE_WALL[sv]!;

  // Shadow + lawn strip.
  ctx.fillStyle = "rgba(4,6,5,0.3)";
  ctx.fillRect(x + 4, y + 5, w, h);
  rect(ctx, x - 6, y + h - 2, w + 12, 8, "#3A4030");

  rect(ctx, x, y, w, h, "#241A14");
  rect(ctx, x + 4, y + 12, w - 8, h - 16, wall);

  // Roof (gable) with eaves shadow + tile rows.
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(x + 1, y + 22);
  ctx.lineTo(x + w / 2, y + 1);
  ctx.lineTo(x + w - 1, y + 22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  for (let sx = x + 12; sx < x + w - 10; sx += 8) {
    const sy = y + 17 - Math.abs(sx - (x + w / 2)) * 0.26;
    ctx.fillRect(sx, sy, 5, 2);
  }
  // Roof highlight edge.
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.beginPath();
  ctx.moveTo(x + 2, y + 21);
  ctx.lineTo(x + w / 2, y + 3);
  ctx.lineTo(x + w / 2 + 8, y + 3);
  ctx.lineTo(x + 9, y + 21);
  ctx.closePath();
  ctx.fill();
  const chX = x + w * (0.55 + ((sv % 3) * 0.14));
  rect(ctx, chX, y + 5, 13, 15, "#5C4632");
  rect(ctx, chX - 1, y + 3, 15, 5, "#7A5C3E");
  rect(ctx, chX + 3, y + 6, 3, 3, "#3A2A1A");
  rect(ctx, x + 2, y + h * 0.66, w - 4, 2, "rgba(0,0,0,0.22)");

  if (ruined) {
    // Burnt-out house: sagging roof hole + charred wall.
    rect(ctx, x + 4, y + 14, w - 8, h - 18, "#2E241E");
    ctx.fillStyle = "#151210";
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.4, Math.min(w, h) * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(8,6,6,0.5)";
    for (let sx = x + 20; sx < x + w - 24; sx += 40) {
      const sh = worldHash(5511, sx, y);
      if (sh % 2 === 0) ctx.fillRect(sx, y + 18, 3, h * 0.5);
    }
  }

  // Windows: two front + optional side window.
  const wins: Array<[number, number]> = [
    [x + 14, y + h * 0.46],
    [x + w - 28, y + h * 0.46],
  ];
  if (w > 150) wins.push([x + w * 0.5 - 7, y + h * 0.2]);
  for (let i = 0; i < wins.length; i++) {
    const [wx, wy] = wins[i]!;
    const wh = worldHash(6643 + i * 7, wx, wy);
    const lit = litWindows && wh % 3 !== 0;
    rect(ctx, wx, wy, 14, 14, "#14181E");
    if (ruined || wh % 5 === 0) {
      rect(ctx, wx + 1, wy + 1, 12, 12, "#241B10");
      rect(ctx, wx + 2, wy + 2, 10, 2, "#4A3C28");
      rect(ctx, wx + 2, wy + 7, 10, 2, "#4A3C28");
    } else {
      rect(ctx, wx + 1, wy + 1, 12, 12, lit ? "#C2A055" : "#11151C");
      if (lit) {
        rect(ctx, wx + 3, wy + 3, 4, 2, "#E2C97C");
        rect(ctx, wx + 8, wy + 3, 3, 2, "#A98C45");
      } else {
        rect(ctx, wx + 2, wy + 2, 10, 2, "#1E232C");
      }
    }
    rect(ctx, wx - 1, wy + 13, 16, 2, "rgba(0,0,0,0.4)");
    rect(ctx, wx - 1, wy + 14, 16, 1, "rgba(255,255,255,0.06)");
  }

  // Door + covered porch.
  const dW = Math.max(15, Math.min(20, w * 0.15));
  const dX = x + (w - dW) / 2;
  rect(ctx, dX - 6, y + h - 34, dW + 12, 34, "#3A2A20");
  rect(ctx, dX - 6, y + h - 38, dW + 12, 6, roof);
  rect(ctx, dX - 7, y + h - 33, dW + 14, 2, "rgba(0,0,0,0.35)");
  rect(ctx, dX, y + h - 30, dW, 30, "#241A16");
  rect(ctx, dX + 2, y + h - 28, dW - 4, 22, "#3A2418");
  rect(ctx, dX + dW - 6, y + h - 18, 2, 6, "#C9A34E");
  rect(ctx, dX - 3, y + h - 4, dW + 6, 4, "#5A5648");
  // Porch post shadows.
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(dX - 5, y + h - 34, 3, 30);
  ctx.fillRect(dX + dW + 2, y + h - 34, 3, 30);

  // Ivy / overgrowth creeping up a corner (never near the door).
  const iv = worldHash(7713, x, y);
  if (iv % 2 === 0) {
    const side = iv % 3 === 0 ? "left" : iv % 3 === 1 ? "right" : "roof";
    ctx.fillStyle = "rgba(52,96,54,0.75)";
    if (side === "left") {
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(x + 5, y + 20 + i * (h * 0.14), 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (side === "right") {
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(x + w - 5, y + 20 + i * (h * 0.14), 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.arc(x + w * 0.8, y + 8, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + w * 0.7, y + 14, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.strokeStyle = "#1B130E";
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
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
    const hh = worldHash(9101 + i, x, y);
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

function drawDumpster(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
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
  const hh = worldHash(8021, x, y);
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
    const hh = worldHash(9317 + i, x, y);
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

function drawMailbox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = "rgba(5,7,6,0.35)";
  ctx.fillRect(x + 2, y + 3, w, h);
  rect(ctx, x + 1, y + h - 5, w - 2, 5, "#3A4044");
  rect(ctx, x + 2, y + h - 9, w - 4, 4, "#55606A");
  // Post.
  rect(ctx, x + w / 2 - 2, y + 2, 4, h - 5, "#4C5248");
  const hh = worldHash(5401, x, y);
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
