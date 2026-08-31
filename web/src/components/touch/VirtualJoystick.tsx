"use client";

// Virtual joystick (bottom-left). Tracks ONE pointerId at a time via
// Pointer Events so multi-touch with the fire button works: a second
// finger on a different element keeps this one's captured touch alive.

import { useEffect, useRef } from "react";
import type { Vec } from "@/game/vec";

interface Props {
  onChange: (vec: Vec) => void;
  size?: number;
  thumbSize?: number;
}

const RING_INSET = 12;

export default function VirtualJoystick({
  onChange,
  size = 130,
  thumbSize = 60,
}: Props) {
  const ringRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const captured = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const RADIUS = size / 2 - thumbSize / 2 - RING_INSET;

  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return;

    const recenter = () => {
      if (thumbRef.current) {
        thumbRef.current.style.transform = "translate(-50%, -50%)";
      }
      onChange({ x: 0, y: 0 });
    };

    const updateThumb = (cx: number, cy: number) => {
      const dx = cx;
      const dy = cy;
      const len = Math.sqrt(dx * dx + dy * dy);
      const k = len > RADIUS ? RADIUS / len : 1;
      const tx = dx * k;
      const ty = dy * k;
      if (thumbRef.current) {
        thumbRef.current.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`;
      }
      onChange({ x: tx / RADIUS, y: ty / RADIUS });
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
  }, [onChange, RADIUS]);

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