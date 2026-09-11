"use client";

// Virtual joystick (bottom-left). Tracks ONE pointerId at a time via
// Pointer Events so multi-touch with the fire button works: a second
// finger on a different element keeps this one's captured touch alive.
//
// FIX — unstable onChange dep:
//   The previous version listed `onChange` (an inline arrow function in
//   TouchHUD) in the useEffect dependency array. Since TouchHUD re-renders
//   on every visualViewport scroll/resize event (URL-bar animation fires
//   many times per second), the effect was tearing down and re-adding
//   event listeners continuously, creating brief gaps where pointermove
//   events were missed and causing movement stutters.
//
//   Fix: store onChange + RADIUS in refs updated on every render and read
//   them from inside the effect at call time. The effect now only runs
//   once on mount (deadZone never changes at runtime), eliminating all
//   listener churn.

import { useEffect, useRef } from "react";
import type { Vec } from "@/game/vec";

interface Props {
  onChange: (vec: Vec) => void;
  size?: number;
  thumbSize?: number;
  /** Dead zone as a fraction of the max stick radius (0..1). Inside it the
      output is (0,0) so a resting thumb never nudges the player. */
  deadZone?: number;
}

const RING_INSET = 12;

export default function VirtualJoystick({
  onChange,
  size = 130,
  thumbSize = 60,
  deadZone = 0.15,
}: Props) {
  const ringRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const captured = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  // Keep the latest callback and derived RADIUS in refs so the effect
  // never needs to re-run when these values change between renders.
  // The effect reads the ref at call time, so it always sees the
  // current value without being listed as a dependency.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const RADIUS = size / 2 - thumbSize / 2 - RING_INSET;
  const radiusRef = useRef(RADIUS);
  radiusRef.current = RADIUS;

  const deadZoneRef = useRef(deadZone);
  deadZoneRef.current = deadZone;

  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return;

    const recenter = () => {
      if (thumbRef.current) {
        thumbRef.current.style.transform = "translate(-50%, -50%)";
      }
      onChangeRef.current({ x: 0, y: 0 });
    };

    const updateThumb = (cx: number, cy: number) => {
      const R = radiusRef.current;
      const DEAD = deadZoneRef.current;
      const dx = cx;
      const dy = cy;
      const len = Math.sqrt(dx * dx + dy * dy);
      const k = len > R ? R / len : 1;
      const tx = dx * k;
      const ty = dy * k;
      if (thumbRef.current) {
        thumbRef.current.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`;
      }
      const nx = tx / R;
      const ny = ty / R;
      if (len > DEAD * R) {
        onChangeRef.current({ x: nx, y: ny });
      } else {
        onChangeRef.current({ x: 0, y: 0 });
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
      ring.style.setProperty("--joystick-active", "1");
      updateThumb(e.clientX - origin.current.x, e.clientY - origin.current.y);
    };

    const onMove = (e: PointerEvent) => {
      if (captured.current !== e.pointerId || !origin.current) return;
      e.preventDefault();
      updateThumb(e.clientX - origin.current.x, e.clientY - origin.current.y);
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
      ring.style.setProperty("--joystick-active", "0");
      recenter();
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
    };
    // Empty dep array: onChange, RADIUS, and deadZone are all stored in
    // refs (updated on every render) and read at call time — they must NOT
    // be deps or the effect would re-run on every TouchHUD re-render (which
    // happens on every visualViewport scroll during URL-bar animation).
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={ringRef}
      data-testid="virtual-joystick"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.10)",
        border: "2px solid rgba(255,255,255,0.35)",
        position: "relative",
        touchAction: "none",
        userSelect: "none",
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
          background: "rgba(255,200,80,0.85)",
          border: "2px solid rgba(0,0,0,0.4)",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}