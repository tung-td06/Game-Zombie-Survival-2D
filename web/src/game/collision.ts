// src/game/collision.ts
// Circle-vs-rect and slide movement, ported from collision.py.

import type { Vec } from "./vec";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export function circleRectCollide(
  cx: number,
  cy: number,
  radius: number,
  rect: Rect,
): boolean {
  const nearestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

export function circleVsRect(c: Circle, r: Rect): boolean {
  return circleRectCollide(c.x, c.y, c.r, r);
}

/**
 * Axis-separated movement with obstacle sliding.
 * Mutates `pos`. On overlap, the offending axis is pushed out so entities
 * slide along walls instead of getting stuck.
 *
 * Two robustness properties matter here (they are the reason this is not a
 * naive `pos += delta; if collide → snap`):
 *
 * 1. Each axis is advanced in small sub-steps smaller than `radius`, so a
 *    single big movement (high-speed charge/lunge, grenade knockback, a
 *    clamped large `dt`) can never skip past a thin obstacle in one step
 *    (tunnelling).
 * 2. Residual overlap is resolved by the SMALLEST translation that restores
 *    tangency, choosing the side the body was on *before* the move whenever
 *    possible — never the far side of the obstacle. A circle that merely
 *    grazes a corner is nudged a fraction of a pixel, not teleported to the
 *    opposite face.
 */
export function moveCircle(
  pos: Vec,
  delta: Vec,
  radius: number,
  rects: ReadonlyArray<Rect>,
): void {
  if (rects.length === 0) {
    pos.x += delta.x;
    pos.y += delta.y;
    return;
  }
  const ox = pos.x;
  const oy = pos.y;
  const probeR = radius - 1e-4;

  // Advance one axis at a time; each sub-step is strictly smaller than the
  // radius so a wall can never slip between two consecutive checks.
  if (delta.x !== 0) {
    const dirX = delta.x > 0 ? 1 : -1;
    const maxStep = Math.max(0.001, radius * 0.99);
    let remaining = Math.abs(delta.x);
    while (remaining > 1e-9) {
      const step = Math.min(remaining, maxStep);
      remaining -= step;
      pos.x += dirX * step;
      let blocked = false;
      for (const r of rects) {
        if (circleRectCollide(pos.x, pos.y, probeR, r)) {
          // Rest on the face we were pushing into; stop consuming this axis
          // so the perpendicular axis still slides freely.
          pos.x = dirX > 0 ? r.x - radius : r.x + r.w + radius;
          remaining = 0;
          blocked = true;
          break;
        }
      }
      if (blocked) break;
    }
  }
  if (delta.y !== 0) {
    const dirY = delta.y > 0 ? 1 : -1;
    const maxStep = Math.max(0.001, radius * 0.99);
    let remaining = Math.abs(delta.y);
    while (remaining > 1e-9) {
      const step = Math.min(remaining, maxStep);
      remaining -= step;
      pos.y += dirY * step;
      let blocked = false;
      for (const r of rects) {
        if (circleRectCollide(pos.x, pos.y, probeR, r)) {
          pos.y = dirY > 0 ? r.y - radius : r.y + r.h + radius;
          remaining = 0;
          blocked = true;
          break;
        }
      }
      if (blocked) break;
    }
  }

  // Residual overlap (corner grazing, spawn embedded in geometry): push out
  // with the smallest translation, preferring the side we came from so a body
  // can never pop to the opposite face of a thin obstacle.
  for (let pass = 0; pass < 3; pass++) {
    let resolvedAny = false;
    for (const r of rects) {
      if (!circleRectCollide(pos.x, pos.y, radius, r)) continue;
      const nx = Math.max(r.x, Math.min(pos.x, r.x + r.w));
      const ny = Math.max(r.y, Math.min(pos.y, r.y + r.h));
      const dx = pos.x - nx;
      const dy = pos.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const need = radius - d;
        if (need > 0) {
          pos.x += (dx / d) * need;
          pos.y += (dy / d) * need;
        }
      } else {
        // Centre strictly inside the rect (rare: spawn embed). Leave through
        // the face closest to where the body was before this move, so the
        // correction never flings it across to the far side. Each candidate
        // carries the absolute coordinate to move to (NOT a delta), because
        // left/top exits require moving toward negative space.
        const exits = [
          { to: r.x - radius, d: pos.x - (r.x - radius), fromSide: ox <= r.x }, // left
          { to: r.x + r.w + radius, d: r.x + r.w + radius - pos.x, fromSide: ox >= r.x + r.w }, // right
          { to: r.y - radius, d: pos.y - (r.y - radius), fromSide: oy <= r.y }, // top
          { to: r.y + r.h + radius, d: r.y + r.h + radius - pos.y, fromSide: oy >= r.y + r.h }, // bottom
        ].filter((e) => e.d > 0);
        if (exits.length > 0) {
          exits.sort((a, b) => Number(b.fromSide) - Number(a.fromSide) || a.d - b.d);
          const best = exits[0]!;
          if (best.to === r.x - radius || best.to === r.x + r.w + radius) pos.x = best.to;
          else pos.y = best.to;
        }
      }
      resolvedAny = true;
    }
    if (!resolvedAny) break;
  }
}

/** Functional variant — returns a new Vec, does not mutate input. */
export function slideMove(
  circle: { x: number; y: number; r: number },
  delta: { x: number; y: number },
  rects: ReadonlyArray<Rect>,
): Vec {
  const pos: Vec = { x: circle.x, y: circle.y };
  moveCircle(pos, delta, circle.r, rects);
  return pos;
}
