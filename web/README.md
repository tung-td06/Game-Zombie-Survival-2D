# Zombie Survival 2D — Web

A browser port of the Python/Pygame zombie survival shooter. The desktop
version lives in `../` and is unchanged. This web version targets feature
parity (player, 6 zombie types, 5 weapons, waves+boss, shop, upgrades,
quests, achievements, day/night cycle, save/load, settings).

## Stack

- **Next.js 14** (App Router) + TypeScript strict
- **Canvas 2D** for the game (no WebGL), `requestAnimationFrame` main loop
- **React 18** for the canvas host + landing page only; game logic in
  `src/game/` is framework-agnostic TS
- **localStorage** for save data (key `zs.save.v1`)
- **Web Audio API** for procedural sfx — no asset files required
- **Vitest** for unit tests, **Playwright** for the smoke E2E

## Run

```bash
cd web
npm install
npm run dev     # http://localhost:3000
```

Visit `/` for the landing page, or `/play` to jump into the game. Pass
`?smoke=1` to enable the in-game smoke flag (used by the E2E).

## Verify

```bash
npm run verify   # lint + typecheck + unit tests
npm run e2e      # Playwright smoke (boots a built server)
npm run build    # production build
```

## Controls

| Key             | Action                            |
|-----------------|-----------------------------------|
| `W A S D`       | Move                              |
| Mouse           | Aim                               |
| Left Click      | Shoot (hold for auto)             |
| `R`             | Reload                            |
| `1`–`5`         | Select weapon                     |
| Middle Click    | Cycle to next weapon              |
| `E` (hold)      | Vacuum loot                       |
| `ESC`           | Pause / close overlay             |
| `F11`           | Fullscreen                        |
| `F3`            | Toggle debug overlay              |

## Project layout

```
web/
├── public/
│   ├── data/         weapons.json, zombies.json, upgrades.json, save.json
│   └── assets/       SVGs for player/zombies/tiles (generated)
├── scripts/
│   └── generate-assets.mjs
├── src/
│   ├── app/          Next.js routes: /, /play
│   ├── components/   GameCanvas (client component)
│   └── game/         1-to-1 port of the Python modules
│       ├── settings.ts, colors.ts, utils.ts, vec.ts
│       ├── input.ts, camera.ts, audio.ts
│       ├── map.ts, particle.ts, bullet.ts
│       ├── weapon.ts, player.ts, zombie.ts, spawner.ts
│       ├── waveManager.ts, loot.ts, shop.ts, upgrade.ts
│       ├── quest.ts, achievement.ts, ui.ts, menu.ts
│       ├── network.ts, save.ts, data.ts, debug.ts
│       ├── game.ts   orchestrator + state machine
│       └── types.ts
└── tests/            Vitest unit tests
```

## Persistence

Profile data (high score, total kills, coins, level, XP, unlocked
weapons, achievements, quests, settings, key bindings) is stored in
`localStorage` under the key `zs.save.v1`. Use the Settings → Reset
button in-game (or `localStorage.clear()` in DevTools) to start over.

## Asset notes

The web build draws the world with `fillRect`/`arc` using the same color
palette as the Pygame version, plus a small set of generated SVGs in
`public/assets/images/`. There are no audio files — every sfx is
synthesised on demand with the Web Audio API.

## Multiplayer scaffold

`src/game/network.ts` defines a `Server` / `Client` pair wire-compatible
with the Python transport. No server is bundled; the same game state
machine (`update_playing` headless + snapshot render) is the integration
point.

## License

Same as the parent project.
