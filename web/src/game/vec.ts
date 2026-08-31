// src/game/vec.ts
// Minimal Vec2 helpers replacing pygame.Vector2 in hot paths.
// Returns new objects to keep game state predictable and avoid aliasing.

export interface Vec {
  x: number;
  y: number;
}

export function v(x = 0, y = 0): Vec {
  return { x, y };
}

export function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec, k: number): Vec {
  return { x: a.x * k, y: a.y * k };
}

export function len(a: Vec): number {
  return Math.hypot(a.x, a.y);
}

export function lenSq(a: Vec): number {
  return a.x * a.x + a.y * a.y;
}

export function normalize(a: Vec): Vec {
  const L = len(a);
  return L > 0 ? { x: a.x / L, y: a.y / L } : { x: 0, y: 0 };
}

export function clone(a: Vec): Vec {
  return { x: a.x, y: a.y };
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distSq(a: Vec, b: Vec): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** In-place mutate `a` by adding b. Returns a. */
export function iadd(a: Vec, b: Vec): Vec {
  a.x += b.x;
  a.y += b.y;
  return a;
}
