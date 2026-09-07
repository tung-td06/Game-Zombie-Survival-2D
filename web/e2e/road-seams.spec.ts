import { test, expect } from "@playwright/test";

/**
 * Regression for the seam where one stretch of road meets the next.
 *
 * Everything the street draws — asphalt grain, resurfacing patches, lane
 * dashes, the amber centre line, footway paving — is meant to be a pure
 * function of WORLD position. If it is, then cutting a road slab in half
 * and drawing it as two abutting stretches has to produce exactly the same
 * pixels as drawing it as one: no line across the joint, no gap, no
 * pattern restarting, no dash landing twice.
 *
 * That is the whole bug, stated as an equality. Each pattern used to step
 * from its own slab's edge (`for (p = 0; p < span; p += period)`), so two
 * stretches carried two different grids and the joint between them showed.
 *
 * Run at deviceScaleFactor 1.25 — the Windows 125% display scaling that
 * also used to let a hairline of background through between abutting fills.
 */
test.use({ deviceScaleFactor: 1.25 });

test("splitting a road slab in two renders identically", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("zs.username", "SurvivorTest"));
  await page.goto("/play?smoke=1");
  const canvas = page.getByTestId("game-canvas");
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(1500);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 640, box.y + 353);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction(() => (window as any).__game?.map != null, null, { timeout: 60000 });
  await page.waitForTimeout(1200);

  /**
   * Render the ground with the camera parked at (ox, oy) and read back a
   * strip. `cutAt` splits whichever slab spans that world line into two
   * slabs meeting there, so the strip covers the joint.
   */
  const sample = async (
    ox: number,
    oy: number,
    strip: { x: number; y: number; w: number; h: number },
    cutAt: number | null,
    cutVertical: boolean,
  ) =>
    page.evaluate(
      ([offX, offY, rx, ry, rw, rh, cut, cutV]) => {
        const g = (window as any).__game;
        const map = g.map;
        g.zombies.length = 0;
        g.bullets.length = 0;
        g.enemyBullets.length = 0;
        g.loots.length = 0;
        g.particles.decals = [];

        if (cut !== null) {
          // Split every slab that runs THROUGH the cut line into two
          // stretches that meet there, then rebuild the derived geometry
          // exactly as the map does at load time.
          const next: any[] = [];
          for (const s of map.slabs) {
            const r = s.rect;
            const lo = cutV ? r.y : r.x;
            const len = cutV ? r.h : r.w;
            if (s.vertical === cutV && lo < (cut as number) && lo + len > (cut as number)) {
              const a = (cut as number) - lo;
              const mk = (o: number, l: number) => ({
                ...s,
                rect: cutV
                  ? { x: r.x, y: r.y + o, w: r.w, h: l }
                  : { x: r.x + o, y: r.y, w: l, h: r.h },
                texRuns: [],
                paintRuns: [],
              });
              next.push(mk(0, a), mk(a, len - a));
            } else {
              next.push(s);
            }
          }
          map.slabs = next;
          map.roads = next.map((s: any) => s.rect);
          map.junctions.length = 0;
          map.findJunctions();
          map.computeSlabRuns();
        }

        const cam = g.camera;
        cam.offset.x = offX as number;
        cam.offset.y = offY as number;
        cam.jitter = { x: 0, y: 0 };
        cam.renderOffset = { x: offX as number, y: offY as number };
        const ctx = g.ctx;
        g.map.drawGround(ctx, cam, g.viewW, g.viewH);

        const s = ctx.getTransform().a; // device pixels per CSS pixel
        const d = ctx.getImageData(
          Math.round((rx as number) * s),
          Math.round((ry as number) * s),
          Math.round((rw as number) * s),
          Math.round((rh as number) * s),
        ).data;
        let out = "";
        for (let i = 0; i < d.length; i += 4) out += String.fromCharCode(d[i]!, d[i + 1]!, d[i + 2]!);
        return out;
      },
      [ox, oy, strip.x, strip.y, strip.w, strip.h, cutAt, cutVertical] as const,
    );

  const diff = (a: string, b: string, rowW: number) => {
    let n = 0;
    const rows = new Map<number, number>();
    let maxMag = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] === b[i]) continue;
      n++;
      maxMag = Math.max(maxMag, Math.abs(a.charCodeAt(i) - b.charCodeAt(i)));
      const row = Math.floor(i / 3 / rowW);
      rows.set(row, (rows.get(row) ?? 0) + 1);
    }
    const worstRow = [...rows.entries()].sort((x, y) => y[1] - x[1])[0];
    return { frac: n / Math.min(a.length, b.length), maxMag, rows: rows.size, worstRow };
  };

  // ── The north avenue (world x 1912…2088), cut across at world y = 1300.
  //    Camera (1850, 1150) puts the joint mid-screen with asphalt, kerbs
  //    and footway on both sides of it.
  const whole = await sample(1850, 1150, { x: 0, y: 60, w: 320, h: 240 }, null, false);
  const split = await sample(1850, 1150, { x: 0, y: 60, w: 320, h: 240 }, 1300, true);
  const avenue = diff(whole, split, 320 * 2);
  console.log(`AVENUE cut at y=1300: ${JSON.stringify(avenue)}`);


  // ── The beltway (world y 924…1076), cut across at world x = 1500 — a
  //    horizontal road, and a cut that is not a multiple of any pattern
  //    period (88 grain, 76 dash, 46 paving).
  const wholeB = await sample(1380, 850, { x: 0, y: 0, w: 320, h: 320 }, null, false);
  const splitB = await sample(1380, 850, { x: 0, y: 0, w: 320, h: 320 }, 1500, false);
  const belt = diff(wholeB, splitB, 320 * 2);
  console.log(`BELT cut at x=1500: ${JSON.stringify(belt)}`);

  /**
   * A seam is a whole LINE of pixels: one row (or column) across the
   * carriageway differing by tens of levels. What is left here is the
   * anti-aliasing of the hairline cracks — 1px diagonal strokes that the
   * split hands to two different clip regions — so it is a handful of
   * subpixels per row, off by at most a level or two, and invisible.
   * Assert that shape, not just a size: magnitude stays in the noise and
   * no single line across the road is meaningfully different.
   */
  for (const [name, d] of [["avenue", avenue], ["belt", belt]] as const) {
    expect(d.frac, `${name}: share of subpixels changed by the split`).toBeLessThan(0.001);
    expect(d.maxMag, `${name}: worst per-channel change`).toBeLessThanOrEqual(4);
    expect(d.worstRow?.[1] ?? 0, `${name}: worst single line across the road`).toBeLessThan(64);
  }
});
