import { describe, expect, test } from "vitest";
import { pixelVariant } from "@/game/pixelArt";

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
});
