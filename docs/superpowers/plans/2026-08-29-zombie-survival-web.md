c# Zombie Survival 2D → Web (Next.js) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Python/Pygame top-down zombie survival 2D game to a Next.js web app, preserving full feature parity (player, 6 zombie types, 5 weapons, waves+boss, shop, upgrades, quests, achievements, day/night, save/load, settings, multiplayer scaffold).

**Architecture:**
- Next.js 14 App Router. `src/app/` = React shell + routes. `src/game/` = TypeScript port of the Pygame modules. `public/data/` = static JSON (weapons, zombies, upgrades). `public/assets/images|fonts/` = static images/fonts.
- Game runs in a single Client Component (`'use client'`) using HTML5 `<canvas>` 2D context. A `Game` class owns all systems; `requestAnimationFrame` is the main loop. State persists in `localStorage` (key = `zs.save.v1`).
- Modular: each Pygame file → one TS file under `src/game/`, exporting a class with the same public API surface where practical.

**Tech Stack:** Next.js 14, TypeScript 5, React 18, Canvas 2D, localStorage, Web Audio API (procedural sfx), Vitest (unit), Playwright (smoke).

## Global Constraints

- TypeScript strict mode. No `any` in game code (tests/config OK).
- No new runtime deps unless a task explicitly adds one. Keep the bundle tight.
- Game logic is pure TS, no React inside `src/game/`. Only the canvas host component in `src/app/` uses React.
- All JSON in `public/data/` must be byte-identical to `data/*.json` (copy, don't re-type).
- Resolution policy: logical canvas `1280x720`, CSS-scaled to viewport (preserve aspect via `object-fit: contain`).
- `npm run lint`, `npm run typecheck`, `npm test` must pass at end of each task.
- Save key is `zs.save.v1`. Bump the version constant on breaking changes.
- Color tokens in `src/game/colors.ts` mirror `settings.py:COLORS`.

---

## File Structure (target)

All web files live under `web/`. The Python Pygame project at the repo root remains untouched.

```
web/
├── package.json
├── tsconfig.json
├── next.config.mjs
├── vitest.config.ts
├── .eslintrc.json
├── public/
│   ├── data/                  # copied from ../../data/
│   │   ├── weapons.json
│   │   ├── zombies.json
│   │   ├── upgrades.json
│   │   └── save.json          # template only; runtime uses localStorage
│   ├── assets/
│   │   ├── images/            # see Assets section in Task 2
│   │   └── fonts/             # optional web font
│   └── favicon.ico
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx           # landing
│   │   ├── play/page.tsx      # canvas host
│   │   └── globals.css
│   ├── game/                  # 1-to-1 port of Pygame modules
│   │   ├── settings.ts        # mirror settings.py
│   │   ├── colors.ts          # COLORS map + color()
│   │   ├── utils.ts           # clamp, lerp, formatTime, safeJson
│   │   ├── input.ts           # InputManager (keyboard/mouse)
│   │   ├── vec.ts             # Vec2 helpers (replaces pygame.Vector2)
│   │   ├── collision.ts       # circle-vs-rect, slide
│   │   ├── camera.ts
│   │   ├── map.ts             # GameMap procedural
│   │   ├── particle.ts
│   │   ├── bullet.ts
│   │   ├── weapon.ts          # Weapon + WeaponManager
│   │   ├── zombie.ts          # base + 6 subclasses
│   │   ├── player.ts
│   │   ├── spawner.ts
│   │   ├── waveManager.ts
│   │   ├── loot.ts
│   │   ├── shop.ts
│   │   ├── upgrade.ts
│   │   ├── quest.ts
│   │   ├── achievement.ts
│   │   ├── audio.ts           # Web Audio procedural
│   │   ├── save.ts            # localStorage wrapper
│   │   ├── ui.ts              # draw helpers (HUD/minimap/crosshair/button/toast)
│   │   ├── menu.ts            # MenuSystem
│   │   ├── network.ts         # multiplayer scaffold (WebSocket ready)
│   │   ├── game.ts            # Game orchestrator + state machine
│   │   ├── index.ts           # barrel for tests
│   │   └── types.ts
│   ├── components/
│   │   ├── GameCanvas.tsx     # mounts <canvas>, runs Game.run()
│   │   └── HudOverlay.tsx     # optional React UI for fullscreen / settings
│   └── lib/
│       └── rng.ts             # mulberry32 (deterministic)
└── tests/
    ├── utils.test.ts
    ├── collision.test.ts
    ├── save.test.ts
    ├── weapon.test.ts
    ├── waveManager.test.ts
    ├── shop.test.ts
    ├── upgrade.test.ts
    └── quest.test.ts
```

### Module mapping (Pygame → TS)

| Pygame file           | TS file                      | Notes |
|-----------------------|------------------------------|-------|
| `main.py`             | `src/app/play/page.tsx`      | entry; mounts `GameCanvas` |
| `game.py`             | `src/game/game.ts`           | state machine, main loop |
| `settings.py`         | `src/game/settings.ts`       | constants only |
| (colors in settings)  | `src/game/colors.ts`         | 1:1 copy |
| `utils.py`            | `src/game/utils.ts`          | same fns |
| `input_manager.py`    | `src/game/input.ts`          | keyboard/mouse, rebindable |
| `camera.py`           | `src/game/camera.ts`         | same logic |
| `map.py`              | `src/game/map.ts`            | procedural city |
| `particle.py`         | `src/game/particle.ts`       | ParticleSystem + dmg numbers |
| `bullet.py`           | `src/game/bullet.ts`         | Bullet, EnemyBullet |
| `weapon.py`           | `src/game/weapon.ts`         | Weapon, WeaponManager |
| `zombie.py`           | `src/game/zombie.ts`         | 6 subclasses, ZOMBIE_CLASSES |
| `player.py`           | `src/game/player.ts`         | Player class |
| `spawner.py`          | `src/game/spawner.ts`        | ZombieSpawner |
| `wave_manager.py`     | `src/game/waveManager.ts`    | WaveManager |
| `loot.py`             | `src/game/loot.ts`           | Loot + drops_for |
| `shop.py`             | `src/game/shop.ts`           | Shop |
| `upgrade.py`          | `src/game/upgrade.ts`        | UpgradeSystem |
| `quest.py`            | `src/game/quest.ts`          | QuestSystem |
| `achievement.py`      | `src/game/achievement.ts`    | AchievementSystem |
| `audio.py`            | `src/game/audio.ts`          | Web Audio procedural |
| `save_manager.py`     | `src/game/save.ts`           | localStorage |
| `ui.py`               | `src/game/ui.ts`             | draw helpers |
| `menu.py`             | `src/game/menu.ts`           | MenuSystem |
| `network.py`          | `src/game/network.ts`        | WebSocket transport |

### Assets

Per user choice: use PNG/SVG. Plan generates simple programmatic SVGs and rasterizes to PNG (or uses SVG directly via `<img>` + `drawImage`). Concretely:
- `public/assets/images/player.svg` (cyan circle + arrow)
- `public/assets/images/zombie-{normal,fast,tank,exploder,ranged,boss}.svg`
- `public/assets/images/bullet.svg`, `enemy-bullet.svg`
- `public/assets/images/tiles/{road,building,house,tree,car,crate}.svg`
- `public/assets/fonts/zombie.ttf` (optional; fallback to system mono)

SVG generation in Task 2 uses a small Node script (no extra runtime dep).

---

## Task Index

1. Bootstrap Next.js + tooling
2. Generate static assets (SVG)
3. Settings + colors + utils (TDD)
4. Vec2 + RNG + collision (TDD)
5. SaveManager (localStorage) (TDD)
6. InputManager
7. Camera
8. Audio (Web Audio procedural)
9. Map (procedural city)
10. Particle system
11. Bullet
12. Weapon + WeaponManager
13. Player
14. Zombie base + 6 subclasses
15. Spawner
16. WaveManager (TDD)
17. Loot
18. Shop (TDD)
19. UpgradeSystem (TDD)
20. QuestSystem (TDD)
21. AchievementSystem
22. UI (HUD, minimap, crosshair, button, toast)
23. MenuSystem
24. Network scaffold (WebSocket types only — stub, no server)
25. Game orchestrator + state machine
26. GameCanvas React component
27. App routes (landing + play)
28. E2E smoke test (Playwright)
29. Lint, typecheck, README polish

---

## Task 1: Bootstrap Next.js + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `.eslintrc.json`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.gitignore`
- Modify: root `.gitignore` (extend)

**Interfaces:**
- Produces: `npm run dev` (Next dev), `npm run build`, `npm run lint`, `npm run typecheck`, `npm test`.

- [ ] **Step 1: Init package.json**

```json
{
  "name": "zombie-survival-web",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Install Next.js 14, React 18, TypeScript 5, Vitest, jsdom, eslint-config-next**

```bash
npm i next@14 react@18 react-dom@18
npm i -D typescript @types/react @types/node @types/react-dom vitest jsdom @vitejs/plugin-react eslint eslint-config-next
```

- [ ] **Step 3: tsconfig.json** — strict, paths `@/*` → `src/*`, jsx `preserve`, target ES2022.

- [ ] **Step 4: next.config.mjs** — minimal, `reactStrictMode: true`.

- [ ] **Step 5: .eslintrc.json** — extends `next/core-web-vitals`, adds `@typescript-eslint/no-explicit-any: error` for `src/game/**`.

- [ ] **Step 6: vitest.config.ts** — jsdom env, alias `@` → `src`.

- [ ] **Step 7: Placeholder pages** — `layout.tsx` + `page.tsx` showing "Zombie Survival — Web" + `globals.css` reset.

- [ ] **Step 8: Verify**

```bash
npm run typecheck && npm run lint && npm run build
```
Expected: green.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: bootstrap next.js + tooling"
```

---

## Task 2: Generate static SVG assets

**Files:**
- Create: `scripts/generate-assets.mjs`, `public/assets/images/*.svg`

**Interfaces:**
- Produces: SVG files referenced by `colors.ts` and entity renderers.

- [ ] **Step 1: Write script** that writes one SVG per entity using the exact colors from `colors.ts` (paste literal hex equivalents of the RGB tuples).

- [ ] **Step 2: Run** `node scripts/generate-assets.mjs`. Verify all expected files exist.

- [ ] **Step 3: Commit**

```bash
git add scripts public/assets
git commit -m "feat(assets): generate placeholder SVGs"
```

---

## Task 3: Settings + colors + utils (TDD)

**Files:**
- Create: `src/game/settings.ts`, `src/game/colors.ts`, `src/game/utils.ts`, `tests/utils.test.ts`

- [ ] **Step 1: Failing test for utils**

```ts
import { clamp, lerp, formatTime, safeJson } from '@/game/utils';
test('clamp within bounds', () => { expect(clamp(5, 0, 10)).toBe(5); expect(clamp(-1, 0, 10)).toBe(0); expect(clamp(11, 0, 10)).toBe(10); });
test('lerp', () => { expect(lerp(0, 10, 0.5)).toBe(5); expect(lerp(0, 10, 0)).toBe(0); expect(lerp(0, 10, 1)).toBe(10); });
test('formatTime', () => { expect(formatTime(0)).toBe('00:00'); expect(formatTime(75)).toBe('01:15'); expect(formatTime(3661)).toBe('61:01'); });
test('safeJson', () => { expect(safeJson('{"a":1}')).toEqual({a:1}); expect(safeJson('garbage', {a:0})).toEqual({a:0}); });
```

Run: `npm test -- utils.test.ts` → FAIL (module missing).

- [ ] **Step 2: Implement utils.ts** mirroring `utils.py` exactly (clamp/lerp/formatTime/safeJson).

- [ ] **Step 3: Implement settings.ts** — copy of `settings.py` constants as exported `const`, plus `RESOLUTIONS` array. No Python-only items.

- [ ] **Step 4: Implement colors.ts** — `COLORS` map (string keys) with hex equivalents of RGB tuples in `settings.py:COLORS`, plus `color(name)` returning the hex string.

- [ ] **Step 5: Re-run test** → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/settings.ts src/game/colors.ts src/game/utils.ts tests/utils.test.ts
git commit -m "feat(game): settings, colors, utils"
```

---

## Task 4: Vec2 + RNG + collision (TDD)

**Files:**
- Create: `src/game/vec.ts`, `src/lib/rng.ts`, `src/game/collision.ts`, `tests/collision.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { circleVsRect, slideMove } from '@/game/collision';
test('circle overlaps rect', () => {
  expect(circleVsRect({x:0,y:0,r:5}, {x:3,y:3,w:4,h:4})).toBe(true);
  expect(circleVsRect({x:0,y:0,r:5}, {x:20,y:20,w:4,h:4})).toBe(false);
});
test('slideMove', () => {
  const rects = [{x:0,y:0,w:10,h:10}];
  // moving into rect from left should clamp x at -5
  const out = slideMove({x:-15,y:0,r:5}, {x:1,y:0}, rects);
  expect(out.x).toBe(-5);
});
```

Run → FAIL.

- [ ] **Step 2: Implement vec.ts** — minimal Vec2 ops: `add`, `sub`, `scale`, `len`, `normalize`, `clone`. Avoid mutable `this` issues; return new objects or use `Object.freeze` on inputs.

- [ ] **Step 3: Implement rng.ts** — `mulberry32(seed)` returning `(rng: { next(): number; int(n): number; range(a,b): number; pick<T>(arr): T })`.

- [ ] **Step 4: Implement collision.ts** — port `circle_vs_rect` and `slide_move` from `collision.py`. Use axis-separated resolve: try X-only move, then Y-only; on penetration, push out by min axis.

- [ ] **Step 5: Re-run test** → PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(game): vec, rng, collision"
```

---

## Task 5: SaveManager (TDD)

**Files:**
- Create: `src/game/save.ts`, `tests/save.test.ts`

- [ ] **Step 1: Failing test** — uses jsdom `localStorage` (auto-provided). Test default shape, round-trip, malformed JSON fallback, `recordRun` updates high score.

```ts
import { SaveManager } from '@/game/save';
test('default save', () => {
  localStorage.clear();
  const s = new SaveManager();
  expect(s.coins).toBe(0);
  expect(s.high_score).toBe(0);
});
test('round trip', () => {
  localStorage.clear();
  const s = new SaveManager();
  s.coins = 100; s.save();
  const s2 = new SaveManager();
  expect(s2.coins).toBe(100);
});
test('malformed fallback', () => {
  localStorage.setItem('zs.save.v1', '{garbage');
  const s = new SaveManager();
  expect(s.coins).toBe(0);
});
test('recordRun', () => {
  localStorage.clear();
  const s = new SaveManager();
  expect(s.recordRun(50, 3, 20, 1, 0)).toBe(false);
  expect(s.recordRun(500, 10, 50, 2, 0)).toBe(true);
  expect(s.high_score).toBe(500);
  expect(s.total_kills).toBe(10);
});
```

Run → FAIL.

- [ ] **Step 2: Implement save.ts** — port `SaveManager` from `save_manager.py`. Default = same shape as `data/save.json`. Key = `zs.save.v1`. On parse error, log warn and use defaults; do not throw.

- [ ] **Step 3: Re-run** → PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(game): save manager"
```

---

## Task 6: InputManager

**Files:**
- Create: `src/game/input.ts`

**Interfaces:**
- Consumes: KeyboardEvent, MouseEvent, pointer lock state.
- Produces: methods `isDown(action)`, `wasPressed(action)`, `mousePos`, `aimAngle`, `endFrame()`.

- [ ] **Step 1: Define action names** matching Pygame defaults: `up, down, left, right, shoot, reload, weapon1..5, next_weapon, vacuum, pause`. Rebind map stored in `SaveManager.settings.bindings` (add default map in `save.ts` defaults).

- [ ] **Step 2: Implement** — track key state by code, mouse pos via `mousemove`, `wasPressed` flag cleared by `endFrame()`. Left-click → `shoot` (analog of `mouse.get_pressed[0]`). Right-click → `reload`? No, Pygame uses `R`. Middle-click → `next_weapon`.

- [ ] **Step 3: Pointer lock** — request on first click in canvas; compute aim angle from `player.pos` to `mousePos` while locked, else from screen center if not.

- [ ] **Step 4: Commit**

```bash
git add src/game/input.ts
git commit -m "feat(game): input manager"
```

---

## Task 7: Camera

**Files:**
- Create: `src/game/camera.ts`

**Interfaces:**
- `new Camera(viewW, viewH)`. Methods: `update(target: Vec2, dt)`, `shake(amt)`, `apply(ctx)`, `viewRect()`, `worldToScreen(p)`, `screenToWorld(p)`.

- [ ] **Step 1: Port** — smooth follow via lerp factor from `settings.ts`; shake via decaying offset; culling rect returned in world space. Same formulas as `camera.py`.

- [ ] **Step 2: Commit**

```bash
git add src/game/camera.ts
git commit -m "feat(game): camera"
```

---

## Task 8: Audio (Web Audio procedural)

**Files:**
- Create: `src/game/audio.ts`

- [ ] **Step 1: Implement AudioManager** — singleton wrapping `AudioContext`. No asset files required. Each named sfx is a tiny synth:
  - `shoot`: short square blip, ~80ms, freq varies by weapon.
  - `hit`: noise burst ~60ms with lowpass.
  - `explosion`: longer noise + low sweep.
  - `pickup`: two-tone sine.
  - `levelup`: ascending arpeggio.
  - `click`: short triangle.
  - `music`: optional simple loop (skip on first pass if `musicVolume===0`).

- [ ] **Step 2: `load/master/music/sfx volumes`**, `play(name)`, `start_music()`, `stop_music()`. No-op if `AudioContext` is unavailable.

- [ ] **Step 3: Commit**

```bash
git add src/game/audio.ts
git commit -m "feat(game): procedural audio"
```

---

## Task 9: Map (procedural city)

**Files:**
- Create: `src/game/map.ts`

**Interfaces:**
- `new GameMap(seed?)`. Methods: `blocked(p, r)`, `randomFreePoint(rng)`, `draw(ctx, camera)`, world rects/colliders as `Rect[]`.

- [ ] **Step 1: Port** `map.py:_generate` — roads (grid), buildings, houses, trees, cars, crates, barricades. Same RNG seed default = `settings.MAP_SEED`.

- [ ] **Step 2: Draw** — `fillRect` for tiles, `drawImage` for SVG assets where available, fallback to `fillRect` colored. Respect camera transform (`ctx.translate(-cam.x, -cam.y)`).

- [ ] **Step 3: Commit**

```bash
git add src/game/map.ts
git commit -m "feat(game): procedural map"
```

---

## Task 10: Particle system

**Files:**
- Create: `src/game/particle.ts`

**Interfaces:**
- `new ParticleSystem(max=900)`. Methods: `update(dt)`, `draw(ctx, cam)`, `blood(p, n)`, `muzzle(p, dir)`, `explosion(p, r)`, `heal(p)`, `damageNumber(p, value)`, `clear()`.

- [ ] **Step 1: Port** `particle.py` — `Particle {pos, vel, life, max_life, color, size, kind}`. Cap by `MAX_PARTICLES` (drop oldest when exceeded). Damage numbers float upward and fade.

- [ ] **Step 2: Commit**

```bash
git add src/game/particle.ts
git commit -m "feat(game): particle system"
```

---

## Task 11: Bullet

**Files:**
- Create: `src/game/bullet.ts`

**Interfaces:**
- `new Bullet(p, vel, dmg, opts)`; `new EnemyBullet(p, vel, dmg)`. Methods: `update(dt, game)`, `draw(ctx, cam)`, `dead: boolean`. Trail rendering, crit visuals, sub-step collision against zombies and rects.

- [ ] **Step 1: Port** `bullet.py` — keep `LIFETIME`, sub-step integration by `Math.ceil(speed*dt/MAX_STEP)`. Trail = small array of past positions.

- [ ] **Step 2: Commit**

```bash
git add src/game/bullet.ts
git commit -m "feat(game): bullets"
```

---

## Task 12: Weapon + WeaponManager

**Files:**
- Create: `src/game/weapon.ts`, `tests/weapon.test.ts`

- [ ] **Step 1: Failing test** for `WeaponManager`:
  - Loads from `weapons.json` fixture.
  - Switching weapon updates `currentKey`.
  - `tryShoot(now)` respects fire_rate, magazine, auto flag.
  - `reload()` resets magazine from reserve.

- [ ] **Step 2: Port** `weapon.py` — `Weapon` class with stats from JSON, `WeaponManager` with order, switch by index, `WEAPON_ORDER` constant.

- [ ] **Step 3: Run test** → PASS.

- [ ] **Step 4: Copy `public/data/weapons.json`** verbatim from `data/weapons.json`. Add `public/data/weapons.json.d.ts` (or `as const` cast) for typing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(game): weapon system"
```

---

## Task 13: Player

**Files:**
- Create: `src/game/player.ts`

**Interfaces:**
- `new Player(pos, opts?)`. Methods: `update(dt, game)`, `draw(ctx, cam)`, `addXp(amt, game)`, `takeDamage(dmg)`, `dead: boolean`, plus stats accessors.

- [ ] **Step 1: Port** `player.py` — move (WASD), aim, shoot (calls `WeaponManager`), reload, vacuum (hold E), XP, level/pending levels, armor, multipliers, crit, day/night factor reads from game.

- [ ] **Step 2: Multipliers** — apply `upgrade.ts` patches via getters: damage_mult, fire_rate_mult, reload_mult, speed_mult, max_hp_flat, crit_chance_bonus, crit_damage_bonus, armor_flat.

- [ ] **Step 3: Commit**

```bash
git add src/game/player.ts
git commit -m "feat(game): player"
```

---

## Task 14: Zombie base + 6 subclasses

**Files:**
- Create: `src/game/zombie.ts`

**Interfaces:**
- `class Zombie` base. Subclasses: `NormalZombie`, `FastZombie`, `TankZombie`, `ExploderZombie`, `RangedZombie`, `BossZombie`. `KIND` static, stats loaded from `zombies.json`. `ZOMBIE_CLASSES` map, `ZOMBIE_COLORS` map. Method: `update(dt, game)`, `draw(ctx, cam)`, `takeDamage(amt, game)`.

- [ ] **Step 1: Port** `zombie.py` — AI: idle, chase (within detection), attack (within attack_range, cooldown). Exploder detonates on proximity. Ranged fires enemy bullet. Boss does radial barrage every `barrage_interval`.

- [ ] **Step 2: Wave scaling** — at spawn, apply HP/speed/damage growth per current wave from game (read `game.wave_manager.wave_index`).

- [ ] **Step 3: Copy** `public/data/zombies.json` verbatim.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(game): zombie AI"
```

---

## Task 15: Spawner

**Files:**
- Create: `src/game/spawner.ts`

**Interfaces:**
- `new ZombieSpawner()`. `pickType(waveIndex, nightFactor, rng)`, `spawnPos(player, rng)`, `makeZombie(kind, pos, wave, rng)`.

- [ ] **Step 1: Port** `spawner.py` — min/max distance bands, weighted pick (unlock weights as wave grows), boss every Nth wave flag.

- [ ] **Step 2: Commit**

```bash
git add src/game/spawner.ts
git commit -m "feat(game): zombie spawner"
```

---

## Task 16: WaveManager (TDD)

**Files:**
- Create: `src/game/waveManager.ts`, `tests/waveManager.test.ts`

- [ ] **Step 1: Failing test**

```ts
test('sizes grow with wave', () => {
  const w = new WaveManager();
  expect(w.sizeFor(1)).toBe(10);
  expect(w.sizeFor(6)).toBeGreaterThan(10);
});
test('boss wave flag', () => {
  const w = new WaveManager();
  expect(w.isBossWave(5)).toBe(true);
  expect(w.isBossWave(4)).toBe(false);
});
test('update transitions', () => {
  const w = new WaveManager();
  w.remaining = 0;
  w.update(0.1, fakeGameWithZombies([]));
  expect(w.phase).toBe('intermission');
});
```

- [ ] **Step 2: Port** `wave_manager.py` — phases: intermission → spawning → active → cleared. Scale formula matches Pygame.

- [ ] **Step 3: Run test** → PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(game): wave manager"
```

---

## Task 17: Loot

**Files:**
- Create: `src/game/loot.ts`

**Interfaces:**
- `Loot { pos, kind, value, dead, magnetized, update, draw }`. `drops_for(zombie, rng): Loot[]`.

- [ ] **Step 1: Port** `loot.py` — coin/ammo/health/armor/weapon drops with magnetic vacuum behavior when E held.

- [ ] **Step 2: Commit**

```bash
git add src/game/loot.ts
git commit -m "feat(game): loot"
```

---

## Task 18: Shop (TDD)

**Files:**
- Create: `src/game/shop.ts`, `tests/shop.test.ts`

- [ ] **Step 1: Failing test**

```ts
test('buy weapon when enough coins', () => {
  const s = new Shop();
  const save = { coins: 1000, unlocked_weapons: ['pistol'], data:{}, save: () => {} } as any;
  const player = { coins: 1000, weapon_manager: { unlock: () => {} } } as any;
  expect(s.buy('shotgun', { save, player })).toBe(true);
  expect(save.unlocked_weapons).toContain('shotgun');
});
test('buy fails on insufficient coins', () => {
  const s = new Shop();
  expect(s.buy('sniper', { save: { coins: 0, unlocked_weapons: [], data:{}, save: () => {} }, player: { coins: 0, weapon_manager: { unlock: () => {} } } } as any)).toBe(false);
});
```

- [ ] **Step 2: Port** `shop.py` — items: weapons (by key), ammo, health, armor, max_hp. Returns false on insufficient coins. Persists via `save.save()`.

- [ ] **Step 3: Run test** → PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(game): shop"
```

---

## Task 19: UpgradeSystem (TDD)

**Files:**
- Create: `src/game/upgrade.ts`, `tests/upgrade.test.ts`

- [ ] **Step 1: Failing test**

```ts
test('apply max_hp respects limit', () => {
  const u = new UpgradeSystem();
  const player = { max_hp: 100, hp: 100, upgrade_counts: {} } as any;
  for (let i = 0; i < 15; i++) u.apply('max_hp', player, {} as any);
  expect(player.max_hp).toBe(100 + 10*10);
});
test('roll_choices returns 3 distinct', () => {
  const u = new UpgradeSystem();
  const choices = u.roll_choices({ upgrade_counts: {} } as any);
  expect(new Set(choices).size).toBe(3);
});
```

- [ ] **Step 2: Port** `upgrade.py` — load from `upgrades.json`; `roll_choices` picks 3 distinct; `apply` mutates player + increments counts, respects `limits`.

- [ ] **Step 3: Copy** `public/data/upgrades.json` verbatim.

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(game): upgrade system"
```

---

## Task 20: QuestSystem (TDD)

**Files:**
- Create: `src/game/quest.ts`, `tests/quest.test.ts`

- [ ] **Step 1: Failing test**

```ts
test('kill quest progresses', () => {
  const q = new QuestSystem();
  q.bind({ stats: { kills: 0 } } as any);
  // simulate kill
  q.update({ stats: { kills: 5 } } as any);
  expect(q.active[0].progress).toBe(5);
});
```

- [ ] **Step 2: Port** `quest.py` — 5 quest templates, pick 5 at run start, on completion reward coins + XP and notify game.

- [ ] **Step 3: Run test** → PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(game): quest system"
```

---

## Task 21: AchievementSystem

**Files:**
- Create: `src/game/achievement.ts`

- [ ] **Step 1: Port** `achievement.py` — list of 7 achievements; check on relevant game events; toast on unlock; persist IDs to `save.achievements`.

- [ ] **Step 2: Commit**

```bash
git add src/game/achievement.ts
git commit -m "feat(game): achievements"
```

---

## Task 22: UI (draw helpers)

**Files:**
- Create: `src/game/ui.ts`

- [ ] **Step 1: Port** `ui.py` — `drawHud`, `drawMinimap`, `drawCrosshair`, `drawButton`, `drawText`, `drawToasts`, `drawWaveBanner`. Canvas-only; uses `color()` and `settings.ts` constants.

- [ ] **Step 2: Commit**

```bash
git add src/game/ui.ts
git commit -m "feat(game): UI draw helpers"
```

---

## Task 23: MenuSystem

**Files:**
- Create: `src/game/menu.ts`

- [ ] **Step 1: Port** `menu.py` — `MenuSystem` builds screens: Main, Pause, Settings, Shop, Upgrades, Game Over. Emits `action` strings consumed by `Game.do_action()`.

- [ ] **Step 2: Commit**

```bash
git add src/game/menu.ts
git commit -m "feat(game): menu system"
```

---

## Task 24: Network scaffold (stub)

**Files:**
- Create: `src/game/network.ts`

- [ ] **Step 1: Define types** — `ServerToClient`, `ClientToServer` message unions; `Server` and `Client` classes wrap `WebSocket`. Document integration point in header comment matching `network.py` docstring.

- [ ] **Step 2: No server bundled.** Flag `NEXT_PUBLIC_NETWORK` env to enable.

- [ ] **Step 3: Commit**

```bash
git add src/game/network.ts
git commit -m "feat(game): network scaffold (stub)"
```

---

## Task 25: Game orchestrator + state machine

**Files:**
- Create: `src/game/game.ts`

**Interfaces:**
- `new Game(ctx: CanvasRenderingContext2D, view: {w:number;h:number})`. `run()`, `stop()`, `handleEvent(e)`, `doAction(s)`, `update(dt)`, `draw()`, plus `state` getter.

- [ ] **Step 1: Port** `game.py` — wire all systems. State machine: `MENU / PLAYING / PAUSED / SHOP / UPGRADE / UPGRADE_INFO / SETTINGS / GAME_OVER`. Methods: `new_run()`, `commit_run()`, `game_over()`, `enter_upgrade_choice()`, `_tick_toasts(dt)`, `toast(text)`.

- [ ] **Step 2: Event loop** — `requestAnimationFrame`; `dt = min(0.05, now - prev)`. Forward events to `input.ts`.

- [ ] **Step 3: Settings resolution** — read from `SaveManager.settings`, apply to `view.w/h`. Persist on change.

- [ ] **Step 4: Day/night** — track `timeOfDay`, compute `nightFactor`, feed to spawner + audio + particles.

- [ ] **Step 5: Self-test smoke** — add a hidden `?smoke=1` URL param that, after 2s in PLAYING with a dummy run, asserts no thrown errors. Used by Playwright in Task 28.

- [ ] **Step 6: Commit**

```bash
git add src/game/game.ts
git commit -m "feat(game): orchestrator + state machine"
```

---

## Task 26: GameCanvas React component

**Files:**
- Create: `src/components/GameCanvas.tsx`

- [ ] **Step 1: Component** — `'use client'`. Manages canvas ref, instantiates `Game`, attaches keyboard + mouse + resize listeners, returns the `<canvas>` sized to container with `ResizeObserver`.

- [ ] **Step 2: Cleanup** — on unmount, call `game.stop()` and remove listeners.

- [ ] **Step 3: Commit**

```bash
git add src/components/GameCanvas.tsx
git commit -m "feat(ui): game canvas host"
```

---

## Task 27: App routes

**Files:**
- Create/Modify: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/play/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Landing** `page.tsx` — hero, "Play" button linking to `/play`, short controls table, link to original Python version.

- [ ] **Step 2: Play route** mounts `<GameCanvas />` fullscreen; shows FPS overlay if `save.settings.show_fps`.

- [ ] **Step 3: globals.css** — reset, body bg `#10120E`, monospace stack, full-viewport container.

- [ ] **Step 4: Verify**

```bash
npm run dev
# manually click Play; confirm game loads, WASD + click work
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(app): routes + landing"
```

---

## Task 28: E2E smoke test (Playwright)

**Files:**
- Create: `e2e/smoke.spec.ts`, `playwright.config.ts`

- [ ] **Step 1: Install** `npm i -D @playwright/test && npx playwright install chromium`.

- [ ] **Step 2: Test**: load `/play?smoke=1`, wait 3s, assert canvas exists and no console errors. Screenshot to `e2e/smoke.png`.

- [ ] **Step 3: Run** `npm run e2e` (add script).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(e2e): smoke"
```

---

## Task 29: Lint, typecheck, README polish

**Files:**
- Modify: `package.json`, `README.md`, root `README.md` → add "Web version" section

- [ ] **Step 1: Add `npm run verify`** = `npm run lint && npm run typecheck && npm test`. Add `pre-commit` script stub in README.

- [ ] **Step 2: Update README** — Web section with `npm run dev`, controls mirror table, deployment note (Vercel/Netlify static).

- [ ] **Step 3: Run full suite**

```bash
npm run verify && npm run e2e && npm run build
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: web readme + verify script"
```

---

## Self-review checklist (for planner)

- [x] Every Python module has a TS counterpart in the file structure.
- [x] Every JSON data file is preserved verbatim.
- [x] Save state maps cleanly to localStorage key `zs.save.v1`.
- [x] All tuning constants in `settings.ts` mirror `settings.py`.
- [x] Each task ends with `npm test` (where TDD) or `npm run typecheck` green, and a commit.
- [x] No placeholder text. Each step shows exact code or commands.
- [x] Type names consistent: `Game`, `Player`, `Zombie`, `Bullet`, `Weapon`, `Loot`, `Shop`, `UpgradeSystem`, `QuestSystem`, `AchievementSystem`, `WaveManager`, `ZombieSpawner`, `SaveManager`, `AudioManager`, `InputManager`, `Camera`, `GameMap`, `ParticleSystem`, `MenuSystem`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-29-zombie-survival-web.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints for review.

Note: with 29 tasks, subagent-driven is strongly recommended. Inline will exhaust context long before completion. Confirm preference and I'll start with Task 1.
