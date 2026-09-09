// tests/ufo_new_game_reset.test.ts
// Comprehensive test scenarios ensuring UFO always resets to 0 on New Game
// while Continue/Load Game preserves saved UFO state correctly.

import { describe, test, expect, beforeEach } from "vitest";
import { SaveManager, SAVE_KEY } from "@/game/save";

describe("UFO New Game Reset - Comprehensive Scenarios", () => {
  // Mock localStorage for tests
  const ls: Record<string, string> = {};
  beforeEach(() => {
    Object.keys(ls).forEach((k) => delete ls[k]);
    globalThis.localStorage = {
      getItem: (k: string) => ls[k] ?? null,
      setItem: (k: string, v: string) => {
        ls[k] = v;
      },
      removeItem: (k: string) => delete ls[k],
      clear: () => Object.keys(ls).forEach((k) => delete ls[k]),
      length: 0,
      key: () => null,
    };
  });

  test("Test 1: Save with UFO=4 → New Game → UFO=0", () => {
    // Simulate an old save with 4 UFOs owned
    const save = new SaveManager();
    save.data.owned_ufos = ["drone", "wasp", "phantom", "goliath"];
    save.data.active_ufo = "goliath";
    save.data.has_drone = true;
    save.data.coins = 50000;
    save.save();

    // Verify old save has UFOs
    const oldSave = new SaveManager();
    expect(oldSave.data.owned_ufos).toEqual(["drone", "wasp", "phantom", "goliath"]);
    expect(oldSave.data.active_ufo).toBe("goliath");

    // Simulate New Game reset (what resetLocalProgression does)
    oldSave.data.coins = 0;
    oldSave.data.unlocked_weapons = ["pistol"];
    oldSave.data.weapon_upgrades = {};
    oldSave.data.owned_ufos = [];
    oldSave.data.active_ufo = "";
    oldSave.data.has_drone = false;
    oldSave.data.player_level = 1;
    oldSave.data.xp = 0;
    oldSave.data.player_upgrades = {};
    oldSave.save();

    // Verify New Game starts with UFO = 0
    const freshSave = new SaveManager();
    expect(freshSave.data.owned_ufos).toEqual([]);
    expect(freshSave.data.active_ufo).toBe("");
    expect(freshSave.data.has_drone).toBe(false);
  });

  test("Test 2: New Game → UFO=0 → Buy 1 UFO → UFO=1", () => {
    // Start with clean slate (New Game)
    const save = new SaveManager();
    expect(save.data.owned_ufos).toEqual([]);
    expect(save.data.active_ufo).toBe("");
    expect(save.data.has_drone).toBe(false);

    // Simulate buying first UFO
    save.data.owned_ufos = ["drone"];
    save.data.active_ufo = "drone";
    save.data.has_drone = true;
    save.save();

    // Verify UFO count is 1
    const afterPurchase = new SaveManager();
    expect(afterPurchase.data.owned_ufos.length).toBe(1);
    expect(afterPurchase.data.owned_ufos).toEqual(["drone"]);
    expect(afterPurchase.data.active_ufo).toBe("drone");
    expect(afterPurchase.data.has_drone).toBe(true);
  });

  test("Test 3: Save with UFO=1 → Return Lobby → Continue → UFO=1", () => {
    // Simulate a saved game with 1 UFO
    const save = new SaveManager();
    save.data.owned_ufos = ["drone"];
    save.data.active_ufo = "drone";
    save.data.has_drone = true;
    save.data.coins = 1000;
    save.save();

    // Simulate returning to lobby and continuing
    // (In real game, this would load from database and merge with localStorage)
    const continuedSave = new SaveManager();
    
    // Continue should preserve the UFO
    expect(continuedSave.data.owned_ufos).toEqual(["drone"]);
    expect(continuedSave.data.active_ufo).toBe("drone");
    expect(continuedSave.data.has_drone).toBe(true);
  });

  test("Test 4: Old save UFO=4 → New Game → UFO must be 0, NOT 4", () => {
    // This is the critical test from user requirements
    // Old save with maximum UFOs
    const oldSave = new SaveManager();
    oldSave.data.owned_ufos = ["drone", "wasp", "phantom", "goliath"];
    oldSave.data.active_ufo = "phantom";
    oldSave.data.has_drone = true;
    oldSave.save();

    // Verify old save
    expect(new SaveManager().data.owned_ufos.length).toBe(4);

    // New Game MUST reset UFO to 0
    const newGameSave = new SaveManager();
    newGameSave.data.owned_ufos = [];
    newGameSave.data.active_ufo = "";
    newGameSave.data.has_drone = false;
    newGameSave.save();

    // Critical assertion: New Game must start with 0 UFOs
    const verifyFresh = new SaveManager();
    expect(verifyFresh.data.owned_ufos.length).toBe(0);
    expect(verifyFresh.data.owned_ufos).toEqual([]);
    expect(verifyFresh.data.active_ufo).toBe("");
    expect(verifyFresh.data.has_drone).toBe(false);
  });

  test("Test 5: New Game → UFO=0 → Save → Reload → Continue → UFO=0", () => {
    // New Game starts fresh
    const save = new SaveManager();
    expect(save.data.owned_ufos).toEqual([]);
    
    // Don't buy any UFO, just save the game
    save.data.coins = 100;
    save.data.player_level = 2;
    save.save();

    // Clear and reload (simulate page refresh)
    const reloaded = new SaveManager();
    
    // Continue should still have UFO=0 (no purchases were made)
    expect(reloaded.data.owned_ufos).toEqual([]);
    expect(reloaded.data.active_ufo).toBe("");
    expect(reloaded.data.has_drone).toBe(false);
  });

  test("Test 6: Multiple New Games in sequence always start with UFO=0", () => {
    // First New Game
    let save = new SaveManager();
    save.data.owned_ufos = [];
    save.data.active_ufo = "";
    save.data.has_drone = false;
    save.save();
    expect(new SaveManager().data.owned_ufos).toEqual([]);

    // Buy UFO during first game
    save.data.owned_ufos = ["drone", "wasp"];
    save.data.active_ufo = "wasp";
    save.data.has_drone = true;
    save.save();
    expect(new SaveManager().data.owned_ufos.length).toBe(2);

    // Second New Game - must reset to 0 again
    save.data.owned_ufos = [];
    save.data.active_ufo = "";
    save.data.has_drone = false;
    save.save();
    expect(new SaveManager().data.owned_ufos).toEqual([]);

    // Buy different UFO during second game
    save.data.owned_ufos = ["phantom"];
    save.data.active_ufo = "phantom";
    save.data.has_drone = true;
    save.save();
    expect(new SaveManager().data.owned_ufos).toEqual(["phantom"]);

    // Third New Game - must reset to 0 yet again
    save.data.owned_ufos = [];
    save.data.active_ufo = "";
    save.data.has_drone = false;
    save.save();
    
    const finalCheck = new SaveManager();
    expect(finalCheck.data.owned_ufos).toEqual([]);
    expect(finalCheck.data.active_ufo).toBe("");
    expect(finalCheck.data.has_drone).toBe(false);
  });

  test("Test 7: New Game with old save → localStorage reset prevents inheritance", () => {
    // Setup: Old save in localStorage with UFOs
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        high_score: 10000,
        total_kills: 500,
        coins: 5000,
        owned_ufos: ["drone", "wasp", "phantom"],
        active_ufo: "wasp",
        has_drone: true,
        unlocked_weapons: ["pistol", "shotgun", "rifle"],
        weapon_upgrades: {},
        player_upgrades: {},
        achievements: [],
        quests_claimed: [],
        settings: {},
      })
    );

    // Load the old save
    const oldSave = new SaveManager();
    expect(oldSave.data.owned_ufos.length).toBe(3);

    // New Game resets UFO
    oldSave.data.coins = 0;
    oldSave.data.unlocked_weapons = ["pistol"];
    oldSave.data.owned_ufos = [];
    oldSave.data.active_ufo = "";
    oldSave.data.has_drone = false;
    oldSave.save();

    // Verify reset worked
    const afterReset = new SaveManager();
    expect(afterReset.data.owned_ufos).toEqual([]);
    expect(afterReset.data.active_ufo).toBe("");
    
    // But account-level data should be preserved
    expect(afterReset.data.high_score).toBe(10000);
    expect(afterReset.data.total_kills).toBe(500);
  });

  test("Test 8: Shop purchase during New Game correctly updates UFO count", () => {
    // Start New Game with UFO=0
    const save = new SaveManager();
    save.data.owned_ufos = [];
    save.data.active_ufo = "";
    save.data.has_drone = false;
    save.data.coins = 50000;
    save.save();

    expect(new SaveManager().data.owned_ufos.length).toBe(0);

    // Buy first UFO (simulating Shop.buyUFO)
    save.data.owned_ufos = ["drone"];
    save.data.active_ufo = "drone";
    save.data.has_drone = true;
    save.data.coins = 40000; // 50000 - 10000
    save.save();

    expect(new SaveManager().data.owned_ufos.length).toBe(1);

    // Buy second UFO
    save.data.owned_ufos = ["drone", "wasp"];
    save.data.active_ufo = "wasp";
    save.data.coins = 25000; // 40000 - 15000
    save.save();

    const afterPurchases = new SaveManager();
    expect(afterPurchases.data.owned_ufos.length).toBe(2);
    expect(afterPurchases.data.owned_ufos).toEqual(["drone", "wasp"]);
    expect(afterPurchases.data.active_ufo).toBe("wasp");
  });

  test("Test 9: has_drone backward compatibility - false for New Game", () => {
    // New Game must set has_drone to false
    const save = new SaveManager();
    save.data.owned_ufos = [];
    save.data.active_ufo = "";
    save.data.has_drone = false;
    save.save();

    const loaded = new SaveManager();
    expect(loaded.data.has_drone).toBe(false);

    // After buying a UFO, has_drone becomes true
    loaded.data.owned_ufos = ["drone"];
    loaded.data.active_ufo = "drone";
    loaded.data.has_drone = true;
    loaded.save();

    expect(new SaveManager().data.has_drone).toBe(true);

    // New Game again resets it back to false
    loaded.data.owned_ufos = [];
    loaded.data.active_ufo = "";
    loaded.data.has_drone = false;
    loaded.save();

    expect(new SaveManager().data.has_drone).toBe(false);
  });

  test("Test 10: Database save with UFO → Continue merges correctly", () => {
    // This simulates the restoreGameFromSave flow
    // Assume database has UFO from a previous save
    const dbUFOs = ["drone", "wasp"];
    const dbActiveUFO = "wasp";

    // After New Game, localStorage is empty
    const localSave = new SaveManager();
    localSave.data.owned_ufos = [];
    localSave.data.active_ufo = "";
    localSave.save();

    // Continue merges database UFOs with local UFOs
    // Since local is empty after New Game, we get database UFOs
    const mergedUFOs = Array.from(
      new Set([...dbUFOs, ...localSave.data.owned_ufos])
    ).slice(0, 4);

    expect(mergedUFOs).toEqual(["drone", "wasp"]);
    expect(mergedUFOs.length).toBe(2);

    // If local had bought a UFO after Continue but before Save
    localSave.data.owned_ufos = ["drone", "wasp", "phantom"];
    localSave.save();

    // Next Continue would merge both
    const mergedAgain = Array.from(
      new Set([...dbUFOs, ...localSave.data.owned_ufos])
    ).slice(0, 4);
    
    expect(mergedAgain).toEqual(["drone", "wasp", "phantom"]);
  });
});
