// tests/upgrade.test.ts
import { describe, test, expect, vi } from "vitest";
import { UpgradeSystem } from "@/game/upgrade";
import type { UpgradeCatalog } from "@/game/data";

const CAT: UpgradeCatalog = {
  upgrades: [
    { id: "max_hp", text: "+20 MAX HP", desc: "" },
    { id: "damage", text: "+10% DMG", desc: "" },
    { id: "speed", text: "+8% SPEED", desc: "" },
    { id: "fire_rate", text: "+8% FR", desc: "" },
    { id: "reload", text: "+10% REL", desc: "" },
    { id: "armor", text: "+10 ARMOR", desc: "" },
    { id: "crit_ch", text: "+5% CRIT", desc: "" },
    { id: "crit_dmg", text: "+25% CRIT DMG", desc: "" },
  ],
  limits: { max_hp: 10, armor: 10 },
};

function makePlayer() {
  return {
    maxHp: 100,
    hp: 50,
    armor: 0,
    damageMult: 1,
    speedMult: 1,
    fireRateMult: 1,
    reloadMult: 1,
    critBonus: 0,
    critMultBonus: 0,
    upgradeLevels: {} as Record<string, number>,
    heal: vi.fn(),
    addArmor: vi.fn(),
  } as unknown as Parameters<UpgradeSystem["apply"]>[1];
}

describe("UpgradeSystem", () => {
  test("rolls 3 distinct choices from catalog", () => {
    const u = new UpgradeSystem(CAT);
    const choices = u.rollChoices(makePlayer());
    expect(choices.length).toBe(3);
    expect(new Set(choices).size).toBe(3);
  });

  test("apply max_hp stacks each call", () => {
    const u = new UpgradeSystem(CAT);
    const p = makePlayer();
    for (let i = 0; i < 15; i++) u.apply("max_hp", p);
    // Limits are enforced by roll_choices; apply() trusts the caller.
    expect(p.maxHp).toBe(100 + 20 * 15);
  });

  test("choices exclude upgrades at their limit", () => {
    const u = new UpgradeSystem(CAT);
    const p = makePlayer();
    for (let i = 0; i < 10; i++) p.upgradeLevels["max_hp"] = 10;
    const choices = u.rollChoices(p);
    expect(choices.includes("max_hp")).toBe(false);
  });

  test("apply damage stacks", () => {
    const u = new UpgradeSystem(CAT);
    const p = makePlayer();
    u.apply("damage", p);
    u.apply("damage", p);
    expect(p.damageMult).toBeCloseTo(1.21);
  });
});
