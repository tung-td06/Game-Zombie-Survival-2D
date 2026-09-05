"use client";

// TouchHUD composes the mobile controls and wires them into the
// InputManager. Uses the same key codes as desktop bindings so
// Player.update() sees identical state — no game-core changes.

import type { RefObject } from "react";
import { useEffect, useMemo } from "react";
import type { InputManager } from "@/game/input";
import type { Game } from "@/game/game";
import VirtualJoystick from "./VirtualJoystick";
import FireButton from "./FireButton";
import BombButton from "./BombButton";
import WeaponSwitcher from "./WeaponSwitcher";
import PauseButton from "./PauseButton";

interface Props {
  input: InputManager;
  gameRef: RefObject<Game | null>;
}

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
      const v = input.moveVec;
      const dead = 0.15;
      const fx = Math.abs(v.x) > dead ? v.x : 0;
      const fy = Math.abs(v.y) > dead ? v.y : 0;
      if (fx < 0) input.keysDown.add(left);
      else input.keysDown.delete(left);
      if (fx > 0) input.keysDown.add(right);
      else input.keysDown.delete(right);
      if (fy < 0) input.keysDown.add(up);
      else input.keysDown.delete(up);
      if (fy > 0) input.keysDown.add(down);
      else input.keysDown.delete(down);

      // fireHeld mirrors mouseDown[0] (mouseHeld) so Player.update()
      // at player.ts:149 picks it up unchanged.
      if (input.fireHeld) input.mouseDown.add(0);
      else input.mouseDown.delete(0);

      // Tap fire button area + hold reload to reload (auto when empty
      // is already handled; no extra wiring needed).
      void reload;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [input, left, right, up, down, reload]);

  return (
    <div
      data-testid="touch-hud"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        paddingLeft: "max(16px, env(safe-area-inset-left))",
        paddingRight: "max(16px, env(safe-area-inset-right))",
        paddingTop: "max(16px, env(safe-area-inset-top))",
        boxSizing: "border-box",
      }}
    >
      {/* Top row: pause (right), weapon switcher (center) */}
      <div
        style={{
          position: "absolute",
          top: "max(16px, env(safe-area-inset-top))",
          right: "max(16px, env(safe-area-inset-right))",
          pointerEvents: "auto",
        }}
      >
        <PauseButton input={input} />
      </div>
      <div
        style={{
          position: "absolute",
          top: "max(16px, env(safe-area-inset-top))",
          left: "50%",
          transform: "translateX(-50%)",
          pointerEvents: "auto",
        }}
      >
        <WeaponSwitcher input={input} />
      </div>

      {/* Bottom row: joystick (left), fire (right) */}
      <div
        style={{
          position: "absolute",
          bottom: "max(16px, env(safe-area-inset-bottom))",
          left: "max(16px, env(safe-area-inset-left))",
          pointerEvents: "auto",
        }}
      >
        <VirtualJoystick
          onChange={(vec) => {
            input.moveVec = vec;
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: "max(16px, env(safe-area-inset-bottom))",
          right: "max(16px, env(safe-area-inset-right))",
          pointerEvents: "auto",
        }}
      >
        <FireButton input={input} gameRef={gameRef} />
      </div>
      {/* Bomb sits above FIRE so a thumb reaches both without overlap. */}
      <div
        style={{
          position: "absolute",
          bottom: "calc(max(16px, env(safe-area-inset-bottom)) + 124px)",
          right: "max(16px, env(safe-area-inset-right))",
          pointerEvents: "auto",
        }}
      >
        <BombButton input={input} gameRef={gameRef} />
      </div>
    </div>
  );
}