import { test, expect } from "@playwright/test";

/**
 * The street network has to render as ONE surface, not as a mosaic of
 * separately-drawn pieces. Three properties say that, and each one is a
 * class of bug the map used to have:
 *
 *   1. every carriageway on the map is the same asphalt — the road classes
 *      once carried different HUES (blue-grey avenues, green-grey ring
 *      roads), so a link running into a beltway put a rectangle of visibly
 *      different-coloured road in the middle of the junction;
 *   2. the two footways beside a road are mirror images — `drawSidewalkBand`
 *      laid the shoulder and the kerb the same way round on both sides, so
 *      every street in the city had a correct kerb on one side and, on the
 *      other, a strip of dark earth against the asphalt and the kerb stone
 *      facing the buildings.
 *
 * Both are measured from the rendered pixels, at world positions taken from
 * the map's own geometry, so the test says nothing about where any
 * particular road is.
 *
 * The third class of bug — the ground itself coming out as a grid of
 * hard-edged rectangles — is pinned where it is caused rather than where it
 * shows: see `tests/terrainShading.test.ts`, which holds the shading field
 * to being continuous.
 */

async function boot(page: import("@playwright/test").Page) {
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
  await page.evaluate(HARNESS);
}

/**
 * Set up a page-side helper that renders the ground layer at a chosen
 * camera offset and can read world pixels back out of it.
 */
const HARNESS = () => {
  const g = (window as any).__game;
  g.zombies.length = 0;
  g.bullets.length = 0;
  g.enemyBullets.length = 0;
  g.loots.length = 0;
  g.grenades.length = 0;
  g.supplyCrates.length = 0;
  g.particles.decals = [];
  const cam = g.camera;
  const ctx = g.ctx;
  let img: Uint8ClampedArray | null = null;
  let W = 0;
  let ox = 0;
  let oy = 0;
  let scale = 1;
  (window as any).__render = (x: number, y: number) => {
    ox = Math.round(x);
    oy = Math.round(y);
    cam.offset.x = ox;
    cam.offset.y = oy;
    cam.jitter = { x: 0, y: 0 };
    cam.renderOffset = { x: ox, y: oy };
    scale = ctx.getTransform().a;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = "#10120E";
    ctx.fillRect(0, 0, g.viewW, g.viewH);
    g.map.drawGround(ctx, cam, g.viewW, g.viewH);
    W = Math.round(g.viewW * scale);
    img = ctx.getImageData(0, 0, W, Math.round(g.viewH * scale)).data;
  };
  (window as any).__luma = (wx: number, wy: number): number => {
    const x = Math.round((wx - ox) * scale);
    const y = Math.round((wy - oy) * scale);
    const p = (y * W + x) * 4;
    const d = img!;
    return (d[p]! * 299 + d[p + 1]! * 587 + d[p + 2]! * 114) / 1000;
  };
  (window as any).__rgb = (wx: number, wy: number): number[] => {
    const x = Math.round((wx - ox) * scale);
    const y = Math.round((wy - oy) * scale);
    const p = (y * W + x) * 4;
    const d = img!;
    return [d[p]!, d[p + 1]!, d[p + 2]!];
  };
  (window as any).__view = () => ({ w: g.viewW, h: g.viewH });
};

test("every carriageway on the map is the same asphalt", async ({ page }) => {
  await boot(page);
  const stats = await page.evaluate(() => {
    const map = (window as any).__game.map;
    const view = (window as any).__view();
    const render = (window as any).__render;
    const rgb = (window as any).__rgb;

    // For each slab, sample the carriageway well inside the kerbs and away
    // from any crossing road, and take the modal colour — the colour of the
    // asphalt itself, with markings and surface detail voted out.
    const out: Array<{ cls: string; vertical: boolean; rgb: number[]; at: string }> = [];
    for (const s of map.slabs) {
      const r = s.rect;
      // The longest stretch of this slab with no crossing road on it.
      let best: [number, number] | null = null;
      for (const [a, b] of s.paintRuns as Array<[number, number]>) {
        if (!best || b - a > best[1] - best[0]) best = [a, b];
      }
      if (!best || best[1] - best[0] < 200) continue;
      const mid = (best[0] + best[1]) / 2;
      const cx = s.vertical ? r.x + r.w / 2 : r.x + mid;
      const cy = s.vertical ? r.y + mid : r.y + r.h / 2;
      render(Math.round(cx - view.w / 2), Math.round(cy - view.h / 2));
      const tally = new Map<string, number>();
      const across = s.vertical ? r.w : r.h;
      for (let i = -60; i <= 60; i += 2) {
        for (let j = -Math.round(across / 2) + 20; j <= Math.round(across / 2) - 20; j += 2) {
          const px = s.vertical ? cx + j : cx + i;
          const py = s.vertical ? cy + i : cy + j;
          const k = rgb(px, py).join(",");
          tally.set(k, (tally.get(k) ?? 0) + 1);
        }
      }
      const modal = [...tally].sort((a, b) => b[1] - a[1])[0]![0];
      out.push({
        cls: s.cls,
        vertical: s.vertical,
        rgb: modal.split(",").map(Number),
        at: `${Math.round(cx)},${Math.round(cy)}`,
      });
    }
    return out;
  });

  expect(stats.length, "road stretches sampled").toBeGreaterThan(15);

  // Hue: the red/blue balance of the asphalt must not flip between roads.
  // That flip is what made a link read as a different material from the
  // beltway it ran into.
  const tilt = stats.map((s) => s.rgb[2]! - s.rgb[0]!);
  const lows = stats.filter((s) => s.rgb[2]! - s.rgb[0]! < 2);
  console.log(
    `asphalt samples: ${stats.length}, blue-minus-red ${Math.min(...tilt)}..${Math.max(...tilt)}`,
  );
  expect(
    lows.map((s) => `${s.cls} ${s.at} rgb(${s.rgb})`).join(" | ") || "none",
    "roads whose asphalt is not the shared blue-grey",
  ).toBe("none");

  // Brightness: the whole network sits inside a narrow band, and a vertical
  // stretch is never a different tone from a horizontal one.
  const luma = stats.map((s) => s.rgb[0]! * 0.299 + s.rgb[1]! * 0.587 + s.rgb[2]! * 0.114);
  const spread = Math.max(...luma) - Math.min(...luma);
  console.log(`asphalt luma spread across the network: ${spread.toFixed(1)}`);
  expect(spread, "brightness spread across every carriageway on the map").toBeLessThan(8);

  const byAxis = (v: boolean) => {
    const l = stats.filter((s) => s.vertical === v).map(
      (s) => s.rgb[0]! * 0.299 + s.rgb[1]! * 0.587 + s.rgb[2]! * 0.114,
    );
    return l.reduce((a, b) => a + b, 0) / l.length;
  };
  expect(
    Math.abs(byAxis(true) - byAxis(false)),
    "vertical vs horizontal mean asphalt brightness",
  ).toBeLessThan(3);
});

test("both footways beside a road are mirror images", async ({ page }) => {
  await boot(page);
  const bad = await page.evaluate(() => {
    const map = (window as any).__game.map;
    const view = (window as any).__view();
    const render = (window as any).__render;
    const luma = (window as any).__luma;
    const SIDEWALK = 28;

    const problems: string[] = [];
    let checked = 0;
    for (const s of map.slabs) {
      const r = s.rect;
      // Sample a stretch with no crossing road and no street lamp near it:
      // a lamp throws a pool of light onto the footway that is brighter
      // than the kerb stone, which would drown out what is being measured.
      let pick: number | null = null;
      for (const [a, b] of s.paintRuns as Array<[number, number]>) {
        if (b - a < 200) continue;
        for (let m = a + 100; m < b - 100 && pick === null; m += 20) {
          const px = s.vertical ? r.x + r.w / 2 : r.x + m;
          const py = s.vertical ? r.y + m : r.y + r.h / 2;
          const near = map.streetLamps.some(
            (l: { x: number; y: number }) =>
              Math.abs(l.x - px) < 150 && Math.abs(l.y - py) < 150,
          );
          if (!near) pick = m;
        }
        if (pick !== null) break;
      }
      if (pick === null) continue;
      const cx = s.vertical ? r.x + r.w / 2 : r.x + pick;
      const cy = s.vertical ? r.y + pick : r.y + r.h / 2;
      render(Math.round(cx - view.w / 2), Math.round(cy - view.h / 2));

      // Walk outward from each kerb line into the footway. `d` is the
      // distance from the asphalt edge, so the two sides are directly
      // comparable — and what is asserted is WHERE the kerb and the earth
      // shoulder sit relative to the road, not how bright they happen to be
      // over this district's ground.
      const lo = s.vertical ? r.x : r.y;
      const hi = s.vertical ? r.x + r.w : r.y + r.h;
      const profile = (edge: number, dir: number) => {
        const out: number[] = [];
        for (let d = 1; d < SIDEWALK; d++) {
          const p = edge + dir * d;
          out.push(s.vertical ? luma(p, cy) : luma(cx, p));
        }
        return out;
      };
      const argmax = (v: number[]) => v.indexOf(Math.max(...v)) + 1;
      // The darkest pixel of all is the kerb's own shadow lip, which sits
      // hard against the asphalt by design — skip it and look for the earth
      // shoulder in the body of the footway.
      const argmin = (v: number[]) => {
        const tail = v.slice(2);
        return tail.indexOf(Math.min(...tail)) + 3;
      };
      const near = profile(lo, -1);
      const far = profile(hi, 1);
      checked++;
      const where = `${s.cls} at ${Math.round(cx)},${Math.round(cy)}`;
      // The kerb stone is the brightest thing in the band and belongs
      // against the asphalt; the earth shoulder is the darkest and belongs
      // at the block edge. On the mirrored side both used to be the other
      // way round.
      for (const [name, v] of [["near", near], ["far", far]] as const) {
        const k = argmax(v as number[]);
        const h = argmin(v as number[]);
        if (k > 6) problems.push(`${where}: ${name} kerb is ${k}px from the asphalt, not against it`);
        if (h < SIDEWALK - 8) problems.push(`${where}: ${name} shoulder is ${h}px from the asphalt, not at the block`);
      }
    }
    return { problems: problems.slice(0, 8), checked };
  });

  console.log(`footway pairs checked: ${bad.checked}`);
  expect(bad.checked, "road stretches with both footways sampled").toBeGreaterThan(15);
  expect(bad.problems.join("\n") || "none", "footways that are not mirror images").toBe("none");
});
