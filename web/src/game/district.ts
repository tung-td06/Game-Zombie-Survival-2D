// src/game/district.ts
// ─────────────────────────────────────────────────────────────────────────
// THE CITY PLAN — "GREENFIELD QUARANTINE ZONE"
//
// The town is no longer a random road grid: it is a designed, readable city
// whose geography you can learn. Two concentric ring roads wrap a downtown
// core, four full-length avenues cut through everything, and each side of
// the outer frame is a themed district with its own ground, palette and
// props. Both the generator (map.ts) and the terrain renderer
// (terrainArt.ts) read this single source of truth, so the layout, the
// ground colours and the minimap can never drift apart.
//
//        0            400      900          3100     3600        4000
//   0    ┌─────────────────────────────────────────────────────────┐
//        │            I N D U S T R I A L   Y A R D S              │
//   400  │  ╔═══════════════ outer ring road ═══════════════════╗  │
//        │  ║                                                   ║  │
//   900  │  ║   ╔═════════ beltway (ring road) ═════════════╗   ║  │
//        │  ║   ║      D O W N T O W N   B L O C K S        ║   ║  │
//        │  ║   ║          ┌────────────────┐               ║   ║  │
//   S    │  ║   ║          │   CIVIC CORE   │               ║   ║  │  R
//   U    │  ║   ║          │   + PLAZA (■)  │               ║   ║  │  U
//   B    │  ║   ║          └────────────────┘               ║   ║  │  I
//   U    │  ║   ║                                           ║   ║  │  N
//   R    │  ║   ╚═══════════════════════════════════════════╝   ║  │  S
//   B    │  ║                                                   ║  │
//  3600  │  ╚═══════════════════════════════════════════════════╝  │
//        │              R I V E R S I D E   P A R K                │
//  4000  └─────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────

import { WORLD_HEIGHT, WORLD_WIDTH } from "./settings";

/** Map centre — the spawn crossroads and the civic plaza. */
export const CX = WORLD_WIDTH / 2;
export const CY = WORLD_HEIGHT / 2;

// ── Road classes ───────────────────────────────────────────────────────
export type RoadClass = "avenue" | "belt" | "arterial" | "outer" | "link";

export const ROAD_WIDTHS: Record<RoadClass, number> = {
  avenue: 176, // the two full-length cross avenues
  belt: 152, // beltway ring around downtown
  arterial: 140, // the circus — the ring around the civic plaza
  outer: 116, // outer ring through the themed districts
  link: 112, // radial connectors: map edge → beltway
};

/** Beltway ring extents (world coords 1000 … 3000). */
export const BELT_MIN = 1000;
export const BELT_MAX = WORLD_WIDTH - 1000;
/** Outer ring extents (world coords 380 … 3620). */
export const OUTER_MIN = 380;
export const OUTER_MAX = WORLD_WIDTH - 380;
/**
 * The circus: the ring road that carries the two avenues around the civic
 * plaza instead of straight through it. Centre-lines sit this far from the
 * map centre, so the plaza itself is car-free ground.
 */
export const CIRCUS = 480;
/** Radial connector centre-lines in the outer frame. */
export const LINKS = [600, 1200, 2800, 3400];

/** Half-width of the always-clear civic core (circus + plaza + apron). */
export const CORE_HALF = 660;
/** Radius (world px) of the pedestrian plaza at the map centre. */
export const PLAZA_RADIUS = 330;
/** World-space thickness of the impassable map fringe. */
export const FRINGE = 60;

// ── Districts ──────────────────────────────────────────────────────────
export type District =
  | "core"
  | "downtown"
  | "industrial"
  | "suburb"
  | "park"
  | "ruins";

/**
 * Which district a world point belongs to. Pure geometry — no hashing — so
 * the districts are the same on every seed and the player can actually
 * learn the city.
 */
export function districtAt(x: number, y: number): District {
  if (Math.abs(x - CX) <= CORE_HALF && Math.abs(y - CY) <= CORE_HALF) return "core";
  if (x > BELT_MIN && x < BELT_MAX && y > BELT_MIN && y < BELT_MAX) return "downtown";
  // Outer frame: the nearest map edge decides the theme.
  const dN = y;
  const dS = WORLD_HEIGHT - y;
  const dW = x;
  const dE = WORLD_WIDTH - x;
  const m = Math.min(dN, dS, dW, dE);
  if (m === dN) return "industrial";
  if (m === dS) return "park";
  if (m === dW) return "suburb";
  return "ruins";
}

/** Human-readable district name (minimap legend / debug). */
export const DISTRICT_NAME: Record<District, string> = {
  core: "CIVIC CORE",
  downtown: "DOWNTOWN",
  industrial: "INDUSTRIAL YARDS",
  suburb: "SUBURBS",
  park: "RIVERSIDE PARK",
  ruins: "QUARANTINE RUINS",
};

// ── Ground palettes ────────────────────────────────────────────────────
// Every district paints from its own 4-step base ramp plus a fleck set and
// an accent used for the sparse micro-detail (grass tufts, gravel, ash…).
export interface GroundPalette {
  /** Four base tones cycled by the tile variant. */
  base: readonly [string, string, string, string];
  /** Coarse specks strewn over the base. */
  fleck: readonly string[];
  /** Low-frequency wash painted over ~40% of 128px blocks. */
  wash: string;
  /** Micro-detail accent (grass blade, gravel chip, ash flake). */
  accent: string;
  /** Secondary accent for the same detail pass. */
  accent2: string;
  /** What the micro-detail actually is. */
  detail: "grass" | "gravel" | "ash" | "paving" | "weeds";
  /** Minimap ground colour for this district. */
  minimap: string;
}

export const GROUND: Record<District, GroundPalette> = {
  core: {
    base: ["#3D3E3C", "#414240", "#393A38", "#454643"],
    fleck: ["#4E4F4C", "#313230", "#56564F"],
    wash: "rgba(96,98,94,0.10)",
    accent: "#5C5D58",
    accent2: "#2E2F2C",
    detail: "paving",
    minimap: "#3E403C",
  },
  downtown: {
    base: ["#33372C", "#373B30", "#2E3228", "#3B3F33"],
    fleck: ["#434834", "#22261C", "#4A483A"],
    wash: "rgba(70,78,58,0.10)",
    accent: "#4E6438",
    accent2: "#8B8F83",
    detail: "weeds",
    minimap: "#33372C",
  },
  industrial: {
    base: ["#413A2E", "#453E31", "#3B3529", "#4A4234"],
    fleck: ["#564C39", "#2C2720", "#6A5C42"],
    wash: "rgba(112,92,58,0.11)",
    accent: "#7A6B4C",
    accent2: "#8E8878",
    detail: "gravel",
    minimap: "#433C2F",
  },
  suburb: {
    base: ["#2E3B25", "#334128", "#293620", "#37452B"],
    fleck: ["#3E4F30", "#1F2A18", "#4A5A38"],
    wash: "rgba(74,102,52,0.12)",
    accent: "#527A38",
    accent2: "#6E9440",
    detail: "grass",
    minimap: "#314027",
  },
  park: {
    base: ["#26381F", "#2B3F23", "#22331B", "#2F4426"],
    fleck: ["#375030", "#1A2814", "#436038"],
    wash: "rgba(58,110,52,0.13)",
    accent: "#4C8038",
    accent2: "#79A84A",
    detail: "grass",
    minimap: "#283B21",
  },
  ruins: {
    base: ["#33302B", "#37342E", "#2D2B26", "#3B3831"],
    fleck: ["#443F36", "#201E1A", "#4E463A"],
    wash: "rgba(48,42,36,0.16)",
    accent: "#4A423A",
    accent2: "#6B5B48",
    detail: "ash",
    minimap: "#332F2A",
  },
};
