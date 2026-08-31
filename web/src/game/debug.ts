// src/game/debug.ts
// Read access to the mutable DEBUG flag (mirrors settings.py).

import { DEBUG, setDebug } from "./settings";

export function isDebug(): boolean {
  return DEBUG;
}

export function toggleDebug(): boolean {
  const next = !DEBUG;
  setDebug(next);
  return next;
}

export { setDebug };
