// src/game/ufo.ts
// UFO FLEET catalog — the single source of truth for every purchasable UFO.
// A player may own at most MAX_UFO_OWNED UFOs (one-time unlocks that persist
// across runs); exactly one owned UFO is ACTIVE (equipped) at a time and the
// in-game drone follows the active UFO's colours. All UFOs share the same
// drone combat behaviour — buying a different UFO only changes which saucer
// orbits the player, never the game balance.

export const MAX_UFO_OWNED = 4;

/** Price of the classic drone — kept for backward compatibility. */
export const DRONE_PRICE = 10000;

export interface UfoDef {
  id: string;
  name: string;
  desc: string;
  price: number;
  /** Main saucer fill colour. */
  tint: string;
  /** Orbit ring colour. */
  glow: string;
}

/**
 * Six distinct UFOs so the 4/4 limit is actually reachable with visible
 * "MAX OWNED" cards left over. The first entry keeps the classic drone id
 * and price so existing saves (has_drone) migrate onto it seamlessly.
 */
export const UFO_CATALOG: UfoDef[] = [
  {
    id: "drone",
    name: "UFO DRONE",
    desc: "Drone chiến đấu xoay quanh tự động bắn zombie.",
    price: DRONE_PRICE,
    tint: "#8FE8FF",
    glow: "rgba(140, 230, 255, 0.45)",
  },
  {
    id: "wasp",
    name: "WASP",
    desc: "Đĩa bay tấn công nhanh với lớp vỏ mạ vàng.",
    price: 15000,
    tint: "#FFD76A",
    glow: "rgba(255, 215, 106, 0.45)",
  },
  {
    id: "phantom",
    name: "PHANTOM",
    desc: "Tàu đánh chặn tàng hình, khó phát hiện trong bóng tối.",
    price: 20000,
    tint: "#C58BFF",
    glow: "rgba(197, 139, 255, 0.45)",
  },
  {
    id: "goliath",
    name: "GOLIATH",
    desc: "Đĩa bay hỗ trợ hạng nặng với lớp vỏ đỏ chiến đấu.",
    price: 25000,
    tint: "#FF6B6B",
    glow: "rgba(255, 107, 107, 0.45)",
  },
  {
    id: "vulture",
    name: "VULTURE",
    desc: "Tàu hộ tống độc hại với quầng sáng xanh lá.",
    price: 30000,
    tint: "#8CFF8C",
    glow: "rgba(140, 255, 140, 0.45)",
  },
  {
    id: "sentinel",
    name: "SENTINEL",
    desc: "Vệ sĩ mẫu thử nghiệm với lớp vỏ màu bạc trắng.",
    price: 35000,
    tint: "#E8F4FF",
    glow: "rgba(232, 244, 255, 0.45)",
  },
];

/** Look up a UFO definition by id (unknown ids return undefined). */
export function ufoDef(id: string): UfoDef | undefined {
  return UFO_CATALOG.find((u) => u.id === id);
}

/**
 * First UFO the player does NOT own yet, in catalog order (used by the
 * legacy list shop's single "UFO FLEET" buy row). Returns null when every
 * UFO is owned or the fleet is full.
 */
export function firstUnownedUFO(owned: string[]): UfoDef | null {
  if (owned.length >= MAX_UFO_OWNED) return null;
  for (const def of UFO_CATALOG) {
    if (!owned.includes(def.id)) return def;
  }
  return null;
}