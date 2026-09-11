"use client";

// Right joystick (bottom-right) — AIM + FIRE twin-stick control.
//
// Pointer Events with its own pointerId so it never steals the left
// joystick / action buttons (multitouch safe). While the stick is dragged
// beyond the dead zone it:
//   • sets the aim direction (world-space point via InputManager.aimOverride,
//     which getAimWorld() already consumes in the game core), and
//   • holds fire (input.fireHeld mirrors mouseHeld → the existing weapon
//     system fires exactly like a held left-click).
// Releasing stops fire but keeps the last aim direction, so the player
// keeps facing where they were aiming. No new firing system is created —
// this is only an input device feeding the existing surface.

import { useEffect, useRef } from "react";
import type { InputManager } from "@/game/input";
import type { Game } from "@/game/game";
import type { RefObject } from "react";

interface Props {
  input: InputManager;
  gameRef: RefObject<Game | null>;
  size?: number;
  thumbSize?: number;
  /** Dead zone as a fraction of the max stick radius (0..1). */
  deadZone?: number;
}

const RING_INSET = 10;

export default function RightJoystick({
  input,
  gameRef,
  size = 130,
  thumbSize = 60,
  deadZone = 0.35,
}: Props) {
  const ringRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const captured = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const lastDir = useRef<{ x: number; y: number }>({ x: 1, y: 0 });
  const rafId = useRef<number>(0);
  const active = useRef(false);

  const RADIUS = size / 2 - thumbSize / 2 - RING_INSET;

  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return;

    const stop = () => {
      // Only release fire — the persistent aimOverride tick keeps running so
      // the last aimed direction is preserved for the FIRE button to consume.
      active.current = false;
      input.fireHeld = false;
    };

    // Writes the aim override every frame (persistent, mount → unmount).
    // aimOverride is ALWAYS kept fresh so the FIRE button always reads the
    // correct direction — no null fallback, no stale world-space position.
    const tick = () => {
      const game = gameRef.current;
      if (game?.player) {
        input.aimOverride = {
          x: game.player.pos.x + lastDir.current.x * 1000,
          y: game.player.pos.y + lastDir.current.y * 1000,
        };
      }
      rafId.current = requestAnimationFrame(tick);
    };

    const setStick = (dx: number, dy: number) => {
      const len = Math.hypot(dx, dy);
      const k = len > RADIUS ? RADIUS / len : 1;
      const tx = dx * k;
      const ty = dy * k;
      if (thumbRef.current) {
        thumbRef.current.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`;
      }
      if (len > deadZone * RADIUS) {
        lastDir.current = { x: dx / (len || 1), y: dy / (len || 1) };
        if (!input.fireHeld) input.fireHeld = true;
      } else if (input.fireHeld) {
        input.fireHeld = false;
      }
    };

    const onDown = (e: PointerEvent) => {
      if (captured.current !== null) return;
      captured.current = e.pointerId;
      const rect = ring.getBoundingClientRect();
      origin.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      try {
        ring.setPointerCapture(e.pointerId);
      } catch {
        // some browsers throw if pointer is no longer down
      }
      ring.style.setProperty("--joy-active", "1");
      active.current = true;
      setStick(e.clientX - origin.current.x, e.clientY - origin.current.y);
    };

    const onMove = (e: PointerEvent) => {
      if (captured.current !== e.pointerId || !origin.current) return;
      e.preventDefault();
      setStick(e.clientX - origin.current.x, e.clientY - origin.current.y);
    };

    const onUp = (e: PointerEvent) => {
      if (captured.current !== e.pointerId) return;
      captured.current = null;
      origin.current = null;
      try {
        ring.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      ring.style.setProperty("--joy-active", "0");
      if (thumbRef.current) {
        thumbRef.current.style.transform = "translate(-50%, -50%)";
      }
      stop();
    };

    ring.addEventListener("pointerdown", onDown);
    ring.addEventListener("pointermove", onMove);
    ring.addEventListener("pointerup", onUp);
    ring.addEventListener("pointercancel", onUp);
    // Start the persistent aim tick immediately so aimOverride is valid
    // before any joystick interaction (prevents null → top-left default).
    rafId.current = requestAnimationFrame(tick);
    return () => {
      ring.removeEventListener("pointerdown", onDown);
      ring.removeEventListener("pointermove", onMove);
      ring.removeEventListener("pointerup", onUp);
      ring.removeEventListener("pointercancel", onUp);
      cancelAnimationFrame(rafId.current);
      stop();
    };
  }, [input, gameRef, RADIUS, deadZone]);

  return (
    <div
      ref={ringRef}
      data-testid="right-joystick"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "rgba(90,180,255,0.12)",
        border: "2px solid rgba(90,180,255,0.45)",
        position: "relative",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTapHighlightColor: "transparent",
        cursor: "pointer",
      }}
    >
      <div
        ref={thumbRef}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: thumbSize,
          height: thumbSize,
          borderRadius: "50%",
          background: "rgba(90,180,255,0.8)",
          border: "2px solid rgba(0,0,0,0.4)",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}