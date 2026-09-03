# Web Pixel-Art HD Survival Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Render the web game's playable world as a detailed, performant HD pixel-art survival scene without changing game mechanics.

**Architecture:** A reusable procedural atlas creates Canvas 2D sprites once and serves every world renderer. Map, combatants, projectiles, and loot retain their existing state and collision behavior but delegate drawing to this atlas. The game composes a low-resolution pixel-light overlay after world effects and before HUD.

**Tech Stack:** Next.js, TypeScript, Canvas 2D, Vitest, Playwright.

## Global Constraints

- Target desktop 1280×720 and 1920×1080; retain working mobile controls.
- Preserve coordinates, collisions, wave values, weapon data, saves, and public game APIs.
- Use generated Canvas sprites only: no external art dependency.
- Build/cache sprites once per pixel scale; no offscreen-canvas allocation in live frames.
- If an atlas sprite cannot be built, keep rendering the existing primitive for that category.

---

## File structure

- Create \`web/src/game/pixelArt.ts\`: palette, atlas, deterministic ground/decal helpers, sprite drawers, light overlay.
- Modify \`web/src/game/map.ts\`: terrain tile/decal pass and prop sprites.
- Modify \`web/src/game/player.ts\`, \`zombie.ts\`, \`bullet.ts\`, \`loot.ts\`, \`supplyCrate.ts\`: visual-only animation fields and atlas drawing.
- Modify \`web/src/game/particle.ts\`, \`game.ts\`: square effects, bounded decals, final lighting composition.
- Create \`web/tests/pixelArt.test.ts\`; modify \`web/tests/game_smoke.test.ts\`: cache/determinism/decal tests and complete canvas fake.

### Task 1: Cached pixel-art atlas and deterministic terrain helpers

**Files:**
- Create: \`web/src/game/pixelArt.ts\`
- Create: \`web/tests/pixelArt.test.ts\`

**Interfaces:**
- Produces: \`PixelArtAtlas\`, \`getPixelArtAtlas(ctx): PixelArtAtlas | null\`, \`pixelVariant(seed, x, y, variants): number\`, \`drawGroundTile(...)\`, and \`drawPixelLight(...)\`.
- Consumes: Canvas 2D context, world coordinates, obstacle kind strings, vectors.

- [ ] **Step 1: Write the failing deterministic variation test**

~~~ts
import { describe, expect, test } from "vitest";
import { pixelVariant } from "@/game/pixelArt";

describe("pixel art variation", () => {
  test("is stable and atlas-safe for a map cell", () => {
    const a = pixelVariant(20260823, 800, 1200, 5);
    expect(a).toBe(pixelVariant(20260823, 800, 1200, 5));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(5);
  });
});
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: \`npm test -- --run tests/pixelArt.test.ts\`

Expected: FAIL because \`pixelArt.ts\` does not exist.

- [ ] **Step 3: Implement the atlas and helpers**

~~~ts
export function pixelVariant(seed: number, x: number, y: number, variants: number): number {
  const h = Math.imul((x | 0) ^ Math.imul(y | 0, 374761393) ^ seed, 668265263);
  return ((h ^ (h >>> 13)) >>> 0) % variants;
}

export function getPixelArtAtlas(ctx: CanvasRenderingContext2D): PixelArtAtlas | null {
  // Return the cached atlas, building source canvases only on the first call.
}
~~~

Create 48 px terrain tiles for dirt, grass, grit, puddles, old blood, asphalt, and faded lane paint; 48–128 px prop sprites; keyed 64 px player/zombie/weapon/loot sprites; and a 96 px boss sprite. Disable image smoothing only while sprite sources are created and restore context state before returning. Return \`null\` without throwing when an offscreen context is unavailable.

- [ ] **Step 4: Run tests and typecheck**

Run: \`npm test -- --run tests/pixelArt.test.ts && npm run typecheck\`

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add web/src/game/pixelArt.ts web/tests/pixelArt.test.ts
git commit -m "feat: add cached pixel art renderer"
~~~

### Task 2: Detailed terrain and props

**Files:**
- Modify: \`web/src/game/map.ts:291-496\`
- Test: \`web/tests/pixelArt.test.ts\`

**Interfaces:**
- Consumes: \`pixelVariant\`, \`drawGroundTile\`, and \`drawPropSprite\` from \`pixelArt.ts\`.
- Produces: atlas-backed \`GameMap.drawGround()\` and \`GameMap.drawObstacles()\`, with unchanged \`Obstacle\`, roads, culling grid, and minimap.

- [ ] **Step 1: Extend the terrain test for repeatability**

~~~ts
test("does not change a terrain variation when the camera revisits it", () => {
  expect(pixelVariant(33, 128, 256, 6)).toBe(pixelVariant(33, 128, 256, 6));
});
~~~

- [ ] **Step 2: Verify the terrain contract**

Run: \`npm test -- --run tests/pixelArt.test.ts\`

Expected: PASS before map integration.

- [ ] **Step 3: Replace the ground and prop primitives**

~~~ts
for (let y = y0; y < y1; y += TILE_SIZE) {
  for (let x = x0; x < x1; x += TILE_SIZE) {
    drawGroundTile(ctx, x - cam.offset.x, y - cam.offset.y,
      pixelVariant(this.seed, x, y, 6), this.seed);
  }
}
~~~

Draw roads after terrain, with faded lane markings and curb shadows. Render buildings, houses, cars, containers, trees, crates, barricades, and lamps from cached sprites with a lower-right shadow. Retain the current primitive switch case as fallback per prop sprite, and do not change minimap data or collision bounds.

- [ ] **Step 4: Verify map integration**

Run: \`npm test -- --run tests/game_smoke.test.ts tests/pixelArt.test.ts && npm run typecheck\`

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add web/src/game/map.ts web/tests/pixelArt.test.ts
git commit -m "feat: render detailed pixel art map"
~~~

### Task 3: Combatant, weapon, projectile, and loot art

**Files:**
- Modify: \`web/src/game/player.ts:49-50,225-272\`
- Modify: \`web/src/game/zombie.ts:221-261\`
- Modify: \`web/src/game/bullet.ts:106-124\`
- Modify: \`web/src/game/loot.ts:98-118\`
- Modify: \`web/src/game/supplyCrate.ts:149-250\`
- Modify: \`web/tests/game_smoke.test.ts\`

**Interfaces:**
- Consumes: \`drawPlayerSprite\`, \`drawZombieSprite\`, \`drawProjectileSprite\`, and \`drawLootSprite\` from \`pixelArt.ts\`.
- Produces: unchanged public draw methods and visual-only player recoil/walk inputs.

- [ ] **Step 1: Make the smoke fake context atlas-compatible**

~~~ts
imageSmoothingEnabled = true;
getImageData() { return { data: new Uint8ClampedArray(4) } as ImageData; }
putImageData() {}
~~~

Make \`document.createElement("canvas")\` return a canvas with width/height and a drawing context implementing the same methods as \`FakeCtx\`.

- [ ] **Step 2: Run smoke before changing visual draw methods**

Run: \`npm test -- --run tests/game_smoke.test.ts\`

Expected: PASS.

- [ ] **Step 3: Add visual states and atlas drawing**

~~~ts
// Player.fire()
this.recoilTimer = 0.09;

// Player.draw() / Zombie.draw()
drawPlayerSprite(ctx, sp, this.angle, this.moving ? this.walkCycle : 0,
  this.recoilTimer, this.weapons.currentId, this.flashTimer > 0);
drawZombieSprite(ctx, sp, this.KIND, this.faceAngle, this.flash > 0,
  this.radius >= 30);
~~~

Player: four aim directions, four-frame walk, weapon layer, recoil, hit flash. Zombie: distinct silhouette/palette/gait per existing six kinds, hit flash, boss aura. Weapon effects: contrasting 2–4 px projectile heads and short trails. Loot and supply crates: 48 px readable key sprites and restrained pulse. Preserve player labels, HP bars, behavior, drops, and radii.

- [ ] **Step 4: Verify gameplay draw calls**

Run: \`npm test -- --run tests/game_smoke.test.ts && npm test && npm run typecheck\`

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add web/src/game/player.ts web/src/game/zombie.ts web/src/game/bullet.ts web/src/game/loot.ts web/src/game/supplyCrate.ts web/tests/game_smoke.test.ts
git commit -m "feat: add pixel art combatants and pickups"
~~~

### Task 4: Pixel effects, decals, and night-light composition

**Files:**
- Modify: \`web/src/game/particle.ts:11-19,234-261\`
- Modify: \`web/src/game/game.ts:714-726,787-790\`
- Test: \`web/tests/pixelArt.test.ts\`, \`web/tests/game_smoke.test.ts\`

**Interfaces:**
- Consumes: \`drawPixelLight(ctx, lights, width, height, darkness)\` from \`pixelArt.ts\`.
- Produces: \`ParticleSystem.addDecal(pos, kind)\`, \`ParticleSystem.drawDecals(ctx, cam)\`, and an internal \`Game.collectLights()\`.

- [ ] **Step 1: Add the failing bounded-decal test**

~~~ts
test("caps retained ground decals", () => {
  const particles = new ParticleSystem();
  for (let i = 0; i < 250; i++) particles.addDecal({ x: i, y: i }, "blood");
  expect(particles.decalCount).toBeLessThanOrEqual(120);
});
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: \`npm test -- --run tests/pixelArt.test.ts\`

Expected: FAIL because the decal API is absent.

- [ ] **Step 3: Compose square particles and pixel lights**

~~~ts
this.particles.drawDecals(ctx, this.camera);
this.particles.draw(ctx, this.camera);
drawPixelLight(ctx, this.collectLights(), this.viewW, this.viewH,
  this.nightFactor() * 0.42);
drawHud(ctx, this, this.viewW, this.viewH);
~~~

Snap transient particles to the pixel grid. Add capped short-lived blood/scorch decals on deaths/explosions. Feed warm street-lamp/muzzle lights, cyan loot, player light, and red enemy projectile lights to the stepped overlay. Use \`nightFactor()\` to reach up to 42% darkness only at night; draw the overlay before HUD/minimap/crosshair and restore all context styles.

- [ ] **Step 4: Run full validation**

Run: \`npm run verify && npm run build && npm run e2e\`

Expected: every command exits 0.

- [ ] **Step 5: Visual desktop check**

Run: \`npm run dev\`

Open \`/play\` at 1280×720 and 1920×1080. Verify crisp unblurred sprites, stable terrain, prop shadows, readable crowds/projectiles, lights active only at night, and HUD above the overlay.

- [ ] **Step 6: Commit**

~~~bash
git add web/src/game/particle.ts web/src/game/game.ts web/src/game/pixelArt.ts web/tests/pixelArt.test.ts web/tests/game_smoke.test.ts
git commit -m "feat: add pixel effects and survival lighting"
~~~

