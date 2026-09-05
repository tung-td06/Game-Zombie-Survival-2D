// src/game/propArtExtra.ts
// ─────────────────────────────────────────────────────────────────────────
// District landmark art for the Greenfield map: the props that give each
// zone its identity — downtown towers, industrial silos and warehouses,
// suburban fences, park water and pavilions, quarantine sandbags, tents and
// watchtowers.
//
// Same contract as propArt.ts: given a screen rect, a kind and the prop's
// WORLD origin, these paint the same pixels every frame. Every hash is fed
// world coordinates (never screen ones), so nothing shifts as the camera
// moves.
// ─────────────────────────────────────────────────────────────────────────

import { px, rect, worldHash } from "./pixelArt";

/** Soft drop shadow, offset down-right, matching the rest of the world art. */
function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a = 0.34): void {
  ctx.fillStyle = `rgba(4,6,5,${a})`;
  ctx.fillRect(x + 4, y + 5, w, h);
}

// ────────────────────────────────────────────────────────── downtown tower
/**
 * High-rise seen from above: a stepped roof with a plant deck, a helipad or
 * a water tank, plus the parapet shadow that sells the height.
 */
export function drawTower(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  lit: boolean,
  sv: number,
  wx: number,
  wy: number,
): void {
  shadow(ctx, x, y, w, h, 0.42);
  const pal = [
    { body: "#3E4450", edge: "#282D36", deck: "#4A5160", trim: "#5C6472" },
    { body: "#4A4038", edge: "#2F2822", deck: "#584C42", trim: "#6B5C50" },
    { body: "#3A4642", edge: "#25302C", deck: "#46534E", trim: "#57665F" },
  ][sv % 3]!;
  // Curtain-wall shaft (the outer band you see past the parapet).
  rect(ctx, x, y, w, h, pal.edge);
  rect(ctx, x + 5, y + 5, w - 10, h - 10, pal.body);
  // Parapet inner shadow — the roof sits lower than the wall top.
  ctx.fillStyle = "rgba(0,0,0,0.30)";
  ctx.fillRect(x + 5, y + 5, w - 10, 7);
  ctx.fillRect(x + 5, y + 5, 7, h - 10);

  const inset = 16;
  const rw = w - inset * 2;
  const rh = h - inset * 2;
  if (rw > 20 && rh > 20) {
    rect(ctx, x + inset, y + inset, rw, rh, pal.deck);
    // Roof gravel + seams.
    for (let i = 0; i < 16; i++) {
      const hh = worldHash(7001 + i, wx + i * 13, wy - i * 9);
      px(ctx, x + inset + (hh % Math.max(1, rw - 3)), y + inset + ((hh >> 5) % Math.max(1, rh - 3)), hh % 3 === 0 ? "#6A7180" : "#2E333B", 2);
    }
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    for (let gx = x + inset + 24; gx < x + inset + rw; gx += 26) ctx.fillRect(gx, y + inset, 1, rh);

    const feature = worldHash(7013, wx, wy) % 3;
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (feature === 0 && rw > 60 && rh > 60) {
      // Helipad.
      ctx.fillStyle = "#2A2F36";
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(rw, rh) * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#D8D4C2";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(rw, rh) * 0.27, 0, Math.PI * 2);
      ctx.stroke();
      const s = Math.min(rw, rh) * 0.16;
      rect(ctx, cx - s, cy - s, 5, s * 2, "#D8D4C2");
      rect(ctx, cx + s - 5, cy - s, 5, s * 2, "#D8D4C2");
      rect(ctx, cx - s, cy - 2, s * 2, 5, "#D8D4C2");
    } else if (feature === 1) {
      // Rooftop plant: AC units + a vent stack.
      for (let i = 0; i < 4; i++) {
        const hh = worldHash(7019 + i, wx + i * 41, wy + i * 23);
        const ux = x + inset + 6 + (hh % Math.max(1, rw - 34));
        const uy = y + inset + 6 + ((hh >> 6) % Math.max(1, rh - 30));
        rect(ctx, ux, uy, 26, 20, "#22262C");
        rect(ctx, ux + 2, uy + 2, 22, 16, "#59606B");
        for (let k = 0; k < 4; k++) rect(ctx, ux + 4 + k * 5, uy + 4, 2, 12, "#343A42");
      }
      rect(ctx, cx - 7, cy - 7, 14, 14, "#1D2127");
      rect(ctx, cx - 5, cy - 5, 10, 10, "#6E7683");
    } else {
      // Water tank + stair bulkhead.
      ctx.fillStyle = "#2A241E";
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(rw, rh) * 0.24 + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5E4E3C";
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(rw, rh) * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#7A6448";
      ctx.beginPath();
      ctx.arc(cx - 3, cy - 3, Math.min(rw, rh) * 0.14, 0, Math.PI * 2);
      ctx.fill();
      rect(ctx, x + inset + 8, y + inset + 8, 22, 16, "#3A3F47");
      rect(ctx, x + inset + 10, y + inset + 10, 18, 4, "#565D67");
    }
  }

  // Parapet coping + corner lights (only when window lights are on).
  rect(ctx, x, y, w, 3, pal.trim);
  rect(ctx, x, y, 3, h, pal.trim);
  if (lit) {
    px(ctx, x + 2, y + 2, "#FF6B5A", 4);
    px(ctx, x + w - 6, y + 2, "#FF6B5A", 4);
    px(ctx, x + 2, y + h - 6, "#FF6B5A", 4);
    px(ctx, x + w - 6, y + h - 6, "#FF6B5A", 4);
  }
}

// ───────────────────────────────────────────────────────────────— warehouse
/** Long-span industrial shed: corrugated steel roof, skylight strip, vents. */
export function drawWarehouse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  lit: boolean,
  sv: number,
  wx: number,
  wy: number,
): void {
  shadow(ctx, x, y, w, h, 0.38);
  const pal = [
    { wall: "#4A4E48", roof: "#3A3E3A", rib: "#2C302C", trim: "#5E645C" },
    { wall: "#54483A", roof: "#42392E", rib: "#332C24", trim: "#6A5B49" },
    { wall: "#3E4650", roof: "#313841", rib: "#252B32", trim: "#4F5A66" },
  ][sv % 3]!;
  rect(ctx, x, y, w, h, pal.rib);
  rect(ctx, x + 4, y + 4, w - 8, h - 8, pal.roof);
  const along = w >= h;
  const span = along ? w : h;
  // Corrugated ribs.
  ctx.fillStyle = "rgba(0,0,0,0.20)";
  for (let p = 10; p < span - 6; p += 11) {
    if (along) ctx.fillRect(x + p, y + 5, 3, h - 10);
    else ctx.fillRect(x + 5, y + p, w - 10, 3);
  }
  // Rust runs.
  for (let i = 0; i < 8; i++) {
    const hh = worldHash(7103 + i, wx + i * 29, wy - i * 17);
    if (hh % 3) continue;
    ctx.fillStyle = "rgba(122,68,28,0.28)";
    if (along) ctx.fillRect(x + 8 + (hh % Math.max(1, w - 20)), y + 6, 7, h - 12);
    else ctx.fillRect(x + 6, y + 8 + (hh % Math.max(1, h - 20)), w - 12, 7);
  }
  // Skylight strip down the ridge.
  if (along) {
    rect(ctx, x + 10, y + h / 2 - 9, w - 20, 18, "#20242A");
    rect(ctx, x + 12, y + h / 2 - 7, w - 24, 14, lit ? "#C6D8B8" : "#5C7A82");
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    for (let p = 14; p < w - 14; p += 34) ctx.fillRect(x + p, y + h / 2 - 7, 3, 14);
  } else {
    rect(ctx, x + w / 2 - 9, y + 10, 18, h - 20, "#20242A");
    rect(ctx, x + w / 2 - 7, y + 12, 14, h - 24, lit ? "#C6D8B8" : "#5C7A82");
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    for (let p = 14; p < h - 14; p += 34) ctx.fillRect(x + w / 2 - 7, y + p, 14, 3);
  }
  // Roof vents / extractors.
  for (let i = 0; i < 3; i++) {
    const hh = worldHash(7109 + i, wx + i * 53, wy + i * 31);
    const vx = x + 12 + (hh % Math.max(1, w - 34));
    const vy = y + 12 + ((hh >> 6) % Math.max(1, h - 34));
    ctx.fillStyle = "#23272B";
    ctx.beginPath();
    ctx.arc(vx, vy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#666E74";
    ctx.beginPath();
    ctx.arc(vx, vy, 6, 0, Math.PI * 2);
    ctx.fill();
    rect(ctx, vx - 6, vy - 1, 12, 2, "#2A2E33");
    rect(ctx, vx - 1, vy - 6, 2, 12, "#2A2E33");
  }
  // Loading-dock band + roller-door marks on the long façade.
  rect(ctx, x, y, w, 4, pal.trim);
  rect(ctx, x, y, 4, h, pal.trim);
  const dockN = Math.max(2, Math.floor(span / 90));
  ctx.fillStyle = pal.wall;
  for (let i = 0; i < dockN; i++) {
    if (along) rect(ctx, x + 16 + i * 88, y + h - 8, 54, 6, pal.wall);
    else rect(ctx, x + w - 8, y + 16 + i * 88, 6, 54, pal.wall);
  }
}

// ──────────────────────────────────────────────────────────────────── silo
/** Cement / grain silo: tall cylinder with a conical cap and access ladder. */
export function drawSilo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wx: number, wy: number): void {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) / 2;
  ctx.fillStyle = "rgba(4,6,5,0.40)";
  ctx.beginPath();
  ctx.arc(cx + 5, cy + 6, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6E6A5E";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8B8778";
  ctx.beginPath();
  ctx.arc(cx - r * 0.18, cy - r * 0.18, r * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#A39C88";
  ctx.beginPath();
  ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.46, 0, Math.PI * 2);
  ctx.fill();
  // Conical cap ribs.
  ctx.strokeStyle = "rgba(48,44,36,0.55)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r * 0.94, cy + Math.sin(a) * r * 0.94);
    ctx.stroke();
  }
  // Hatch + ladder down one side.
  ctx.fillStyle = "#3A362C";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
  const lh = worldHash(7207, wx, wy) % 4;
  const la = (lh / 4) * Math.PI * 2;
  for (let i = 0; i < 6; i++) {
    const d = r * (0.3 + i * 0.11);
    px(ctx, cx + Math.cos(la) * d - 3, cy + Math.sin(la) * d - 1, "#4E4A3E", 6);
  }
  // Rust streaks.
  for (let i = 0; i < 6; i++) {
    const hh = worldHash(7211 + i, wx + i * 19, wy + i * 13);
    const a = (hh % 360) * (Math.PI / 180);
    ctx.fillStyle = "rgba(126,70,30,0.30)";
    ctx.fillRect(cx + Math.cos(a) * r * 0.7 - 2, cy + Math.sin(a) * r * 0.7 - 2, 5, 12);
  }
  ctx.strokeStyle = "#33302A";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

/** Squat fuel / chemical storage tank with a walkway and pipe stubs. */
export function drawTank(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wx: number, wy: number): void {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) / 2;
  ctx.fillStyle = "rgba(4,6,5,0.38)";
  ctx.beginPath();
  ctx.arc(cx + 5, cy + 6, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2C3A3C";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#436063";
  ctx.beginPath();
  ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5A7E80";
  ctx.beginPath();
  ctx.arc(cx - r * 0.22, cy - r * 0.22, r * 0.6, 0, Math.PI * 2);
  ctx.fill();
  // Walkway ring + central manway.
  ctx.strokeStyle = "#20302F";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#1B2626";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7E9A9A";
  ctx.beginPath();
  ctx.arc(cx - 1, cy - 1, r * 0.13, 0, Math.PI * 2);
  ctx.fill();
  // Pipe stubs at two hashed angles.
  const ph = worldHash(7307, wx, wy);
  for (let i = 0; i < 2; i++) {
    const a = ((ph >> (i * 4)) % 360) * (Math.PI / 180);
    const ex = cx + Math.cos(a) * r;
    const ey = cy + Math.sin(a) * r;
    rect(ctx, ex - 5, ey - 5, 11, 11, "#5A6A6A");
    rect(ctx, ex - 3, ey - 3, 7, 7, "#8FA5A3");
  }
  // Hazard stripe.
  ctx.fillStyle = "rgba(214,164,44,0.55)";
  ctx.fillRect(cx - r * 0.7, cy + r * 0.4, r * 1.4, 5);
}

// ─────────────────────────────────────────────────────────────────── fence
/**
 * A run of fencing. Thin rect: the long axis is the run. Two looks —
 * suburban timber palings and industrial chain-link — chosen by variant.
 */
export function drawFence(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, sv: number, wx: number, wy: number): void {
  const along = w >= h;
  const span = along ? w : h;
  const chain = sv % 2 === 0;
  ctx.fillStyle = "rgba(4,6,5,0.26)";
  ctx.fillRect(x + 3, y + 4, w, h);
  if (chain) {
    // Mesh: two rails + a diamond weave + posts.
    rect(ctx, x, y, w, h, "rgba(38,44,38,0.30)");
    ctx.strokeStyle = "rgba(150,158,150,0.34)";
    ctx.lineWidth = 1;
    for (let p = 0; p < span; p += 7) {
      ctx.beginPath();
      if (along) {
        ctx.moveTo(x + p, y);
        ctx.lineTo(x + p + 7, y + h);
        ctx.moveTo(x + p + 7, y);
        ctx.lineTo(x + p, y + h);
      } else {
        ctx.moveTo(x, y + p);
        ctx.lineTo(x + w, y + p + 7);
        ctx.moveTo(x, y + p + 7);
        ctx.lineTo(x + w, y + p);
      }
      ctx.stroke();
    }
    for (const t of [0, 1]) {
      if (along) rect(ctx, x, y + t * (h - 3), w, 3, "#4C544C");
      else rect(ctx, x + t * (w - 3), y, 3, h, "#4C544C");
    }
    for (let p = 0; p < span; p += 64) {
      const hh = worldHash(7401, Math.floor(along ? wx + p : wx), Math.floor(along ? wy : wy + p));
      const lean = hh % 5 === 0 ? 2 : 0;
      if (along) rect(ctx, x + p + lean, y - 3, 5, h + 6, "#565E56");
      else rect(ctx, x - 3, y + p + lean, w + 6, 5, "#565E56");
    }
  } else {
    // Timber palings, a few missing or knocked askew.
    if (along) rect(ctx, x, y + h / 2 - 2, w, 4, "#4A3826");
    else rect(ctx, x + w / 2 - 2, y, 4, h, "#4A3826");
    for (let p = 0; p < span - 4; p += 9) {
      const hh = worldHash(7409, Math.floor(along ? wx + p : wx), Math.floor(along ? wy : wy + p));
      if (hh % 9 === 0) continue; // missing paling
      const tone = ["#6B4F35", "#7A5C3E", "#5C432D", "#836646"][hh % 4]!;
      if (along) {
        rect(ctx, x + p, y - 1, 6, h + 2, tone);
        rect(ctx, x + p, y - 1, 2, h + 2, "rgba(255,240,210,0.10)");
      } else {
        rect(ctx, x - 1, y + p, w + 2, 6, tone);
        rect(ctx, x - 1, y + p, w + 2, 2, "rgba(255,240,210,0.10)");
      }
    }
  }
}

// ───────────────────────────────────────────────────────── military line
/** Stacked sandbag emplacement. */
export function drawSandbag(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wx: number, wy: number): void {
  shadow(ctx, x, y, w, h, 0.30);
  const along = w >= h;
  const span = along ? w : h;
  rect(ctx, x, y, w, h, "#4E4632");
  for (let row = 0; row < (along ? h : w); row += 9) {
    const off = (row / 9) % 2 === 0 ? 0 : 7;
    for (let p = -off; p < span; p += 15) {
      const hh = worldHash(7501, Math.floor(along ? wx + p : wx + row), Math.floor(along ? wy + row : wy + p));
      const tone = ["#7A6E4C", "#8A7C56", "#695E40", "#93865E"][hh % 4]!;
      if (along) {
        rect(ctx, x + p, y + row, 13, 8, tone);
        rect(ctx, x + p, y + row, 13, 2, "rgba(255,246,214,0.14)");
        rect(ctx, x + p, y + row + 7, 13, 1, "rgba(0,0,0,0.32)");
      } else {
        rect(ctx, x + row, y + p, 8, 13, tone);
        rect(ctx, x + row, y + p, 2, 13, "rgba(255,246,214,0.14)");
        rect(ctx, x + row + 7, y + p, 1, 13, "rgba(0,0,0,0.32)");
      }
    }
  }
}

/** Interlocking concrete (jersey) barrier with reflective chevrons. */
export function drawJersey(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wx: number, wy: number): void {
  shadow(ctx, x, y, w, h, 0.30);
  const along = w >= h;
  const span = along ? w : h;
  const UNIT = 58;
  for (let p = 0; p < span; p += UNIT) {
    const seg = Math.min(UNIT - 3, span - p);
    if (seg < 6) break;
    const hh = worldHash(7509, Math.floor(along ? wx + p : wx), Math.floor(along ? wy : wy + p));
    const body = hh % 6 === 0 ? "#6E6A5E" : "#847F70";
    if (along) {
      rect(ctx, x + p, y, seg, h, "#3A3830");
      rect(ctx, x + p + 1, y + 1, seg - 2, h - 3, body);
      rect(ctx, x + p + 1, y + 1, seg - 2, 3, "#9E9888");
      rect(ctx, x + p + 1, y + h - 4, seg - 2, 2, "rgba(0,0,0,0.35)");
      if (hh % 3 === 0) {
        rect(ctx, x + p + seg / 2 - 8, y + h / 2 - 3, 16, 6, "#D8A234");
        rect(ctx, x + p + seg / 2 - 8, y + h / 2 - 3, 16, 2, "#F0C25E");
      }
    } else {
      rect(ctx, x, y + p, w, seg, "#3A3830");
      rect(ctx, x + 1, y + p + 1, w - 3, seg - 2, body);
      rect(ctx, x + 1, y + p + 1, 3, seg - 2, "#9E9888");
      rect(ctx, x + w - 4, y + p + 1, 2, seg - 2, "rgba(0,0,0,0.35)");
      if (hh % 3 === 0) {
        rect(ctx, x + w / 2 - 3, y + p + seg / 2 - 8, 6, 16, "#D8A234");
        rect(ctx, x + w / 2 - 3, y + p + seg / 2 - 8, 2, 16, "#F0C25E");
      }
    }
  }
}

/** Guard tower over a checkpoint: railed platform, floodlight, sandbag lip. */
export function drawWatchtower(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wx: number, wy: number): void {
  shadow(ctx, x, y, w, h, 0.46);
  rect(ctx, x, y, w, h, "#2A2A22");
  rect(ctx, x + 3, y + 3, w - 6, h - 6, "#3E4034");
  // Deck planks.
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  for (let p = 8; p < w - 4; p += 9) ctx.fillRect(x + p, y + 4, 2, h - 8);
  // Rail on all four sides.
  const rail = "#5A5E4C";
  rect(ctx, x + 3, y + 3, w - 6, 4, rail);
  rect(ctx, x + 3, y + h - 7, w - 6, 4, rail);
  rect(ctx, x + 3, y + 3, 4, h - 6, rail);
  rect(ctx, x + w - 7, y + 3, 4, h - 6, rail);
  // Corner posts.
  for (const [ox, oy] of [[0, 0], [w - 9, 0], [0, h - 9], [w - 9, h - 9]] as const) {
    rect(ctx, x + ox, y + oy, 9, 9, "#22241C");
    rect(ctx, x + ox + 1, y + oy + 1, 6, 6, "#4A4E3E");
  }
  // Floodlight head + its beam pool, aimed by a world hash.
  const a = ((worldHash(7601, wx, wy) % 360) * Math.PI) / 180;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const lx = cx + Math.cos(a) * (w * 0.24);
  const ly = cy + Math.sin(a) * (h * 0.24);
  const grad = ctx.createRadialGradient(lx, ly, 2, lx, ly, 60);
  grad.addColorStop(0, "rgba(226,240,255,0.20)");
  grad.addColorStop(1, "rgba(226,240,255,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(lx, ly, 60, 0, Math.PI * 2);
  ctx.fill();
  rect(ctx, cx - 7, cy - 7, 14, 14, "#1E2018");
  rect(ctx, cx - 5, cy - 5, 10, 10, "#585C4A");
  rect(ctx, lx - 4, ly - 4, 9, 9, "#2A2C22");
  rect(ctx, lx - 3, ly - 3, 7, 7, "#F2F0D2");
}

/** Field / quarantine tent: ridged canvas with a red-cross panel. */
export function drawTent(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, sv: number, wx: number, wy: number): void {
  shadow(ctx, x, y, w, h, 0.32);
  const along = w >= h;
  const canvasTone = sv % 2 === 0 ? "#5A6048" : "#6A6450";
  const dark = sv % 2 === 0 ? "#3E4432" : "#4C4838";
  rect(ctx, x, y, w, h, dark);
  rect(ctx, x + 2, y + 2, w - 4, h - 4, canvasTone);
  // Ridge highlight along the centre.
  if (along) {
    rect(ctx, x + 2, y + h / 2 - 3, w - 4, 6, "#7E8466");
    rect(ctx, x + 2, y + h / 2 - 3, w - 4, 2, "#949A78");
  } else {
    rect(ctx, x + w / 2 - 3, y + 2, 6, h - 4, "#7E8466");
    rect(ctx, x + w / 2 - 3, y + 2, 2, h - 4, "#949A78");
  }
  // Guy-rope ribs.
  ctx.fillStyle = "rgba(0,0,0,0.20)";
  const span = along ? w : h;
  for (let p = 12; p < span - 6; p += 18) {
    if (along) ctx.fillRect(x + p, y + 2, 2, h - 4);
    else ctx.fillRect(x + 2, y + p, w - 4, 2);
  }
  // Medical cross on the roof.
  if (worldHash(7701, wx, wy) % 2 === 0) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const s = Math.min(w, h) * 0.16;
    rect(ctx, cx - s, cy - s * 0.34, s * 2, s * 0.68, "#C43A38");
    rect(ctx, cx - s * 0.34, cy - s, s * 0.68, s * 2, "#C43A38");
  }
  // Pegged corners.
  px(ctx, x + 1, y + 1, "#22261C", 3);
  px(ctx, x + w - 4, y + 1, "#22261C", 3);
  px(ctx, x + 1, y + h - 4, "#22261C", 3);
  px(ctx, x + w - 4, y + h - 4, "#22261C", 3);
}

// ─────────────────────────────────────────────────────────────────── park
/** Still pond: reeds at the margin, shallow shelf and a dark centre. */
export function drawPond(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wx: number, wy: number): void {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  // Muddy bank.
  ctx.fillStyle = "#4A4230";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // Shallow shelf.
  ctx.fillStyle = "#3E5F5C";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.92, ry * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  // Deep water.
  ctx.fillStyle = "#22403F";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.74, ry * 0.74, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#16302F";
  ctx.beginPath();
  ctx.ellipse(cx + rx * 0.06, cy + ry * 0.08, rx * 0.44, ry * 0.44, 0, 0, Math.PI * 2);
  ctx.fill();
  // Sky glint + ripples.
  ctx.fillStyle = "rgba(178,214,220,0.16)";
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.3, cy - ry * 0.34, rx * 0.34, ry * 0.20, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(160,200,206,0.16)";
  ctx.lineWidth = 2;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * (0.3 + i * 0.16), ry * (0.3 + i * 0.16), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Reeds + lily pads around the rim.
  for (let i = 0; i < 22; i++) {
    const hh = worldHash(7801 + i, wx + i * 23, wy - i * 17);
    const a = ((hh % 360) * Math.PI) / 180;
    const px0 = cx + Math.cos(a) * rx * 0.93;
    const py0 = cy + Math.sin(a) * ry * 0.93;
    if (hh % 3 === 0) {
      rect(ctx, px0, py0 - 7, 2, 10, "#3E6A32");
      rect(ctx, px0 + 3, py0 - 4, 2, 8, "#4E7E3C");
    } else if (hh % 7 === 0) {
      ctx.fillStyle = "#2E6238";
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rx * 0.6, cy + Math.sin(a) * ry * 0.6, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Park pavilion: hexagonal-ish shingled roof on posts. */
export function drawGazebo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wx: number, wy: number): void {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) / 2;
  ctx.fillStyle = "rgba(4,6,5,0.40)";
  ctx.beginPath();
  ctx.arc(cx + 5, cy + 6, r, 0, Math.PI * 2);
  ctx.fill();
  // Roof: 6 shingled facets.
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2;
    const a1 = ((i + 1) / 6) * Math.PI * 2;
    ctx.fillStyle = i % 2 === 0 ? "#5A3A2C" : "#4A2F24";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    ctx.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    ctx.closePath();
    ctx.fill();
  }
  // Shingle courses.
  ctx.strokeStyle = "rgba(24,14,10,0.35)";
  ctx.lineWidth = 1;
  for (let k = 1; k <= 3; k++) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * (k / 4), 0, Math.PI * 2);
    ctx.stroke();
  }
  // Finial + posts poking out at the rim.
  ctx.fillStyle = "#7A5C40";
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8E6C4A";
  ctx.beginPath();
  ctx.arc(cx - 1, cy - 1, 3, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) / 6) * Math.PI * 2;
    px(ctx, cx + Math.cos(a) * r * 0.9 - 3, cy + Math.sin(a) * r * 0.9 - 3, "#33251A", 7);
  }
  void wx;
  void wy;
}

/** Concrete planter box with an overgrown shrub. */
export function drawPlanter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wx: number, wy: number): void {
  shadow(ctx, x, y, w, h, 0.28);
  rect(ctx, x, y, w, h, "#585449");
  rect(ctx, x + 1, y + 1, w - 2, 3, "#7A7565");
  rect(ctx, x + 3, y + 4, w - 6, h - 7, "#3A3126");
  // Shrub mass.
  const cx = x + w / 2;
  const cy = y + h / 2 + 1;
  for (let i = 0; i < 5; i++) {
    const hh = worldHash(7901 + i, wx + i * 13, wy + i * 7);
    ctx.fillStyle = ["#2E5228", "#3A6430", "#264622"][hh % 3]!;
    ctx.beginPath();
    ctx.arc(cx + ((hh % 9) - 4), cy + (((hh >> 4) % 7) - 3), Math.min(w, h) * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#4E7E3A";
  ctx.beginPath();
  ctx.arc(cx - 2, cy - 2, Math.min(w, h) * 0.17, 0, Math.PI * 2);
  ctx.fill();
}

// ────────────────────────────────────────────────────────── street fittings
/** Bus shelter: glazed canopy, bench and a route panel. */
export function drawBusStop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  shadow(ctx, x, y, w, h, 0.30);
  const along = w >= h;
  rect(ctx, x, y, w, h, "#232830");
  rect(ctx, x + 2, y + 2, w - 4, h - 4, "rgba(150,190,200,0.26)");
  // Glazing bars.
  ctx.fillStyle = "#39414A";
  if (along) {
    for (let p = 8; p < w - 6; p += 20) rect(ctx, x + p, y + 2, 3, h - 4, "#39414A");
    rect(ctx, x + 2, y + h - 9, w - 4, 6, "#4A5058"); // bench
    rect(ctx, x + 2, y + h - 9, w - 4, 2, "#69707A");
  } else {
    for (let p = 8; p < h - 6; p += 20) rect(ctx, x + 2, y + p, w - 4, 3, "#39414A");
    rect(ctx, x + w - 9, y + 2, 6, h - 4, "#4A5058");
    rect(ctx, x + w - 9, y + 2, 2, h - 4, "#69707A");
  }
  // Illuminated route panel.
  rect(ctx, x + 2, y + 2, along ? 12 : w - 4, along ? h - 4 : 12, "#1A1E24");
  rect(ctx, x + 4, y + 4, along ? 8 : w - 8, along ? h - 8 : 8, "#C8B054");
}

/** Traffic signal on a short mast, with the live lamp glowing. */
export function drawTrafficLight(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wx: number, wy: number): void {
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.fillStyle = "rgba(4,6,5,0.34)";
  ctx.fillRect(x + 4, y + 5, w, h);
  // Base + mast.
  rect(ctx, x, y + h - 8, w, 8, "#1B1F22");
  rect(ctx, x + 1, y + h - 7, w - 2, 3, "#3A4247");
  rect(ctx, cx - 3, y, 7, h - 6, "#232A2E");
  rect(ctx, cx - 2, y + 2, 2, h - 10, "#454F55");
  // Signal head — three lenses, one lit.
  rect(ctx, cx - 7, y - 2, 15, 26, "#14181A");
  rect(ctx, cx - 6, y - 1, 13, 24, "#2A3034");
  const live = worldHash(8001, wx, wy) % 3;
  const lens = ["#E0453C", "#E8B840", "#4FCB63"];
  for (let i = 0; i < 3; i++) {
    const on = i === live;
    ctx.fillStyle = on ? lens[i]! : "rgba(18,20,22,0.9)";
    ctx.beginPath();
    ctx.arc(cx, y + 4 + i * 8, 3.4, 0, Math.PI * 2);
    ctx.fill();
    if (on) {
      const g = ctx.createRadialGradient(cx, y + 4 + i * 8, 1, cx, y + 4 + i * 8, 20);
      g.addColorStop(0, "rgba(255,255,255,0.18)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, y + 4 + i * 8, 20, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  void cy;
}

/** Roadside billboard: frame, torn poster and two lamp hoods. */
export function drawBillboard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, sv: number, wx: number, wy: number): void {
  shadow(ctx, x, y, w, h, 0.34);
  const along = w >= h;
  rect(ctx, x, y, w, h, "#26231D");
  rect(ctx, x + 3, y + 3, w - 6, h - 6, ["#8A3A34", "#2E5570", "#7A6A2E", "#4A3A5E"][sv % 4]!);
  // Poster art: bold blocks + a torn strip revealing the board beneath.
  ctx.fillStyle = "rgba(240,236,220,0.72)";
  if (along) {
    ctx.fillRect(x + 8, y + 6, w * 0.32, h - 12);
    ctx.fillRect(x + w * 0.46, y + 8, w * 0.2, (h - 16) * 0.5);
  } else {
    ctx.fillRect(x + 6, y + 8, w - 12, h * 0.32);
    ctx.fillRect(x + 8, y + h * 0.46, (w - 16) * 0.5, h * 0.2);
  }
  const th = worldHash(8101, wx, wy);
  ctx.fillStyle = "rgba(40,36,30,0.85)";
  if (along) ctx.fillRect(x + 6 + (th % Math.max(1, w - 26)), y + 4, 12, h - 8);
  else ctx.fillRect(x + 4, y + 6 + (th % Math.max(1, h - 26)), w - 8, 12);
  // Frame + lamp hoods.
  ctx.strokeStyle = "#4A443A";
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  for (const t of [0.28, 0.72]) {
    const lx = along ? x + w * t : x + w / 2;
    const ly = along ? y + h / 2 : y + h * t;
    rect(ctx, lx - 5, ly - 4, 11, 8, "#3A3B34");
    rect(ctx, lx - 3, ly - 2, 7, 4, "#EFE0A2");
  }
}

/** Fuel-station pump island: kerbed base, two pumps, hoses. */
export function drawFuelPump(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wx: number, wy: number): void {
  shadow(ctx, x, y, w, h, 0.30);
  const along = w >= h;
  rect(ctx, x, y, w, h, "#5E5B52");
  rect(ctx, x + 2, y + 2, w - 4, h - 4, "#78756A");
  rect(ctx, x + 2, y + 2, w - 4, 2, "#95917F");
  // Hazard kerb stripes.
  ctx.fillStyle = "rgba(212,160,44,0.65)";
  const span = along ? w : h;
  for (let p = 4; p < span - 6; p += 16) {
    if (along) ctx.fillRect(x + p, y + h - 5, 8, 3);
    else ctx.fillRect(x + w - 5, y + p, 3, 8);
  }
  // Two pump bodies.
  for (const t of [0.28, 0.72]) {
    const bx = along ? x + w * t - 9 : x + w / 2 - 9;
    const by = along ? y + h / 2 - 12 : y + h * t - 12;
    rect(ctx, bx, by, 18, 24, "#2A2E33");
    rect(ctx, bx + 2, by + 2, 14, 20, worldHash(8203, wx, wy) % 2 === 0 ? "#B8412F" : "#2E6E52");
    rect(ctx, bx + 4, by + 4, 10, 7, "#141719"); // display
    rect(ctx, bx + 5, by + 5, 8, 2, "#7ADCA0");
    rect(ctx, bx + 4, by + 15, 10, 3, "#4A4E52"); // nozzle holster
    ctx.strokeStyle = "#1C1F22";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + 16, by + 12);
    ctx.quadraticCurveTo(bx + 24, by + 18, bx + 20, by + 24);
    ctx.stroke();
  }
}

/** Market kiosk / newsstand with a striped awning. */
export function drawKiosk(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, sv: number): void {
  shadow(ctx, x, y, w, h, 0.32);
  rect(ctx, x, y, w, h, "#2A2620");
  rect(ctx, x + 2, y + 2, w - 4, h - 4, ["#6A5238", "#4E5A46", "#5E4A52"][sv % 3]!);
  // Roof panel + hatch.
  rect(ctx, x + 5, y + 5, w - 10, h - 10, "#3E362A");
  rect(ctx, x + 7, y + 7, w - 14, 6, "#7A6A4E");
  // Striped awning down one side.
  const stripes = Math.max(2, Math.floor(w / 8));
  for (let i = 0; i < stripes; i++) {
    rect(ctx, x + 2 + i * 8, y + h - 10, 8, 8, i % 2 === 0 ? "#B4423C" : "#E4DCC4");
  }
  rect(ctx, x + 2, y + h - 11, w - 4, 2, "#22201A");
}

/** Street-name / district signpost. */
export function drawSign(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, sv: number): void {
  ctx.fillStyle = "rgba(4,6,5,0.30)";
  ctx.fillRect(x + 3, y + 4, w, h);
  const along = w >= h;
  // Post.
  rect(ctx, x + w / 2 - 2, y + h / 2 - 2, 5, 5, "#3A3E42");
  // Blade.
  const c = ["#2E5C3C", "#2E4A6C", "#5A4A22"][sv % 3]!;
  if (along) {
    rect(ctx, x, y + h / 2 - 6, w, 12, "#191C1E");
    rect(ctx, x + 1, y + h / 2 - 5, w - 2, 10, c);
    ctx.fillStyle = "rgba(232,232,220,0.75)";
    for (let i = 0; i < Math.floor((w - 8) / 6); i++) ctx.fillRect(x + 4 + i * 6, y + h / 2 - 2, 4, 4);
  } else {
    rect(ctx, x + w / 2 - 6, y, 12, h, "#191C1E");
    rect(ctx, x + w / 2 - 5, y + 1, 10, h - 2, c);
    ctx.fillStyle = "rgba(232,232,220,0.75)";
    for (let i = 0; i < Math.floor((h - 8) / 6); i++) ctx.fillRect(x + w / 2 - 2, y + 4 + i * 6, 4, 4);
  }
}

/** Steel transmission pylon with slack cables leaving two arms. */
export function drawPylon(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wx: number, wy: number): void {
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.fillStyle = "rgba(4,6,5,0.34)";
  ctx.fillRect(x + 5, y + 6, w, h);
  const lat = "#575D5A";
  const dark = "#333836";
  // Four legs splayed to the corners.
  ctx.strokeStyle = dark;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x + 3, y + 3);
  ctx.lineTo(cx, cy);
  ctx.moveTo(x + w - 3, y + 3);
  ctx.lineTo(cx, cy);
  ctx.moveTo(x + 3, y + h - 3);
  ctx.lineTo(cx, cy);
  ctx.moveTo(x + w - 3, y + h - 3);
  ctx.lineTo(cx, cy);
  ctx.stroke();
  // Lattice bracing rings.
  ctx.strokeStyle = lat;
  ctx.lineWidth = 2;
  for (const t of [0.35, 0.62, 0.86]) {
    ctx.strokeRect(cx - (w / 2) * t, cy - (h / 2) * t, w * t, h * t);
  }
  // Cross-arms + insulators.
  const horiz = worldHash(8301, wx, wy) % 2 === 0;
  if (horiz) {
    rect(ctx, x - 8, cy - 4, w + 16, 8, lat);
    px(ctx, x - 8, cy - 3, "#8A9490", 6);
    px(ctx, x + w + 2, cy - 3, "#8A9490", 6);
  } else {
    rect(ctx, cx - 4, y - 8, 8, h + 16, lat);
    px(ctx, cx - 3, y - 8, "#8A9490", 6);
    px(ctx, cx - 3, y + h + 2, "#8A9490", 6);
  }
  // Top platform.
  rect(ctx, cx - 8, cy - 8, 17, 17, "#232726");
  rect(ctx, cx - 6, cy - 6, 13, 13, "#616866");
  rect(ctx, cx - 3, cy - 3, 7, 7, "#8E9794");
}
