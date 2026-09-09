// tests/hudLayout.test.ts
// The mobile (touch-mode) layout is defined ONCE in src/game/hudLayout.ts and
// consumed by BOTH the canvas HUD (ui.ts) and the React controls (TouchHUD).
// These tests lock in the "no overlap, no off-screen" contract for every
// required resolution — the geometry is provable without a browser, so the
// same math can never drift apart in two places.
//
// Strict no-overlap assertions apply to LANDSCAPE (vw > vh): that is the
// playable mobile orientation — portrait shows the rotate overlay and the
// controls are hidden (game PAUSED), so only sanity is asserted there.
import { describe, test, expect } from "vitest";
import {
  hudZones,
  PAUSE_GUTTER,
  TOUCH_MINIMAP_TOP,
  touchMinimapSize,
  type Rect,
} from "@/game/hudLayout";

const INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

// From the spec: portrait + landscape for phones and tablets.
const RESOLUTIONS: [number, number][] = [
  [320, 568], // small phone portrait
  [568, 320], // small phone landscape
  [360, 640],
  [640, 360],
  [390, 844],
  [844, 390],
  [412, 915],
  [915, 412],
  [800, 360], // tiny landscape
  [854, 480],
  [768, 1024], // tablet portrait
  [1024, 768], // tablet landscape
  [1194, 834], // iPad Pro 11 landscape
];

function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function inside(vw: number, vh: number, r: Rect): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= vw && r.y + r.h <= vh;
}

describe("hudLayout zones", () => {
  for (const [vw, vh] of RESOLUTIONS) {
    const landscape = vw > vh;

    test(`controls stay inside the viewport at ${vw}x${vh}`, () => {
      const { controls } = hudZones(vw, vh, INSETS);
      for (const [name, r] of Object.entries(controls)) {
        expect(inside(vw, vh, r), `${name} off-screen`).toBe(true);
      }
    });

    test(`controls never overlap each other at ${vw}x${vh}`, () => {
      const { controls } = hudZones(vw, vh, INSETS);
      const entries = Object.entries(controls);
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const [an, a] = entries[i];
          const [bn, b] = entries[j];
          if (landscape) {
            expect(intersects(a, b), `${an} overlaps ${bn}`).toBe(false);
          }
        }
      }
    });

    test(`controls never overlap the canvas HUD at ${vw}x${vh}`, () => {
      const z = hudZones(vw, vh, INSETS);
      const mini = touchMinimapSize(vh);
      const top: Rect[] = [
        z.topLeft,
        { x: z.wave.x - 64, y: z.wave.y, w: 128, h: 34 },
        // Top-right score block + minimap panel, same x/width anchor as
        // computeHudBlock (block.w >= 100; 260 is a conservative superset).
        {
          x: vw - 10 - PAUSE_GUTTER - 260,
          y: 10,
          w: 260,
          h: TOUCH_MINIMAP_TOP - 10 + mini + 6,
        },
      ];
      for (const t of top) {
        for (const [name, c] of Object.entries(z.controls)) {
          if (landscape) {
            expect(intersects(t, c), `${name} overlaps top HUD`).toBe(false);
          }
        }
      }
    });

    test(`bottom strip fits between the control zones at ${vw}x${vh}`, () => {
      const z = hudZones(vw, vh, INSETS);
      if (landscape) {
        // A usable strip must exist (positive width) — i.e. the left and
        // right control rows never collide even on the narrowest landscape.
        expect(z.bottomStrip.w).toBeGreaterThan(0);
        for (const [name, c] of Object.entries(z.controls)) {
          expect(intersects(z.bottomStrip, c), `strip overlaps ${name}`).toBe(
            false,
          );
        }
      }
    });

    test(`bottom-left row and right cluster never merge at ${vw}x${vh}`, () => {
      const z = hudZones(vw, vh, INSETS);
      if (landscape) {
        expect(
          z.rightControlStart - z.leftControlEnd,
        ).toBeGreaterThanOrEqual(0);
      }
    });
  }

  test("safe-area insets shift controls inward", () => {
    const vw = 844;
    const vh = 390;
    const insets = { top: 47, right: 21, bottom: 21, left: 47 };
    const a = hudZones(vw, vh, INSETS);
    const b = hudZones(vw, vh, insets);
    expect(b.controls.fire.x + b.controls.fire.w).toBeLessThan(
      a.controls.fire.x + a.controls.fire.w,
    );
    expect(b.controls.joystick.x).toBeGreaterThan(a.controls.joystick.x);
    expect(b.controls.joystick.y + b.controls.joystick.h).toBeLessThan(
      a.controls.joystick.y + a.controls.joystick.h,
    );
  });

  test("touch targets respect the 44-48px floor", () => {
    for (const [vw, vh] of RESOLUTIONS) {
      const s = hudZones(vw, vh, INSETS).controls;
      expect(s.joystick.w).toBeGreaterThanOrEqual(96);
      expect(s.fire.w).toBeGreaterThanOrEqual(62);
      expect(s.bomb.w).toBeGreaterThanOrEqual(50);
      expect(s.reload.w).toBeGreaterThanOrEqual(50);
      expect(s.weapon.w).toBeGreaterThanOrEqual(50);
    }
  });

  test("minimap always ends above the bomb column (short screens)", () => {
    for (const vh of [320, 360, 390, 480]) {
      const vw = 900;
      const z = hudZones(vw, vh, INSETS);
      const mini = touchMinimapSize(vh);
      const mapBottom = TOUCH_MINIMAP_TOP + mini;
      expect(mapBottom).toBeLessThanOrEqual(z.controls.bomb.y);
    }
  });
});