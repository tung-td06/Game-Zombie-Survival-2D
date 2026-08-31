# Mobile-First Touch Controls for Zombie Survival 2D — Web

**Status:** Draft (approved by user 2026-08-31)
**Owner:** Game team
**Target:** `web/` (Next.js 14 + Canvas 2D game core)

## 1. Problem

The web build (`web/`) currently targets desktop only — `WASD` movement,
mouse aim, left-click fire, `R` reload, `ESC` pause. When a mobile user
opens `/play` on a phone or tablet, the game is unplayable: there is no
visible cursor (pointer lock is unsupported on most mobile browsers), no
keyboard, and touch events on the canvas do nothing useful.

We want mobile users to be able to **play the full game**, not just see
the landing page, while keeping the desktop experience pixel-identical
and not regressing the existing Python parity contract.

## 2. Goals & non-goals

**Goals**

- Mobile browsers (iOS Safari 16+, Android Chrome 110+) can play the full
  game on `/play` — same features as desktop, same save profile.
- Desktop browsers get exactly the existing input model — no behaviour
  change, no new UI overlay, no extra event listeners on `window` for
  keyboard/mouse paths.
- Zero changes to game-core systems (`src/game/player.ts`,
  `src/game/zombie.ts`, `src/game/ai/`, combat, wave, loot). Mobile is
  purely a new *input layer*.
- Multi-touch works: player can hold the joystick **and** the fire
  button **and** tap pause simultaneously without input drops.

**Non-goals**

- PWA install / service worker / offline mode.
- Mobile-only redesign of menus (upgrade cards, shop) — they keep the
  existing canvas-drawn layout, sized via existing `RESOLUTIONS` logic.
- Haptic feedback, gyroscope aim, pinch-to-zoom, two-finger gestures.
- New weapon or zombie types.

## 3. Architectural rule: game core must not know about mobile

The web game core reads input via `InputManager` (`src/game/input.ts`).
Player aim is computed in `Player.update()` at `src/game/player.ts:125`
from `inp.mouseX` / `inp.mouseY` translated to world coordinates.

**The mobile layer never edits the game core.** It only writes values
that the game core already consumes. Specifically:

```
Touch events
   │
   ├── VirtualJoystick.tsx     →  TouchInputState.moveVec: Vec2
   ├── FireButton.tsx          →  TouchInputState.fireHeld: boolean
   ├── WeaponSwitcher.tsx      →  TouchInputState.weapon1..5 pressed
   ├── PauseButton.tsx         →  TouchInputState.pausePressed
   └── touchAim.ts (NEW)       →  TouchInputState.aimOverride: Vec2|null
                                          (world coords, or null)
                                          │
                                          ▼
              InputManager (modified) ──► reads aimOverride BEFORE
                                          using mouseX/mouseY for aim
                                          │
                                          ▼
                                       Player.update()
                                       (unchanged)
```

`aimOverride` is **world coordinates** (not screen). `Player.update()`
does `Math.atan2(aimWorld.y - pos.y, aimWorld.x - pos.x)` — we feed it
the world point directly so the same math works for mouse *and* touch.

## 4. Detection strategy (no hydration mismatch)

### 4.1 Server (Next.js `layout.tsx` / `play/page.tsx`)

`next/headers` `headers()` exposes `user-agent`. We parse it once in a
**server component** to seed the initial DOM (CSS class on `<body>`,
viewport meta) before hydration. The server decision is a *hint*, not
authoritative.

```ts
// src/lib/device.ts (NEW, server-safe)
export function isMobileUserAgent(ua: string | null): boolean {
  if (!ua) return false;
  return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
}
```

### 4.2 Client (authoritative)

After hydration, a `useIsMobile()` hook installs a
`matchMedia('(pointer: coarse) and (max-width: 900px)')` listener and
returns the live result. This handles landscape phones, tablets,
foldables, and rotation events. `localStorage.manualOverride` lets the
user force desktop layout from a footer link if a tablet misdetects.

```
SSR  ─► reads user-agent ─► sets <body class="device-hint-mobile|desktop">
Hydration ─► useIsMobile() runs matchMedia ─► overrides class
Subsequent ─► matchMedia change listener updates class on the fly
```

**Never call `navigator.userAgent` at the top level of a client
component.** Wrap reads in effects or event handlers so SSR and CSR
agree on the initial render.

## 5. Module map

```
web/src/
├── lib/
│   └── device.ts                 NEW   UA parse + useIsMobile() hook
│
├── game/
│   ├── input.ts                  MOD   aimOverride, moveVec, fireHeld
│   │                                    setters; touch setters bypass
│   │                                    mouseHeld/mouseX for aim only
│   └── touchAim.ts               NEW   getAutoAimDirection()
│                                        (pure, no React, no DOM)
│
└── components/
    ├── GameCanvas.tsx            MOD   reads useIsMobile(), conditionally
    │                                    mounts <TouchHUD/>, attaches touch
    │                                    listeners only when mobile
    └── touch/
        ├── VirtualJoystick.tsx   NEW   left thumb, drag inside ring
        ├── FireButton.tsx        NEW   right thumb, hold to fire
        ├── WeaponSwitcher.tsx    NEW   swipe / tap buttons 1-5
        ├── PauseButton.tsx       NEW   top-right, one-shot
        └── TouchHUD.tsx          NEW   composes the four above,
                                         applies safe-area padding
```

The four touch components live in `src/components/touch/` because they
are React UI. `touchAim.ts` lives in `src/game/` because it is a pure
function that reads `game.zombies` and `game.player.pos` — game data,
not DOM.

## 6. Component contracts

### 6.1 `TouchInputState` (new, lives inside `input.ts`)

```ts
class InputManager {
  // existing mouse/keyboard fields unchanged

  // NEW: touch layer writes these
  moveVec: Vec = { x: 0, y: 0 };        // joystick [-1,1]
  fireHeld: boolean = false;            // fire button
  weaponPressed: Set<1|2|3|4|5> = new Set();   // cleared each frame
  pausePressed: boolean = false;        // one-shot, cleared next frame
  aimOverride: Vec | null = null;       // world coords, or null

  // NEW: helper that player.ts uses
  getAimWorld(camera: Camera): Vec {
    if (this.aimOverride) return this.aimOverride;
    return camera.screenToWorld({ x: this.mouseX, y: this.mouseY });
  }
}
```

`Player.update()` calls `inp.getAimWorld(this.camera)` instead of
manually computing from `mouseX/mouseY`. This is the **only** line that
changes in `player.ts:125-127`. Everything else (movement from
`keysDown`, fire from `mouseHeld`) keeps working untouched.

### 6.2 `VirtualJoystick.tsx`

- Fixed bottom-left, **80px above the safe-area bottom**.
- Outer ring 130px, inner thumb 60px, both `pointer-events: auto`.
- On `pointerdown` inside ring: capture `pointerId`, set thumb to
  touch position clamped to ring radius. On `pointermove` with same
  `pointerId`: update thumb and emit normalised vector `(dx/R, dy/R)`
  via callback (length capped at 1).
- On `pointerup`/`pointercancel` with the captured `pointerId`:
  release and emit `(0,0)`.
- Emits into `InputManager.moveVec` through a ref passed by
  `TouchHUD`. No re-renders on drag — pointer events update a ref.

**Multi-touch correctness:** the joystick owns exactly one `pointerId`
at a time (the first finger down inside its ring). A second finger on
the fire button is a different `pointerId` and does not interrupt the
joystick's tracked touch.

### 6.3 `FireButton.tsx`

- Fixed bottom-right, same safe-area offset as joystick.
- Round 110px button. Press-and-hold sets `fireHeld = true`; release
  sets false. Multi-touch-safe (tracks its own `pointerId`).
- Internally calls `getAutoAimDirection()` each frame the button is
  held and writes `aimOverride`. If auto-aim finds nothing in range,
  `aimOverride` falls back to the joystick's last direction (so a
  tap-fire still aims somewhere).

### 6.4 `touchAim.ts` (pure)

```ts
export interface AimTarget { pos: Vec; hp: number; priority: number; }

export function getAutoAimDirection(
  playerPos: Vec,
  targets: AimTarget[],
  opts: { radius: number; preferAttacking: boolean },
): Vec | null;
```

Selection rules, in order:

1. Filter `targets` to those within `opts.radius` of `playerPos`.
2. If `preferAttacking` and any target has `priority > 0`, return the
   vector to the nearest *attacking* target.
3. Otherwise return the vector to the nearest target overall.
4. If the filtered list is empty, return `null` (no aim — fire button
   falls back to last joystick direction).

Defaults: `radius = 600` (world units), `preferAttacking = true`. Both
are exposed as settings in the in-game Settings menu so they can be
tuned (the spec leaves the exact settings-menu placement to
implementation, but the toggle must exist by v1).

`targets` is computed once per frame from `game.zombies` — the touch
HUD reads `gameRef.current` (already exposed at
`GameCanvas.tsx:57`) and builds the list. Game core does not call
`touchAim.ts`; only the React layer does.

### 6.5 `WeaponSwitcher.tsx`

- Fixed top-centre, 5 small round buttons (or a swipe strip).
- Tap button N → `weaponPressed.add(N)` for one frame.
- Swipe left/right across the strip → same effect as
  `next_weapon` (cycles to neighbour).

### 6.6 `PauseButton.tsx`

- Fixed top-right, 44px square, safe-area aware.
- On `pointerdown` → `pausePressed = true` (consumed in next frame,
  like `keysPressed`).

### 6.7 `TouchHUD.tsx`

Composes the four components. Receives `input: InputManager` and
`gameRef: React.MutableRefObject<Game | null>` from `GameCanvas`.

Applies safe-area padding to its container:

```css
.touch-hud {
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  padding-left: max(16px, env(safe-area-inset-left));
  padding-right: max(16px, env(safe-area-inset-right));
  padding-top: max(16px, env(safe-area-inset-top));
}
```

iOS Safari requires `<meta name="viewport" content="viewport-fit=cover">`
to make `safe-area-inset-*` non-zero. Set in `layout.tsx` export.

## 7. GameCanvas integration

```tsx
const isMobile = useIsMobile();

useEffect(() => {
  // ...existing desktop setup unchanged
}, [...]);

return (
  <div className={isMobile ? "device-mobile" : "device-desktop"}
       style={{ position: "relative", width: "100%", height: "100%" }}>
    <canvas ref={ref} ... />
    {isMobile && gameRef.current && (
      <TouchHUD input={gameRef.current.input}
                gameRef={gameRef}
                dpr={dpr} />
    )}
    {/* existing ws overlay */}
  </div>
);
```

Critical: keyboard/mouse listeners (`window.addEventListener('keydown',
...)`) stay attached regardless of device. On a phone they simply never
fire. The HUD writes to `input.moveVec` etc. on top of any existing
mouse state. On desktop, the HUD is never mounted.

The pointer-lock `requestPointerLock` call at `GameCanvas.tsx:71-73`
already no-ops on mobile (`document.pointerLockElement` is never the
canvas). We add a guard: if `isMobile` is true, skip the click handler
that requests pointer lock so we don't try to grab focus from a touch
tap.

## 8. Testing strategy

### 8.1 Unit (Vitest)

- `lib/device.ts`
  - `isMobileUserAgent()` truth table on sample UAs (iPhone Safari,
    iPad Safari, Android Chrome, desktop Chrome, desktop Safari).
  - `useIsMobile()` renders correctly when `matchMedia` returns
    mobile vs desktop (jsdom test using `window.matchMedia` mock).
- `game/touchAim.ts`
  - Returns nearest target within radius.
  - Prefers attacking target when flag set.
  - Returns `null` when no targets in range.
  - Returns null on empty array.
  - Edge: player surrounded by targets at equal distance — picks
    deterministic one (closest by squared distance, tie-break by
    lower hp, final tie-break by index).

### 8.2 E2E (Playwright)

- New project `playwright.config.ts` entry `mobile-touch`:
  - `use: { ...devices['iPhone 14'], hasTouch: true }`
  - Boots `npm run start` with `?smoke=1`.
- Test scenarios:
  - Page loads, canvas present, TouchHUD mounts (assert
    `[data-testid="touch-hud"]` exists).
  - Drag joystick centre → top, release → centre (assert
    `window.__game.input.moveVec` goes to `(0, -1)` then `(0, 0)`).
  - Hold fire button → `input.fireHeld` is true, `input.aimOverride`
    is non-null if zombies are on screen.
  - Two-finger touch: joystick on left, fire on right, both stay
    active simultaneously (Playwright `page.touchscreen.tap` +
    manual CDP `Input.dispatchTouchEvent`).
  - Safe area: emulate iPhone with notch, assert joystick bottom edge
    is ≥ 34px from viewport bottom.

### 8.3 Manual smoke

- Real iPhone (Safari) + Android (Chrome) before merging. Two devices
  must complete one wave without input drops.

## 9. Out-of-scope follow-ups (deferred)

- Settings toggle for auto-aim radius / on-off (data plumbing now,
  UI toggle is a follow-up — touchAim reads opts from a constants
  object so wiring is one-line).
- Customisable HUD layout (drag-to-reposition).
- Gamepad API support (would also feed `moveVec` / `fireHeld`).
- Landscape vs portrait auto-rotation of HUD positions.

## 10. Acceptance criteria

1. On desktop (UA desktop, no touch), `/play` behaves identically to
   before this change — verified by E2E replay of the existing smoke
   test plus visual diff of the canvas.
2. On iPhone Safari (iOS 17) and Android Chrome 120+, `/play` mounts
   the touch HUD, joystick + fire button + pause button are visible
   and reachable inside the safe area.
3. Multi-touch test passes: joystick + fire + pause can all be
   active at once, no input drops.
4. Auto-aim finds a target when zombies are within `radius = 600`;
   `aimOverride` becomes `null` outside that radius.
5. `npm run verify` (lint + typecheck + vitest) passes; `npm run e2e`
   passes both desktop and mobile projects.
6. Game-core diff is limited to:
   - `input.ts` (add fields + `getAimWorld`)
   - `player.ts:125-127` (one line: use `getAimWorld`)
   No changes to `zombie.ts`, `waveManager.ts`, `spawner.ts`,
   `loot.ts`, `weapon.ts`, `bullet.ts`, `game.ts` core loop.