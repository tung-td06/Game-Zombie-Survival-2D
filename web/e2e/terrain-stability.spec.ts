import { test, expect } from "@playwright/test";

/**
 * Regression for the shimmering ground: the terrain is meant to be a pure
 * function of world position, so the SAME world rectangle must render to
 * the same pixels no matter where the camera is. Shift the camera by a few
 * pixels, crop the region that maps back to the same world coordinates,
 * and the two crops must be identical.
 */
test("ground does not shimmer when the camera moves", async ({ page }) => {
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

  // Freeze everything that legitimately animates, then render one frame at
  // a chosen camera offset and read back a strip of the ground.
  const sample = async (ox: number, oy: number, cropX: number) =>
    page.evaluate(
      ([offX, offY, cx]) => {
        const g = (window as any).__game;
        g.zombies.length = 0;
        g.bullets.length = 0;
        g.enemyBullets.length = 0;
        g.loots.length = 0;
        g.particles.decals = [];
        const cam = g.camera;
        cam.offset.x = offX;
        cam.offset.y = offY;
        cam.jitter = { x: 0, y: 0 };
        cam.renderOffset = { x: offX, y: offY };
        const ctx = g.ctx;
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.map.drawGround(ctx, cam, g.viewW, g.viewH);
        // 200x200 strip of pure ground, read in device pixels.
        const d = ctx.getImageData(cx * dpr, 300 * dpr, 200 * dpr, 200 * dpr).data;
        let out = "";
        for (let i = 0; i < d.length; i += 4) out += String.fromCharCode(d[i], d[i + 1], d[i + 2]);
        return out;
      },
      [ox, oy, cropX] as const,
    );

  // Same world region: camera moves +7px right, crop moves 7px left.
  const a = await sample(1200, 3000, 500);
  const b = await sample(1207, 3000, 493);
  const c = await sample(1211, 3000, 489);

  const diff = (x: string, y: string) => {
    let n = 0;
    for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) n++;
    return n / Math.min(x.length, y.length);
  };
  const d1 = diff(a, b);
  const d2 = diff(a, c);
  console.log(`SHIMMER: +7px=${(d1 * 100).toFixed(2)}%  +11px=${(d2 * 100).toFixed(2)}% of subpixels differ`);
  expect(d1).toBeLessThan(0.01);
  expect(d2).toBeLessThan(0.01);
});
