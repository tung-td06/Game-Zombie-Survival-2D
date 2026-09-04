# Zombie Survival 2D — Web

Standalone browser zombie survival shooter (Next.js + Canvas 2D). The
former Python/Pygame desktop version has been removed — this is the only
active build. Features: player, 6 zombie types, weapons with per-gun range
stats, waves+boss (a boss on every wave from wave 5), shop, upgrades,
quests, achievements, day/night cycle, save/load, settings, mobile touch
controls.

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

**Cloudflare D1 is the database of record** for accounts, leaderboard
scores and cloud save games (`wrangler.toml` binds `DB`; the schema lives
in `migrations/`). On the deployed site every account you register, every
score you post and every save you write goes to D1 through the App Router
API routes under `src/app/api/` (all `runtime = "edge"`):

- `/api/player/register|login|me|stats` — accounts (PBKDF2-hashed
  passwords, HMAC-signed 30-day session cookie)
- `/api/game/save|load` + `/api/game/submit-score` — one active save per
  player + the leaderboard feed
- `/api/leaderboard` — top-100 best runs (`game_scores` joined to `players`)

Apply migrations to the remote database with:

```bash
npm run d1:migrate:remote
```

and deploy with:

```bash
npm run build:cf   # next build + @cloudflare/next-on-pages
npm run pages:deploy
```

**Running locally without Cloudflare:** `npm run dev` serves the game and
keeps per-player settings/profile in `localStorage` (`zs.save.v1`), but the
API routes run in Next's Edge sandbox there, so account/leaderboard/save
writes are not persisted by plain `npm run dev`. To exercise the real D1
code path locally, build once and run under the Cloudflare emulator, which
provides the `DB` binding backed by a local D1 database:

```bash
npm run build:cf
npm run d1:migrate:local
npm run pages:dev   # http://localhost:8788
```

Unit tests exercise the same D1 SQL through a Node JSON-file fallback in
`src/server/persistent-storage.ts`; it is never bundled for Edge/CF.

## Asset notes

The web build draws the world with `fillRect`/`arc` from a shared color
palette, plus a small set of generated SVGs in `public/assets/images/`.
Optional `.wav` sound effects can be placed in `public/audio/` (see
`scripts/generate-audio.py` to regenerate them); otherwise every sfx is
synthesised on demand with the Web Audio API.

## Multiplayer scaffold

`src/game/network.ts` defines a `Server` / `Client` pair. `server.js`
relays WebSocket traffic (`/api/multiplayer`) between the room host and
guests; host-authoritative snapshots drive guest rendering.
