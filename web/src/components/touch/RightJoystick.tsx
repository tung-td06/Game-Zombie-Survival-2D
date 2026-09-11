"use client";

// Right joystick (bottom-right) — AIM + FIRE twin-stick control.
//
// Pointer Events with its own pointerId so it never steals the left
// joystick / action buttons (multitouch safe). While the stick is dragged
// beyond the dead zone it:
//   • sets input.aimDirection (normalized Vec) — the single source of truth
//     for mobile aim, read by InputManager.getAimWorld() at game-loop time
//     using the CURRENT player position, so it can never be stale.
//   • holds fire (input.fireHeld mirrors mouseHeld → the existing weapon
//     system fires exactly like a held left-click).
// Releasing stops fire but keeps the last aimDirection so the player
// keeps facing where they were aiming. No new firing system, no RAF tick —
// only the game loop RAF is responsible for reading aim.

import { useEffect, useRef } from "react";
import type { InputManager } from "@/game/input";

interface Props {
  input: InputManager;
  size?: number;
  thumbSize?: number;
  /** Dead zone as a fraction of the max stick radius (0..1). */
  deadZone?: number;
}

const RING_INSET = 10;

export default function RightJoystick({
  input,
  size = 130,
  thumbSize = 60,
  deadZone = 0.35,
}: Props) {
  const ringRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const captured = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const lastDir = useRef<{ x: number; y: number }>({ x: 1, y: 0 });

  const RADIUS = size / 2 - thumbSize / 2 - RING_INSET;

  // Initialise aimDirection once on mount so it is never null before the
  // player first touches the joystick (prevents fallback to mouse(0,0)).
  useEffect(() => {
    if (input.aimDirection === null) {
      input.aimDirection = { ...lastDir.current };
    }
  }, [input]);

  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return;

    const stop = () => {
      // Only release fire — aimDirection keeps its last value so the player
      // continues facing the last aimed direction (used by the FIRE button).
      input.fireHeld = false;
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
        // Normalise and write directly — no RAF, no world-space computation.
        // InputManager.getAimWorld() computes the world point from the
        // CURRENT player position at game-loop time, so this direction
        // vector is the only thing we need to store.
        const nx = dx / len;
        const ny = dy / len;
        lastDir.current = { x: nx, y: ny };
        input.aimDirection = { x: nx, y: ny };
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
      // Keep aimDirection at its last value so the weapon keeps pointing
      // in the last aimed direction when the FIRE button is used.
      stop();
    };

    ring.addEventListener("pointerdown", onDown);
    ring.addEventListener("pointermove", onMove);
    ring.addEventListener("pointerup", onUp);
    ring.addEventListener("pointercancel", onUp);
    return () => {
      ring.removeEventListener("pointerdown", onDown);
      ring.removeEventListener("pointermove", onMove);
      ring.removeEventListener("pointerup", onUp);
      ring.removeEventListener("pointercancel", onUp);
      stop();
    };
  }, [input, RADIUS, deadZone]);

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