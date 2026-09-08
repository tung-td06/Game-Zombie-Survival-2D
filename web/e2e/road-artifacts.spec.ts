import { test, expect } from "@playwright/test";

/**
 * Regression for the dark rectangular patches that appeared on the road.
 *
 * Nothing drawn on a carriageway may be a large, hard-edged block that is
 * markedly darker than the asphalt around it. The test does not look for
 * one known bad fill: it renders the ground layer across the whole city
 * and, for every road slab on screen, works out that slab's own median
 * asphalt luma, then flood-fills every connected region sitting well below
 * it. Real surface detail is small — a manhole is ~380px², a drain ~310,
 * a crack a thin line — so the assertion is a size limit on the darkest
 * connected region, which a full-width resurfacing block blows through by
 * more than an order of magnitude.
 *
 * The measurement is relative, not absolute: the patches that prompted
 * this were rgb(33,34,37) on rgb(46,47,51) asphalt — nowhere near black in
 * absolute terms, but a 28% step with a razor edge, which is exactly what
 * reads as a black rectangle on screen.
 */

/**
 * Two measurements, because a patch reads as a black rectangle for two
 * separate reasons and the fix has to hold on both counts: how big a dark
 * region is, and how far it reaches across the road.
 *
 * A step this far below the road's own median luma is a visible edge, not
 * surface texture. The near-black patch this test exists for sat 14 levels
 * down; the resurfacing tone that replaced it sits 5.
 */
const HARD = 12;
/** px²: a manhole is ~380, a storm drain ~310, a crack a thin line. */
const MAX_BLOB = 1200;
/** A line across the road counts as "dark" once this much of it is. */
const BAR_COVER = 0.6;
/** How far such a line may persist along the road before it is a bar. */
const MAX_BAR = 24;

test("no dark rectangles on the carriageway", async ({ page }) => {
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

  const worst = await page.evaluate(
    ([hard, barCover]) => {
      const g = (window as any).__game;
      const map = g.map;
      const cam = g.camera;
      const ctx = g.ctx;
      const vw = g.viewW as number;
      const vh = g.viewH as number;
      g.zombies.length = 0;
      g.bullets.length = 0;
      g.enemyBullets.length = 0;
      g.loots.length = 0;
      g.particles.decals = [];

      // Widest road last, so at a crossing the mask is owned by the slab
      // that actually painted the junction (drawGround paints narrow first).
      const slabs = [...map.slabs].sort(
        (a: any, b: any) =>
          Math.min(a.rect.w, a.rect.h) - Math.min(b.rect.w, b.rect.h),
      );

      let worstBlob = 0;
      let worstAt = "";
      let worstBar = 0;
      let worstBarAt = "";

      for (let oy = 0; oy < 4000; oy += vh - 40) {
        for (let ox = 0; ox < 4000; ox += vw - 40) {
          cam.offset.x = ox;
          cam.offset.y = oy;
          cam.jitter = { x: 0, y: 0 };
          cam.renderOffset = { x: ox, y: oy };
          ctx.setTransform(ctx.getTransform().a, 0, 0, ctx.getTransform().a, 0, 0);
          ctx.fillStyle = "#10120E";
          ctx.fillRect(0, 0, vw, vh);
          map.drawGround(ctx, cam, vw, vh);

          const s = ctx.getTransform().a;
          const W = Math.round(vw * s);
          const H = Math.round(vh * s);
          const img = ctx.getImageData(0, 0, W, H).data;

          // Carriageway mask, one id per slab, inset past the kerb so the
          // kerb shadow and the footway are never counted.
          const owner = new Uint16Array(W * H);
          for (let k = 0; k < slabs.length; k++) {
            const sl = slabs[k]!;
            const r = sl.rect;
            const inx = sl.vertical ? 14 : 6;
            const iny = sl.vertical ? 6 : 14;
            const x0 = Math.max(0, Math.round((r.x + inx - ox) * s));
            const x1 = Math.min(W, Math.round((r.x + r.w - inx - ox) * s));
            const y0 = Math.max(0, Math.round((r.y + iny - oy) * s));
            const y1 = Math.min(H, Math.round((r.y + r.h - iny - oy) * s));
            if (x1 <= x0 || y1 <= y0) continue;
            for (let y = y0; y < y1; y++) owner.fill(k + 1, y * W + x0, y * W + x1);
          }

          // Per-slab median luma, from a 256-bin histogram.
          const hist = new Int32Array((slabs.length + 1) * 256);
          const count = new Int32Array(slabs.length + 1);
          const luma = new Uint8Array(W * H);
          for (let i = 0; i < owner.length; i++) {
            const k = owner[i]!;
            if (!k) continue;
            const p = i * 4;
            const l = Math.round((img[p]! * 299 + img[p + 1]! * 587 + img[p + 2]! * 114) / 1000);
            luma[i] = l;
            hist[k * 256 + l]!;
            hist[k * 256 + l] = hist[k * 256 + l]! + 1;
            count[k] = count[k]! + 1;
          }
          const median = new Int32Array(slabs.length + 1);
          for (let k = 1; k <= slabs.length; k++) {
            const half = count[k]! >> 1;
            let acc = 0;
            for (let l = 0; l < 256; l++) {
              acc += hist[k * 256 + l]!;
              if (acc > half) { median[k] = l; break; }
            }
          }

          // Flood-fill every connected region sitting `drop` levels below
          // its own road's median, and measure it two ways: how big it is,
          // and how much of the carriageway width it spans.
          const scan = (drop: number, onBlob: (b: any) => void) => {
            const dark = new Uint8Array(W * H);
            for (let i = 0; i < owner.length; i++) {
              const k = owner[i]!;
              if (!k || count[k]! < 400) continue;
              if (luma[i]! < median[k]! - drop) dark[i] = 1;
            }
            const stack: number[] = [];
            for (let i = 0; i < dark.length; i++) {
              if (!dark[i]) continue;
              let n = 0;
              stack.push(i);
              dark[i] = 0;
              let bx0 = W, bx1 = 0, by0 = H, by1 = 0;
              while (stack.length) {
                const j = stack.pop()!;
                n++;
                const x = j % W;
                const y = (j - x) / W;
                if (x < bx0) bx0 = x;
                if (x > bx1) bx1 = x;
                if (y < by0) by0 = y;
                if (y > by1) by1 = y;
                if (x > 0 && dark[j - 1]) { dark[j - 1] = 0; stack.push(j - 1); }
                if (x < W - 1 && dark[j + 1]) { dark[j + 1] = 0; stack.push(j + 1); }
                if (j >= W && dark[j - W]) { dark[j - W] = 0; stack.push(j - W); }
                if (j < dark.length - W && dark[j + W]) { dark[j + W] = 0; stack.push(j + W); }
              }
              const sl = slabs[owner[i]! - 1]!;
              const q = i * 4;
              onBlob({
                area: n / (s * s),
                where:
                  `world ${ox + Math.round(bx0 / s)},${oy + Math.round(by0 / s)}` +
                  `..${ox + Math.round(bx1 / s)},${oy + Math.round(by1 / s)} ` +
                  `rgb(${img[q]},${img[q + 1]},${img[q + 2]}) on ${sl.cls} (median luma ${median[owner[i]!]})`,
              });
            }
          };

          scan(hard as number, (b) => {
            if (b.area > worstBlob) { worstBlob = b.area; worstAt = b.where; }
          });

          // A bar across the road: consecutive lines, perpendicular to the
          // road, that are mostly dark. This is the shape of the artifact
          // stated directly — the old patch made 88 such lines in a row,
          // every one of them 100% dark, on every fourth cell of every road.
          for (let k = 0; k < slabs.length; k++) {
            const sl = slabs[k]!;
            const r = sl.rect;
            const inx = sl.vertical ? 14 : 6;
            const iny = sl.vertical ? 6 : 14;
            const x0 = Math.max(0, Math.round((r.x + inx - ox) * s));
            const x1 = Math.min(W, Math.round((r.x + r.w - inx - ox) * s));
            const y0 = Math.max(0, Math.round((r.y + iny - oy) * s));
            const y1 = Math.min(H, Math.round((r.y + r.h - iny - oy) * s));
            if (x1 <= x0 || y1 <= y0) continue;
            const lo = median[k + 1]! - (hard as number);
            const nAlong = sl.vertical ? y1 - y0 : x1 - x0;
            const nAcross = sl.vertical ? x1 - x0 : y1 - y0;
            if (nAcross < (sl.vertical ? r.w - 28 : r.h - 28) * s * 0.9) continue; // clipped by the screen edge
            let run = 0;
            for (let a = 0; a < nAlong; a++) {
              let dk = 0;
              for (let c = 0; c < nAcross; c++) {
                const x = sl.vertical ? x0 + c : x0 + a;
                const y = sl.vertical ? y0 + a : y0 + c;
                const i = y * W + x;
                if (owner[i] === k + 1 && luma[i]! < lo) dk++;
              }
              run = dk / nAcross >= (barCover as number) ? run + 1 : 0;
              const len = run / s;
              if (len > worstBar) {
                worstBar = len;
                const wx = sl.vertical ? r.x + r.w / 2 : ox + Math.round((x0 + a) / s);
                const wy = sl.vertical ? oy + Math.round((y0 + a) / s) : r.y + r.h / 2;
                worstBarAt = `world ${Math.round(wx)},${Math.round(wy)} on ${sl.cls}`;
              }
            }
          }
        }
      }
      return { worstBlob, worstAt, worstBar, worstBarAt };
    },
    [HARD, BAR_COVER] as const,
  );

  console.log(`worst hard-edged dark region: ${worst.worstBlob.toFixed(0)}px² — ${worst.worstAt}`);
  console.log(`longest dark bar across a road: ${worst.worstBar.toFixed(0)}px — ${worst.worstBarAt}`);
  expect(worst.worstBlob, "largest hard-edged dark region on a carriageway").toBeLessThan(MAX_BLOB);
  expect(worst.worstBar, "length of the longest dark bar across a road").toBeLessThan(MAX_BAR);
});

/**
 * The ground layer must cover the frame whatever shape the frame is.
 *
 * `drawGround` tiles terrain from `floor(view/TILE)*TILE` and the road
 * network is drawn from world rects, so an odd viewport, a fractional
 * camera or a mid-run resize must never leave a strip of the clear colour
 * showing — the other way a black rectangle gets onto the screen.
 */
test("no unrendered background survives a resize", async ({ page }) => {
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

  for (const size of [
    { width: 1280, height: 720 },
    { width: 1013, height: 641 },
    { width: 800, height: 600 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(350);
    const holes = await page.evaluate(() => {
      const g = (window as any).__game;
      const cam = g.camera;
      const ctx = g.ctx;
      let worst = 0;
      // Fractional camera offsets on purpose: the sub-pixel case is where
      // abutting fills used to let the background through.
      for (const [ox, oy] of [[1911.4, 999.6], [2000.5, 1500.5], [1237.3, 2044.9]]) {
        cam.offset.x = ox;
        cam.offset.y = oy;
        cam.jitter = { x: 0, y: 0 };
        cam.renderOffset = { x: Math.round(ox), y: Math.round(oy) };
        ctx.setTransform(ctx.getTransform().a, 0, 0, ctx.getTransform().a, 0, 0);
        ctx.fillStyle = "#10120E";
        ctx.fillRect(0, 0, g.viewW, g.viewH);
        g.map.drawGround(ctx, cam, g.viewW, g.viewH);
        const s = ctx.getTransform().a;
        const W = Math.round(g.viewW * s);
        const H = Math.round(g.viewH * s);
        const d = ctx.getImageData(0, 0, W, H).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] === 16 && d[i + 1] === 18 && d[i + 2] === 14) n++;
        }
        worst = Math.max(worst, n);
      }
      return worst;
    });
    expect(holes, `unrendered pixels at ${size.width}x${size.height}`).toBe(0);
  }
});
