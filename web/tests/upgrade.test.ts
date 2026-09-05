// tests/upgrade.test.ts
import { describe, test, expect, vi } from "vitest";
import {
  UpgradeSystem,
  SKILL_BRANCHES,
  DEFAULT_SKILL_LIMIT,
  LEVELUP_PICK_LOCK,
  branchForSkill,
  rollLevelUpChoices,
} from "@/game/upgrade";
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
    { id: "regen", text: "+1 HP/S", desc: "" },
    { id: "magnet", text: "+30% RANGE", desc: "" },
    { id: "vampire", text: "+2% STEAL", desc: "" },
    { id: "pierce", text: "+1 PIERCE", desc: "" },
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
    regen: 0,
    magnetMult: 1,
    lifeSteal: 0,
    pierceBonus: 0,
    upgradeLevels: {} as Record<string, number>,
    heal: vi.fn(),
    addArmor: vi.fn(),
  } as unknown as Parameters<UpgradeSystem["apply"]>[1];
}

describe("UpgradeSystem skill tree", () => {
  test("every skill lives in exactly one branch", () => {
    const flattened = SKILL_BRANCHES.flatMap((b) => b.skills);
    expect(new Set(flattened).size).toBe(flattened.length);
    // The full 12-skill catalog is covered by the three branches.
    const catalogIds = CAT.upgrades.map((u) => u.id);
    for (const id of catalogIds) expect(flattened).toContain(id);
  });

  test("three branches exist with expected names", () => {
    expect(SKILL_BRANCHES.map((b) => b.name)).toEqual([
      "Combat",
      "Survival",
      "Utility",
    ]);
  });

  test("limitFor uses catalog limits, else default cap", () => {
    const u = new UpgradeSystem(CAT);
    expect(u.limitFor("max_hp")).toBe(10);
    expect(u.limitFor("regen")).toBe(DEFAULT_SKILL_LIMIT);
  });

  test("apply max_hp stacks each call", () => {
    const u = new UpgradeSystem(CAT);
    const p = makePlayer();
    for (let i = 0; i < 15; i++) u.apply("max_hp", p);
    // Limit enforcement happens in the UI/actions; apply() trusts the caller.
    expect(p.maxHp).toBe(100 + 20 * 15);
  });

  test("apply damage stacks", () => {
    const u = new UpgradeSystem(CAT);
    const p = makePlayer();
    u.apply("damage", p);
    u.apply("damage", p);
    expect(p.damageMult).toBeCloseTo(1.21);
  });

  test("apply regen / magnet / vampire / pierce stack", () => {
    const u = new UpgradeSystem(CAT);
    const p = makePlayer();
    u.apply("regen", p);
    u.apply("regen", p);
    u.apply("magnet", p);
    u.apply("vampire", p);
    u.apply("pierce", p);
    expect(p.regen).toBe(2);
    expect(p.magnetMult).toBeCloseTo(1.3);
    expect(p.lifeSteal).toBeCloseTo(0.02);
    expect(p.pierceBonus).toBe(1);
  });
});

describe("level-up random offer", () => {
  const u = new UpgradeSystem(CAT);
  const limitFor = (uid: string) => u.limitFor(uid);

  test("offers one skill per branch, all distinct", () => {
    for (let i = 0; i < 200; i++) {
      const picks = rollLevelUpChoices({}, limitFor);
      expect(picks).toHaveLength(SKILL_BRANCHES.length);
      expect(new Set(picks).size).toBe(picks.length);
      const branches = picks.map((uid) => branchForSkill(uid)?.name);
      expect(branches).toEqual(SKILL_BRANCHES.map((b) => b.name));
    }
  });

  test("never offers a maxed-out skill", () => {
    const levels: Record<string, number> = {};
    // Cap every Combat skill except crit_dmg.
    for (const uid of SKILL_BRANCHES[0]!.skills) levels[uid] = limitFor(uid);
    levels["crit_dmg"] = 0;
    for (let i = 0; i < 100; i++) {
      const picks = rollLevelUpChoices(levels, limitFor);
      expect(picks[0]).toBe("crit_dmg");
      for (const uid of picks) expect(levels[uid] ?? 0).toBeLessThan(limitFor(uid));
    }
  });

  test("back-fills from other branches when one is fully capped", () => {
    const levels: Record<string, number> = {};
    for (const uid of SKILL_BRANCHES[2]!.skills) levels[uid] = limitFor(uid);
    const picks = rollLevelUpChoices(levels, limitFor);
    expect(picks).toHaveLength(3);
    expect(new Set(picks).size).toBe(3);
    for (const uid of picks) expect(SKILL_BRANCHES[2]!.skills).not.toContain(uid);
  });

  test("offers nothing once every skill is capped", () => {
    const levels: Record<string, number> = {};
    for (const b of SKILL_BRANCHES) for (const uid of b.skills) levels[uid] = limitFor(uid);
    expect(rollLevelUpChoices(levels, limitFor)).toEqual([]);
  });

  test("uses the whole pool of a branch over many rolls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(rollLevelUpChoices({}, limitFor)[1]!);
    expect(seen).toEqual(new Set(SKILL_BRANCHES[1]!.skills));
  });

  test("rand() returning 1 stays in range", () => {
    const picks = rollLevelUpChoices({}, limitFor, () => 1);
    expect(picks.every((uid) => typeof uid === "string")).toBe(true);
    expect(picks).toHaveLength(3);
  });

  test("the misclick lock is a real, positive delay", () => {
    expect(LEVELUP_PICK_LOCK).toBeGreaterThanOrEqual(3);
  });
});
