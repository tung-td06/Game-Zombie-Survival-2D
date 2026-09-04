// tests/loot.test.ts
import { describe, test, expect } from "vitest";
import { dropsFor } from "@/game/loot";
import { MOD_CATALOG } from "@/game/mods";

const ALL_DROPPABLE = ["shotgun", "smg", "rifle", "sniper", "crossbow", "flamethrower", "plasma"];

/** Deterministic stand-in for the seeded Rng used by dropsFor. */
function fakeRng(seq: number[]) {
  let i = 0;
  return {
    next: () => seq[i++] ?? 0,
    range: (a: number, b: number) => (a + b) / 2,
    pick: <T>(arr: T[]): T => arr[0]!,
  };
}

describe("dropsFor weapon loot", () => {
  test("never drops a weapon the player already owns everything from", () => {
    const drops = dropsFor(
      { pos: { x: 0, y: 0 }, coinValue: 10 },
      fakeRng([0.22]), // lands in the weapon-drop bucket (0.21-0.225)
      ALL_DROPPABLE,
    );
    expect(drops.some((d) => d.kind === "weapon")).toBe(false);
    expect(drops).toHaveLength(1); // just the coin drop
  });

  test("drops an unowned weapon when the roll lands in that bucket", () => {
    const drops = dropsFor(
      { pos: { x: 0, y: 0 }, coinValue: 10 },
      fakeRng([0.22, 0.9]), // weapon bucket, then rare-roll fails (>= 0.2)
      [],
    );
    const weaponLoot = drops.find((d) => d.kind === "weapon");
    expect(weaponLoot?.payload).toBe(ALL_DROPPABLE[0]);
    expect(weaponLoot?.bonusMod).toBeNull();
  });

  test("rare roll attaches a free mod to the dropped weapon", () => {
    const drops = dropsFor(
      { pos: { x: 0, y: 0 }, coinValue: 10 },
      fakeRng([0.22, 0.05, 0.5]), // weapon bucket, rare succeeds, mod index roll
      [],
    );
    const weaponLoot = drops.find((d) => d.kind === "weapon");
    expect(weaponLoot?.bonusMod).toBe(MOD_CATALOG[Math.floor(0.5 * MOD_CATALOG.length)]!.id);
  });

  test("skips the weapon roll entirely once every weapon is owned but still drops coin", () => {
    const drops = dropsFor({ pos: { x: 1, y: 2 }, coinValue: 42 }, fakeRng([0.22]), ALL_DROPPABLE);
    expect(drops[0]!.kind).toBe("coin");
    expect(drops[0]!.amount).toBe(42);
  });
});
