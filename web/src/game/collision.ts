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
 */
export function moveCircle(
  pos: Vec,
  delta: Vec,
  radius: number,
  rects: ReadonlyArray<Rect>,
): void {
  if (delta.x !== 0) {
    pos.x += delta.x;
    for (const r of rects) {
      if (circleRectCollide(pos.x, pos.y, radius - 1e-4, r)) {
        pos.x = delta.x > 0 ? r.x - radius : r.x + r.w + radius;
      }
    }
  }
  if (delta.y !== 0) {
    pos.y += delta.y;
    for (const r of rects) {
      if (circleRectCollide(pos.x, pos.y, radius - 1e-4, r)) {
        pos.y = delta.y > 0 ? r.y - radius : r.y + r.h + radius;
      }
    }
  }
  // Final safety push-out for corners / spawns inside geometry.
  for (const r of rects) {
    if (circleRectCollide(pos.x, pos.y, radius, r)) {
      const nx = Math.max(r.x, Math.min(pos.x, r.x + r.w));
      const ny = Math.max(r.y, Math.min(pos.y, r.y + r.h));
      const dx = pos.x - nx;
      const dy = pos.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1e-4) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.y = ny + (dy / d) * radius;
      } else {
        const dl = pos.x - r.x;
        const dr = r.x + r.w - pos.x;
        const dt = pos.y - r.y;
        const db = r.y + r.h - pos.y;
        const minDist = Math.min(dl, dr, dt, db);
        if (minDist === dl) pos.x = r.x - radius;
        else if (minDist === dr) pos.x = r.x + r.w + radius;
        else if (minDist === dt) pos.y = r.y - radius;
        else pos.y = r.y + r.h + radius;
      }
    }
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
