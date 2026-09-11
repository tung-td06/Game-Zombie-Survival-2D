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
//
// ROOT-CAUSE FIX (stale origin):
//   The previous version cached the ring center in `origin.current` at
//   onDown time and reused it throughout the gesture. Any layout change
//   while the gesture was active (mobile URL-bar collapse, safe-area
//   update, orientation) moved the ring on screen but left origin stale,
//   making subsequent onMove calls compute the wrong aim vector — causing
//   the gun to snap to a completely different direction (often top-left).
//
//   Fix: every onMove call reads the CURRENT ring center directly from
//   getBoundingClientRect() so the computed dx/dy is always relative to
//   where the ring actually is on screen right now, regardless of layout
//   changes that occurred after the gesture started.

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
  const lastDir = useRef<{ x: number; y: number }>({ x: 1, y: 0 });
  // Store RADIUS in a ref so the pointer-event effect does not need it as a
  // dependency. Without this, any resize that changes `size` would cause the
  // effect to re-run: the cleanup would call stop(), release pointer capture,
  // and drop the active aim — exactly one of the bug's triggers.
  const radiusRef = useRef(size / 2 - thumbSize / 2 - RING_INSET);
  radiusRef.current = size / 2 - thumbSize / 2 - RING_INSET;
  // Store deadZone in a ref for the same reason.
  const deadZoneRef = useRef(deadZone);
  deadZoneRef.current = deadZone;

  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return;

    const stop = () => {
      // Only release fire — aimDirection keeps its last value so the player
      // continues facing the last aimed direction (used by the FIRE button).
      input.fireHeld = false;
    };

    const setStick = (dx: number, dy: number) => {
      const RADIUS = radiusRef.current;
      const DEAD = deadZoneRef.current;
      const len = Math.hypot(dx, dy);
      const k = len > RADIUS ? RADIUS / len : 1;
      const tx = dx * k;
      const ty = dy * k;
      if (thumbRef.current) {
        thumbRef.current.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`;
      }
      // Zero-length guard: don't update aim when stick is at dead centre.
      if (len < 0.001) return;
      if (len > DEAD * RADIUS) {
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
      try {
        ring.setPointerCapture(e.pointerId);
      } catch {
        // some browsers throw if pointer is no longer down
      }
      ring.style.setProperty("--joy-active", "1");
      // Compute ring center at touch-start time.
      const rect = ring.getBoundingClientRect();
      setStick(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
    };

    const onMove = (e: PointerEvent) => {
      if (captured.current !== e.pointerId) return;
      e.preventDefault();
      // Always read the CURRENT ring center from getBoundingClientRect().
      // This is the root-cause fix: if the layout changed since onDown
      // (URL-bar collapse, safe-area update, orientation change), the ring
      // will have moved on screen. Using a cached origin from onDown would
      // compute the aim vector relative to the OLD position and snap the gun
      // to a wrong direction. Reading the rect fresh every move ensures the
      // aim vector always reflects where the finger is relative to the ring
      // as it appears RIGHT NOW.
      const rect = ring.getBoundingClientRect();
      setStick(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
    };

    const onUp = (e: PointerEvent) => {
      if (captured.current !== e.pointerId) return;
      captured.current = null;
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
    // IMPORTANT: radiusRef, deadZoneRef are intentionally NOT listed as
    // dependencies — they are refs (mutable, no re-run needed). `input` is
    // the only real dependency: the game creates exactly one InputManager
    // for its lifetime, so this effect effectively runs once on mount.
  }, [input]); // eslint-disable-line react-hooks/exhaustive-deps

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