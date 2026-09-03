# Web Pixel-Art HD Survival — Design

## Goal

Upgrade the browser edition's in-match visuals to a detailed, readable pixel-art
survival style for desktop play. The work covers the game world, player,
zombies, weapons, loot, combat effects, and night lighting. Menus and HUD keep
their current layout except where sprite rendering needs a small visual update.

## Visual direction

- Top-down, dark post-apocalyptic scene with deliberate pixel edges.
- A high-detail but gameplay-first scale: player and standard zombies render at
  64 px; bosses at 96 px; props range from 48 to 128 px.
- Desaturated earth tones form the base palette. Gold, cyan, red, green, and
  purple are reserved for gameplay-critical lights, loot, damage, and enemy
  classes.
- Neon is localised to signs, lamps, loot, muzzle flashes, and special enemy
  cues; it must not lower enemy or projectile contrast.

## Rendering architecture

1. Introduce a procedural pixel-art atlas cache built once per canvas scale.
   It contains terrain tiles, prop variants, character directions, zombie
   variants, weapon silhouettes, loot, and effect stamps.
2. Change the game draw order to: textured terrain; ground decals; prop shadows;
   props; characters and projectiles; foreground effects; pixel-light overlay;
   HUD.
3. Keep existing game state and collision rectangles unchanged. Renderers use
   `kind`, position, direction, health, and animation state only, preventing
   visual work from changing gameplay behaviour.
4. Reuse cached `CanvasImageSource` sprites and cap transient particles. No
   per-frame offscreen-canvas construction is permitted during live play.

## World and prop art

- Terrain uses deterministic tile variation: cracked dirt, worn asphalt, grass,
  grit, puddles, old blood, and road edge debris. Variation is seeded from
  world coordinates so it does not shimmer while the camera moves.
- Roads gain faded lane markings, scattered fragments, and shallow curb shadows.
- Buildings, houses, cars, containers, trees, crates, barricades, and street
  lamps gain pixel outlines, directional shadows, 3–5 value ramps, and distinct
  readable silhouettes.
- At night, lit windows, lamps, headlamps, and signs add small coloured pixel
  glows. Street lamps remain visible on the minimap and in the main view.

## Combatant and weapon art

- The player receives four aim directions, idle and walk cycles, an upper-body
  weapon layer, a recoil pose, and a short muzzle-flash frame.
- Each normal zombie type has a unique palette, proportions, gait, hit flash,
  and death frame. Bosses are larger and use a restrained animated aura.
- Weapons get distinct silhouettes and effects: pistol, shotgun, SMG, rifle,
  and sniper. Projectiles use short pixel trails and strong contrast at their
  small on-screen size.
- Loot uses a 48 px sprite with a soft pulsing highlight so pickups remain
  recognisable through crowds.

## Effects and lighting

- Hits produce limited pixel particles, impact bursts, damage numbers, and
  optional blood decals. Deaths use an outward burst and a short-lived stain.
- Night lighting is a low-resolution overlay scaled with nearest-neighbour
  sampling. Lights are soft stepped circles, tinted by source (warm lamp, cyan
  loot, orange muzzle flash, hostile red projectile).
- Screen shake, vignette, and existing day/night darkness retain their current
  gameplay meaning; their colours are adjusted to match the new palette.

## Responsiveness, failure handling, and verification

- Desktop is the primary target: test at 1280×720 and 1920×1080. Existing
  mobile controls stay functional but are not the target of this art pass.
- Cache creation failure falls back to the existing primitive renderer for that
  sprite category, rather than blocking play.
- Unit tests continue to cover game logic. Add focused rendering-cache tests
  where practical, run typecheck/lint/unit tests, and perform a Playwright
  smoke run plus a visual browser check for the play screen.

## Out of scope

- Reworking HUD/menu layout, changing gameplay balance, new enemy or weapon
  mechanics, WebGL migration, and new external image assets.
