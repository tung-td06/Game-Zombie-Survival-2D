# 🧟 Zombie Survival 2D — Web

Top-down zombie survival shooter 2D, browser-based (Next.js + Canvas 2D).
The former Python/Pygame desktop build has been **removed**; all development
now happens on the web version in [`web/`](web/).

## Stack

- **Next.js 15** (App Router) + TypeScript strict
- **Canvas 2D** game loop with React 18 as the host shell (game logic in
  `web/src/game/` is framework-agnostic TS)
- **localStorage** save data (`zs.save.v1`) + optional online profiles
- **Cloudflare D1** database (see DB below) with a Node JSON fallback store
- **WebSocket** multiplayer scaffold via `web/server.js`
- **Vitest** unit tests, **Playwright** smoke E2E

## Run (development)

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

Production build + verify:

```bash
npm run verify     # lint + typecheck + unit tests
npm run build      # next build
npm run e2e        # Playwright smoke (boots a built server)
```

## Controls

| Key       | Action                            |
|-----------|-----------------------------------|
| `W A S D` | Move                              |
| Mouse     | Aim; Left Click = shoot           |
| `R`       | Reload                            |
| `1`–`5`   | Select weapon                     |
| `ESC`     | Pause / menus                     |
| `F11`     | Fullscreen                        |

## Features

Wave survival with scaling difficulty, a boss on **every wave from wave 5**
(alternating boss types from wave 15), 6 zombie types, 5+ weapons with
per-gun range stats, shop / upgrades / skill tree, quests, achievements,
day-night cycle, biome-free city map with dynamic lighting, minimap, and
mobile touch controls.

## Data & DB

Game data is plain JSON under `web/public/data/` (weapons, zombies,
upgrades) and `web/data/` (profile DB fallback). Live player persistence
(accounts, scores, saves) uses **Cloudflare D1**:

- Worker/Pages config: `web/wrangler.toml` (binding `DB`)
- Migrations: `web/migrations/`
- Edge-safe DB core: `web/src/lib/db.ts` + `web/src/server/persistent-storage.ts`
- Runtime API routes: `web/functions/api/**` and `web/src/app/api/**`

## Repository layout

```
├── web/                  # The entire web app (Next.js)
│   ├── src/              # React shell + game logic + server/db code
│   ├── public/           # Static: data JSON, generated audio, images
│   ├── functions/        # Cloudflare Pages Functions (API)
│   ├── migrations/       # D1 schema migrations
│   ├── scripts/          # Asset/audio generators, smoke helpers
│   ├── tests/            # Vitest unit tests
│   └── e2e/              # Playwright E2E
├── data/                 # Kept legacy profile/save JSON snapshots
├── migrations/           # Legacy root-level D1 migration copy
└── wrangler.toml         # Legacy root-level D1 worker config
```

> Note: `data/`, `migrations/` and `wrangler.toml` at the repo root are
> legacy duplicates left in place for reference — the active copies live
> under `web/`.
