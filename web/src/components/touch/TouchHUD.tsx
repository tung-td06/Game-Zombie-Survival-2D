"use client";

// TouchHUD composes the mobile controls and wires them into the existing
// InputManager — no game-core changes. Twin-stick layout:
//
//   • LEFT row     → JOYSTICK (move) · WEAPON (cycle) · RELOAD
//   • RIGHT column → BOMB above FIRE · AIM stick · FIRE (corner)
//   • PAUSE        → top-right, inside the reserved pause gutter
//
// EVERY position comes from the shared zone geometry in @/game/hudLayout —
// the same module the canvas HUD (ui.ts) uses — so a control can never
// overlap a canvas HUD panel (HP, wave, score, minimap) or the bottom
// ammo/time strip by construction, at any viewport size. Safe-area insets
// are applied by the zones (notches, gesture bars, rounded corners).
//
// Controls only react during real gameplay: joystick / aim / fire / weapon
// / bomb / reload are hidden whenever the game is not PLAYING (pause menus,
// upgrade picks, game over, boot). They stay MOUNTED (display:none), which
// preserves the last aim direction and joystick state across a pause —
// returning to the game never auto-fires or auto-moves. The PAUSE button
// stays available while paused so the player can resume.

import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { InputManager } from "@/game/input";
import type { Game } from "@/game/game";
import {
  computeControlSizes,
  hudZones,
  type SafeInsets,
} from "@/game/hudLayout";
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

function readInsets(): SafeInsets {
  if (typeof window === "undefined") {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const cs = getComputedStyle(document.documentElement);
  const px = (name: string): number => {
    const v = cs.getPropertyValue(name).trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    top: px("--zs-sat"),
    right: px("--zs-sar"),
    bottom: px("--zs-sab"),
    left: px("--zs-sal"),
  };
}

function viewport(): { w: number; h: number } {
  if (typeof window === "undefined") {
    return { w: 0, h: 0 };
  }
  // Visual viewport tracks the mobile URL-bar collapse and pinch zoom;
  // fall back to the layout viewport for older browsers.
  return {
    w: window.visualViewport?.width ?? window.innerWidth,
    h: window.visualViewport?.height ?? window.innerHeight,
  };
}

function useLayout() {
  const [layout, setLayout] = useState(() => {
    const { w, h } = viewport();
    return { w, h, zones: hudZones(w, h, readInsets()), sizes: computeControlSizes(w, h) };
  });
  useEffect(() => {
    const recompute = () => {
      const { w, h } = viewport();
      setLayout({ w, h, zones: hudZones(w, h, readInsets()), sizes: computeControlSizes(w, h) });
    };
    window.addEventListener("resize", recompute);
    window.addEventListener("orientationchange", recompute);
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", recompute);
      vv.addEventListener("scroll", recompute);
    }
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("orientationchange", recompute);
      if (vv) {
        vv.removeEventListener("resize", recompute);
        vv.removeEventListener("scroll", recompute);
      }
    };
  }, []);
  return layout;
}

const PAUSE_STATES = [
  "PAUSED",
  "PAUSE_SETTINGS",
  "PAUSE_CONTROLS",
  "PAUSE_LEAVE_CONFIRM",
  "PAUSE_SHOP",
];

export default function TouchHUD({ input, gameRef }: Props) {
  const { zones, sizes } = useLayout();
  const c = zones.controls;

  // Mirror joystick → WASD keys so player.ts:215-216 keeps working.
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
    tick();
    return () => cancelAnimationFrame(raf);
  }, [input, left, right, up, down, reload]);

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
        boxSizing: "border-box",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* Pause — top-right, inside the reserved pause gutter so it can never
          cover the canvas SCORE/MONEY panel or minimap. Stays mounted while
          paused so it doubles as RESUME (its Escape keydown toggles
          PAUSED → PLAYING). */}
      <div
        style={{
          position: "absolute",
          left: c.pause.x,
          top: c.pause.y,
          pointerEvents: "auto",
          display: showPause ? undefined : "none",
        }}
      >
        <PauseButton input={input} size={c.pause.w} />
      </div>

      {/* LEFT ZONE — joystick (move), then WEAPON and RELOAD in a row. */}
      <div
        style={{
          position: "absolute",
          left: c.joystick.x,
          top: c.joystick.y,
          pointerEvents: "auto",
          display: inPlay ? undefined : "none",
        }}
      >
        <VirtualJoystick
          size={c.joystick.w}
          thumbSize={sizes.thumb}
          onChange={(vec) => {
            input.moveVec = vec;
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: c.weapon.x,
          top: c.weapon.y,
          pointerEvents: "auto",
          display: inPlay ? undefined : "none",
        }}
      >
        <WeaponSwitchButton input={input} gameRef={gameRef} size={c.weapon.w} />
      </div>
      <div
        style={{
          position: "absolute",
          left: c.reload.x,
          top: c.reload.y,
          pointerEvents: "auto",
          display: inPlay ? undefined : "none",
        }}
      >
        <ReloadButton input={input} gameRef={gameRef} size={c.reload.w} />
      </div>

      {/* RIGHT ZONE — BOMB above FIRE at the corner, AIM left of FIRE. */}
      <div
        style={{
          position: "absolute",
          left: c.bomb.x,
          top: c.bomb.y,
          pointerEvents: "auto",
          display: inPlay ? undefined : "none",
        }}
      >
        <BombButton input={input} gameRef={gameRef} size={c.bomb.w} />
      </div>
      <div
        style={{
          position: "absolute",
          left: c.fire.x,
          top: c.fire.y,
          pointerEvents: "auto",
          display: inPlay ? undefined : "none",
        }}
      >
        <FireButton input={input} size={c.fire.w} />
      </div>
      <div
        style={{
          position: "absolute",
          left: c.aim.x,
          top: c.aim.y,
          pointerEvents: "auto",
          display: inPlay ? undefined : "none",
        }}
      >
        <RightJoystick
          input={input}
          gameRef={gameRef}
          size={c.aim.w}
          thumbSize={sizes.thumb}
        />
      </div>
    </div>
  );
}