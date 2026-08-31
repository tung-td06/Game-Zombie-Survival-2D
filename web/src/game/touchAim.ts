// src/game/touchAim.ts
// Pure auto-aim resolver for the mobile fire button. Lives in src/game
// because it reads game data (positions), not DOM. The React touch HUD
// calls this each frame the fire button is held and writes the result
// into InputManager.aimOverride (world coords).

import type { Vec } from "./vec";

export interface AimTarget {
  pos: Vec;
  priority: number;
}

export interface AutoAimOptions {
  radius: number;
  preferAttacking: boolean;
}

export const DEFAULT_AUTO_AIM: AutoAimOptions = {
  radius: 600,
  preferAttacking: true,
};

/**
 * Returns a unit vector from playerPos toward the chosen target, or
 * null if no target is within `radius`.
 *
 * Selection rules (in order):
 * 1. Filter to targets whose distance is <= radius.
 * 2. If preferAttacking and any filtered target has priority > 0,
 *    pick the nearest attacking one.
 * 3. Otherwise pick the nearest target overall.
 * 4. If filtered list is empty, return null.
 *
 * Tie-breakers (stable): lower squared distance, then lower priority,
 * then earlier array index.
 */
export function getAutoAimDirection(
  playerPos: Vec,
  targets: ReadonlyArray<AimTarget>,
  opts: AutoAimOptions = DEFAULT_AUTO_AIM,
): Vec | null {
  const r2 = opts.radius * opts.radius;

  let bestAttacking: { idx: number; d2: number; prio: number } | null = null;
  let bestAny: { idx: number; d2: number; prio: number } | null = null;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    const dx = t.pos.x - playerPos.x;
    const dy = t.pos.y - playerPos.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;

    const cand = { idx: i, d2, prio: t.priority };

    if (t.priority > 0) {
      if (
        !bestAttacking ||
        isCloser(cand, bestAttacking)
      ) {
        bestAttacking = cand;
      }
    }
    if (!bestAny || isCloser(cand, bestAny)) {
      bestAny = cand;
    }
  }

  let chosen = bestAny;
  if (opts.preferAttacking && bestAttacking) chosen = bestAttacking;
  if (!chosen) return null;

  const target = targets[chosen.idx]!;
  const dx = target.pos.x - playerPos.x;
  const dy = target.pos.y - playerPos.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) return null;
  return { x: dx / len, y: dy / len };
}

function isCloser(
  a: { d2: number; prio: number },
  b: { d2: number; prio: number },
): boolean {
  if (a.d2 !== b.d2) return a.d2 < b.d2;
  if (a.prio !== b.prio) return a.prio < b.prio;
  return false;
}