"use client";

// TouchHUD composes the mobile controls and wires them into the existing
// InputManager — no game-core changes. Twin-stick layout:
//
//   • LEFT joystick  → movement (moveVec → WASD key surface)
//   • RELOAD button  → one-shot reloadPressed (existing R-key surface)
//   • RIGHT joystick → aim + fire (aimOverride + fireHeld → existing weapon)
//   • WEAPON button  → cycles owned weapons (next_weapon binding)
//   • BOMB button    → one-shot bombPressed (existing F-key surface)
//   • PAUSE button   → real Escape keydown (existing pause manager)
//
// Controls only react during real gameplay: joysticks / fire / weapon / bomb
// / reload are hidden whenever the game is not PLAYING (pause menus, upgrade
// picks, game over, boot), so they never sit over the canvas menus. They stay
// MOUNTED (display:none), which preserves the last aim direction and joystick
// state across a pause — returning to the game never auto-fires or auto-moves.
// The PAUSE button stays available while paused so the player can resume.
//
// Sizes scale with the viewport (clamped touch targets); safe-area insets
// keep everything clear of notches and gesture bars.

import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { InputManager } from "@/game/input";
import type { Game } from "@/game/game";
import VirtualJoystick from "./VirtualJoystick";
import RightJoystick from "./RightJoystick";
import FireButton from "./FireButton";
import ReloadButton from "./ReloadButton";
import BombButton from "./BombButton";
import WeaponSwitchButton from "./WeaponSwitchButton";
import PauseButton from "./PauseButton";

interface Props {
  input: InputManager;
  gameRef: RefObject<Game | null>;
}

/** Clamped touch-target sizes driven by the smaller viewport dimension. */
function computeControlSizes(): {
  joystick: number;
  thumb: number;
  button: number;
  fire: number;
} {
  if (typeof window === "undefined") {
    return { joystick: 120, thumb: 56, button: 60, fire: 80 };
  }
  // Prefer the VISUAL viewport (tracks the mobile URL-bar collapse and
  // pinch zoom); fall back to the layout viewport for older browsers.
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const base = Math.min(vw, vh); // landscape → the height; portrait → width
  const joystick = Math.round(Math.max(96, Math.min(150, base * 0.3)));
  const thumb = Math.round(joystick * 0.46);
  const button = Math.round(Math.max(52, Math.min(72, base * 0.15)));
  // FIRE is the primary combat control: always larger than the rest.
  const fire = Math.round(Math.max(64, Math.min(100, button * 1.35)));
  return { joystick, thumb, button, fire };
}

function useControlSizes() {
  // Synchronous first measurement: the sizes are correct from the very
  // first client render — resize only RE-measures when the viewport
  // actually changes, it is never required for the controls to appear.
  const [sizes, setSizes] = useState(computeControlSizes);
  useEffect(() => {
    const onResize = () => setSizes(computeControlSizes());
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    // Mobile URL-bar collapse / pinch zoom change the VISUAL viewport; keep
    // the touch targets sized to the real visible area.
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", onResize);
      vv.addEventListener("scroll", onResize);
    }
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      if (vv) {
        vv.removeEventListener("resize", onResize);
        vv.removeEventListener("scroll", onResize);
      }
    };
  }, []);
  return sizes;
}

const PAUSE_STATES = [
  "PAUSED",
  "PAUSE_SETTINGS",
  "PAUSE_CONTROLS",
  "PAUSE_LEAVE_CONFIRM",
  "PAUSE_SHOP",
];

export default function TouchHUD({ input, gameRef }: Props) {
  // Mirror joystick → WASD keys so player.ts:97-98 keeps working.
  const left = useMemo(() => input.bindings["left"], [input]);
  const right = useMemo(() => input.bindings["right"], [input]);
  const up = useMemo(() => input.bindings["up"], [input]);
  const down = useMemo(() => input.bindings["down"], [input]);
  const reload = useMemo(() => input.bindings["reload"], [input]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      // VirtualJoystick already zeroes its output inside its dead zone, so
      // the vec maps straight onto the movement keys (player.ts:215-216).
      const v = input.moveVec;
      if (v.x < 0) input.keysDown.add(left);
      else input.keysDown.delete(left);
      if (v.x > 0) input.keysDown.add(right);
      else input.keysDown.delete(right);
      if (v.y < 0) input.keysDown.add(up);
      else input.keysDown.delete(up);
      if (v.y > 0) input.keysDown.add(down);
      else input.keysDown.delete(down);

      // isFiring (aim-stick drag OR the FIRE button) mirrors mouseDown[0]
      // (mouseHeld) so Player.update() at player.ts:282 picks it up
      // unchanged — one shared firing surface for every input device.
      if (input.isFiring) input.mouseDown.add(0);
      else input.mouseDown.delete(0);

      void reload;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [input, left, right, up, down, reload]);

  const { joystick, thumb, button, fire } = useControlSizes();
  const safeTop = "max(16px, env(safe-area-inset-top))";
  const safeRight = "max(16px, env(safe-area-inset-right))";
  const safeBottom = "max(16px, env(safe-area-inset-bottom))";
  const safeLeft = "max(16px, env(safe-area-inset-left))";

  // Game-state gating (see header comment). The initial value is read
  // synchronously from the game (which exists by the time this mounts —
  // TouchHUD only renders after `gameReady`), and the first poll runs on
  // the same tick, so controls appear the moment the game is PLAYING
  // without waiting a frame.
  const [gameState, setGameState] = useState<string>(
    () => gameRef.current?.state ?? ""
  );
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const s = gameRef.current?.state ?? "";
      setGameState((prev) => (prev === s ? prev : s));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [gameRef]);

  const inPlay = gameState === "PLAYING";
  const showPause = inPlay || PAUSE_STATES.includes(gameState);

  // Leaving real gameplay (pause, upgrade, game over…) releases any held
  // touch state so nothing lingers into a menu. aimOverride is deliberately
  // kept — the last aim direction stays until the player aims again.
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (wasPlayingRef.current && !inPlay) {
      input.moveVec = { x: 0, y: 0 };
      input.fireHeld = false;
      input.fireButtonHeld = false;
      input.bombPressed = false;
      input.reloadPressed = false;
      for (const k of [left, right, up, down]) input.keysDown.delete(k);
    }
    wasPlayingRef.current = inPlay;
  }, [inPlay, input, left, right, up, down]);

  return (
    <div
      data-testid="touch-hud"
      style={{
        position: "absolute",
        inset: 0,
        // Above the canvas and the screen-fx chrome (z-index 5), below the
        // modal overlays (100+) — controls can never be painted under the
        // game layer.
        zIndex: 20,
        pointerEvents: "none",
        paddingBottom: safeBottom,
        paddingLeft: safeLeft,
        paddingRight: safeRight,
        paddingTop: safeTop,
        boxSizing: "border-box",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* Pause — top-right. Stays mounted while paused so it doubles as
          RESUME (its Escape keydown toggles PAUSED → PLAYING). */}
      <div
        style={{
          position: "absolute",
          top: safeTop,
          right: safeRight,
          pointerEvents: "auto",
          display: showPause ? undefined : "none",
        }}
      >
        <PauseButton input={input} size={button} />
      </div>

      {/* Left joystick — movement (bottom-left) */}
      <div
        style={{
          position: "absolute",
          bottom: safeBottom,
          left: safeLeft,
          pointerEvents: "auto",
          display: inPlay ? undefined : "none",
        }}
      >
        <VirtualJoystick
          size={joystick}
          thumbSize={thumb}
          onChange={(vec) => {
            input.moveVec = vec;
          }}
        />
      </div>

      {/* Reload — just right of the movement joystick, still under the left
          thumb. Hidden unless actively playing. */}
      <div
        style={{
          position: "absolute",
          bottom: safeBottom,
          left: `calc(${safeLeft} + ${joystick}px + 14px)`,
          pointerEvents: "auto",
          display: inPlay ? undefined : "none",
        }}
      >
        <ReloadButton input={input} gameRef={gameRef} size={button} />
      </div>

      {/* FIRE — big held-to-fire button in the very corner (right of the
          aim stick). Hidden unless actively playing. */}
      <div
        style={{
          position: "absolute",
          bottom: safeBottom,
          right: safeRight,
          pointerEvents: "auto",
          display: inPlay ? undefined : "none",
        }}
      >
        <FireButton input={input} size={fire} />
      </div>

      {/* Right joystick — aim (bottom-right, beside the FIRE button). Dragging
          past its dead zone also fires, so a single thumb can do both; the
          FIRE button is for steady holding while aiming independently. */}
      <div
        style={{
          position: "absolute",
          bottom: safeBottom,
          right: `calc(${safeRight} + ${fire}px + 12px)`,
          pointerEvents: "auto",
          display: inPlay ? undefined : "none",
        }}
      >
        <RightJoystick input={input} gameRef={gameRef} size={joystick} thumbSize={thumb} />
      </div>

      {/* Action buttons — Weapon above Bomb, just left of the right joystick
          so they never overlap it and stay reachable mid-combat. */}
      <div
        style={{
          position: "absolute",
          bottom: safeBottom,
          right: `calc(${safeRight} + ${fire}px + 12px + ${joystick}px + 14px)`,
          display: inPlay ? "flex" : "none",
          flexDirection: "column",
          gap: 12,
          alignItems: "center",
          pointerEvents: "auto",
        }}
      >
        <WeaponSwitchButton input={input} gameRef={gameRef} size={button} />
        <BombButton input={input} gameRef={gameRef} size={button} />
      </div>
    </div>
  );
}
