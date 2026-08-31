// tests/save.test.ts
import { describe, test, expect, beforeEach } from "vitest";
import { SaveManager, SAVE_KEY } from "@/game/save";

beforeEach(() => {
  localStorage.clear();
});

describe("SaveManager", () => {
  test("default shape", () => {
    const s = new SaveManager();
    expect(s.coins).toBe(0);
    expect(s.high_score).toBe(0);
    expect(s.total_kills).toBe(0);
    expect(s.unlocked_weapons).toContain("pistol");
  });

  test("round trip", () => {
    const s = new SaveManager();
    s.coins = 100;
    s.save();
    const s2 = new SaveManager();
    expect(s2.coins).toBe(100);
  });

  test("malformed JSON falls back to defaults", () => {
    localStorage.setItem(SAVE_KEY, "{garbage");
    const s = new SaveManager();
    expect(s.coins).toBe(0);
  });

  test("recordRun updates high score + kills + coins", () => {
    const s = new SaveManager();
    const newHigh = s.recordRun(500, 10, 50, 2, 0);
    expect(newHigh).toBe(true);
    expect(s.high_score).toBe(500);
    expect(s.total_kills).toBe(10);
    expect(s.coins).toBe(50);
  });

  test("recordRun keeps old high score if not beaten", () => {
    localStorage.clear();
    const s = new SaveManager();
    s.recordRun(1000, 5, 20, 1, 0);
    const newHigh = s.recordRun(500, 5, 20, 1, 0);
    expect(newHigh).toBe(false);
    expect(s.high_score).toBe(1000);
    expect(s.total_kills).toBe(10);
  });

  test("coins clamped to non-negative", () => {
    const s = new SaveManager();
    s.coins = -5;
    expect(s.coins).toBe(0);
  });

  test("new gameplay settings round-trip with defaults for legacy saves", () => {
    const s = new SaveManager();
    expect(s.settings.screen_shake).toBe(true);
    expect(s.settings.damage_numbers).toBe(true);
    expect(s.settings.hit_effects).toBe(true);
    expect(s.settings.brightness).toBe(1);
    s.settings.screen_shake = false;
    s.settings.brightness = 1;
    s.save();
    const s2 = new SaveManager();
    expect(s2.settings.screen_shake).toBe(false);
    expect(s2.settings.damage_numbers).toBe(true);
    expect(s2.settings.brightness).toBe(1);
  });

  test("legacy localStorage without new keys falls back to defaults", () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        high_score: 1,
        coins: 2,
        settings: { master_volume: 0.5 },
      }),
    );
    const s = new SaveManager();
    expect(s.high_score).toBe(1);
    expect(s.coins).toBe(2);
    expect(s.settings.master_volume).toBe(0.5);
    expect(s.settings.screen_shake).toBe(true);
    expect(s.settings.brightness).toBe(1);
  });
});
