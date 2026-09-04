// src/game/mods.ts
// Weapon mods/attachments: small permanent tweaks bought per-weapon in the
// shop (or granted free by a rare loot drop) and persisted per weapon id in
// SaveData.weapon_upgrades.

export type ModStat = "range" | "magazine" | "spread" | "reload";

export interface ModDef {
  id: string;
  name: string;
  desc: string;
  price: number;
  stat: ModStat;
  /** Multiplier applied to the base stat (1 = no change). */
  mult: number;
}

export const MOD_CATALOG: ModDef[] = [
  { id: "scope", name: "Scope", desc: "+30% range", price: 600, stat: "range", mult: 1.3 },
  { id: "extended_mag", name: "Extended Mag", desc: "+50% magazine size", price: 700, stat: "magazine", mult: 1.5 },
  { id: "tight_choke", name: "Tight Choke", desc: "-30% spread", price: 500, stat: "spread", mult: 0.7 },
  { id: "quick_reload", name: "Quick Reload", desc: "-20% reload time", price: 650, stat: "reload", mult: 0.8 },
];

const MOD_BY_ID: Record<string, ModDef> = Object.fromEntries(
  MOD_CATALOG.map((m) => [m.id, m]),
);

export function modDef(id: string): ModDef | undefined {
  return MOD_BY_ID[id];
}

/** Combined multiplier every mod in `mods` contributes to `stat` (1 = none). */
export function modMultiplier(mods: string[] | undefined, stat: ModStat): number {
  if (!mods || mods.length === 0) return 1;
  let mult = 1;
  for (const id of mods) {
    const def = MOD_BY_ID[id];
    if (def && def.stat === stat) mult *= def.mult;
  }
  return mult;
}

export function randomModId(rng?: { next: () => number }): string {
  const roll = rng ? rng.next() : Math.random();
  return MOD_CATALOG[Math.floor(roll * MOD_CATALOG.length)]!.id;
}
