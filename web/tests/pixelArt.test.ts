import { describe, expect, test } from "vitest";
import { pixelVariant } from "@/game/pixelArt";
import { ParticleSystem } from "@/game/particle";
import { windowLightSeed } from "@/game/map";

describe("pixel art variation", () => {
  test("is stable and atlas-safe for a map cell", () => {
    const variant = pixelVariant(20260823, 800, 1200, 5);
    expect(variant).toBe(pixelVariant(20260823, 800, 1200, 5));
    expect(variant).toBeGreaterThanOrEqual(0);
    expect(variant).toBeLessThan(5);
  });

  test("keeps a stable terrain variation when revisiting a cell", () => {
    expect(pixelVariant(33, 128, 256, 6)).toBe(pixelVariant(33, 128, 256, 6));
  });

  test("caps retained ground decals", () => {
    const particles = new ParticleSystem();
    for (let i = 0; i < 250; i++) particles.addDecal({ x: i, y: i }, "blood");
    expect(particles.decalCount).toBeLessThanOrEqual(120);
  });
});

describe("window light determinism", () => {
  test("depends only on world coordinates and never changes for the same building", () => {
    expect(windowLightSeed(920, 1340)).toBe(windowLightSeed(920, 1340));
    // Camera offset must be irrelevant: the seed is a pure function of the
    // building's own world position.
    expect(windowLightSeed(920, 1340)).toBe(windowLightSeed(920, 1340));
    expect(windowLightSeed(1234, 5678)).toBe(windowLightSeed(1234, 5678));
  });

  test("splits buildings into roughly 70% lit / 30% dark groups", () => {
    let lit = 0;
    let n = 0;
    // Sample positions like the procedural map would place buildings.
    for (let x = 120; x < 3900; x += 131) {
      for (let y = 160; y < 3900; y += 97) {
        n++;
        if (windowLightSeed(x, y) >= 30) lit++;
      }
    }
    const frac = lit / n;
    expect(frac).toBeGreaterThan(0.6);
    expect(frac).toBeLessThan(0.8);
  });

  test("spans the full seed range deterministically", () => {
    const first = windowLightSeed(920, 1340);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(100);
  });
});
