// src/game/hudLayout.ts
// SINGLE source of truth for the mobile (touch-mode) layout geometry.
// Both the canvas HUD (ui.ts) and the React touch controls (TouchHUD.tsx)
// compute their positions from these zones, so a control can never drift
// into a HUD zone (or vice versa) — no pixel-pushing, no magic numbers in
// two places. Desktop never uses this module (isTouchMode is false).
//
// Zones (mobile landscape):
//
//   ┌───────────────────────────────────────────────┐
//   │  TOP_LEFT(HP)   WAVE        SCORE/MINIMAP     │  ← top row, pause gutter right
//   │                                               │
//   │                 GAME WORLD                    │
//   │                                               │
//   │  [JOY][WEAPON][RELOAD]       [BOMB]           │
//   │                            [AIM]   [FIRE]     │  ← bottom control zones
//   └───────────────────────────────────────────────┘
//
// The canvas draws its compact bottom strip (ammo / time) exactly in the
// horizontal gap between the left and right control zones.

export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ControlSizes {
  joystick: number;
  thumb: number;
  button: number;
  fire: number;
  pause: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ControlZones {
  joystick: Rect;
  weapon: Rect;
  reload: Rect;
  aim: Rect;
  fire: Rect;
  bomb: Rect;
  pause: Rect;
}

export interface HudZones {
  controls: ControlZones;
  /** Horizontal extent of the bottom-left control row. */
  leftControlEnd: number;
  /** Horizontal start of the bottom-right control cluster. */
  rightControlStart: number;
  /** Bottom strip the canvas HUD may use for ammo/time. */
  bottomStrip: Rect;
  /** Top-left HP/armor/level panel (canvas). */
  topLeft: Rect;
  /** Top-center wave block (canvas). */
  wave: Rect;
  /** Reserved right gutter so the pause button never covers the canvas HUD. */
  pauseGutter: number;
}

const BASE_PAD = 10;
const GAP = 12;
/** Pause button width + breathing room, reserved at the top-right edge. */
export const PAUSE_GUTTER = 60;

/** Clamped touch-target sizes driven by the smaller viewport dimension. */
export function computeControlSizes(vw: number, vh: number): ControlSizes {
  const base = Math.min(vw, vh); // landscape → the height; portrait → width
  const joystick = Math.round(Math.max(96, Math.min(150, base * 0.3)));
  const thumb = Math.round(joystick * 0.46);
  const button = Math.round(Math.max(50, Math.min(66, base * 0.15)));
  const fire = Math.round(Math.max(62, Math.min(96, button * 1.35)));
  const pause = Math.round(Math.max(38, Math.min(48, button * 0.85)));
  return { joystick, thumb, button, fire, pause };
}

/**
 * Touch minimap edge: shrinks with the viewport height so the map always
 * ends ABOVE the bottom-right control cluster (the BOMB column sits
 * directly above FIRE at the corner). mapY (the minimap's top edge) is the
 * score block bottom + gap = 10 + 84 + 6 = 100 CSS px (safe-inset ignored;
 * a notch top inset only shrinks the map further — safe).
 */
export function touchMinimapSize(vh: number): number {
  const base = Math.max(0, vh);
  const button = Math.round(Math.max(50, Math.min(66, base * 0.15)));
  const fire = Math.round(Math.max(62, Math.min(96, button * 1.35)));
  const bombTop = base - 10 - fire - 12 - button;
  const available = bombTop - 12 - 100;
  return Math.round(Math.max(56, Math.min(100, available)));
}

/** Height of the touch top-right SCORE/MONEY block (computeHudBlock). */
export const TOUCH_SCORE_BLOCK_H = 84;
/** Minimap top edge = score block bottom + 6px gap (zero top inset). */
export const TOUCH_MINIMAP_TOP = 10 + TOUCH_SCORE_BLOCK_H + 6;

/**
 * Compute the mobile-landscape zones for a viewport + safe-area insets.
 * All coordinates are CSS/canvas pixels relative to the viewport top-left.
 */
export function hudZones(
  vw: number,
  vh: number,
  insets: SafeInsets,
): HudZones {
  const s = computeControlSizes(vw, vh);
  const ml = BASE_PAD + insets.left;
  const mr = BASE_PAD + insets.right;
  const mt = BASE_PAD + insets.top;
  const mb = BASE_PAD + insets.bottom;

  // ── Bottom-left row: [JOYSTICK][WEAPON][RELOAD] ─────────────────────────
  const joyY = vh - mb - s.joystick;
  const joystick: Rect = { x: ml, y: joyY, w: s.joystick, h: s.joystick };
  const weapon: Rect = {
    x: ml + s.joystick + GAP,
    y: vh - mb - s.button,
    w: s.button,
    h: s.button,
  };
  const reload: Rect = {
    x: ml + s.joystick + GAP + s.button + GAP,
    y: vh - mb - s.button,
    w: s.button,
    h: s.button,
  };

  // ── Bottom-right: FIRE at the corner, AIM left of it, BOMB directly above
  //    FIRE (its own column — never directly under another control). ────────
  const fire: Rect = {
    x: vw - mr - s.fire,
    y: vh - mb - s.fire,
    w: s.fire,
    h: s.fire,
  };
  const aim: Rect = {
    x: fire.x - GAP - s.joystick,
    y: vh - mb - s.joystick,
    w: s.joystick,
    h: s.joystick,
  };
  const bomb: Rect = {
    x: fire.x,
    y: fire.y - GAP - s.button,
    w: s.button,
    h: s.button,
  };
  const pause: Rect = {
    x: vw - mr - s.pause,
    y: mt,
    w: s.pause,
    h: s.pause,
  };

  const leftEnd = ml + s.joystick + GAP + s.button + GAP + s.button;
  const rightStart = aim.x;

  // ── Canvas bottom strip: the horizontal gap between the two zones. ──────
  const stripX = leftEnd + GAP;
  const stripW = Math.max(0, rightStart - GAP - stripX);
  const stripH = 40;
  const stripY = vh - mb - stripH;

  // ── Top-left HP panel — capped so it never reaches the centered WAVE. ──
  const topLeftW = Math.round(Math.max(200, Math.min(260, vw * 0.38)));
  const topLeft: Rect = { x: ml, y: mt, w: topLeftW, h: 96 };

  // ── Top-center WAVE block (kept clear of both side panels). ─────────────
  const wave: Rect = { x: vw / 2, y: mt, w: 0, h: 34 };

  return {
    controls: { joystick, weapon, reload, aim, fire, bomb, pause },
    leftControlEnd: leftEnd,
    rightControlStart: rightStart,
    bottomStrip: { x: stripX, y: stripY, w: stripW, h: stripH },
    topLeft,
    wave,
    pauseGutter: PAUSE_GUTTER,
  };
}