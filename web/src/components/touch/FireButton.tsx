"use client";

// Fire button (bottom-right, outer corner beside the aim joystick).
// A LARGE held-to-fire control: pointerdown raises input.fireButtonHeld for
// as long as the finger stays down, pointerup / pointercancel release it.
// The touch HUD ORs this with the aim stick's drag-fire into input.mouseDown,
// so the existing weapon system fires exactly like a held left-click — no
// new firing logic. Pointer capture keeps the hold alive if the thumb
// slides off the button mid-press.

import { useEffect, useRef } from "react";
import type { InputManager } from "@/game/input";

interface Props {
  input: InputManager;
  size?: number;
}

export default function FireButton({ input, size = 80 }: Props) {
  const ref = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const btn = ref.current;
    if (!btn) return;

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        // some browsers throw if pointer is no longer down
      }
      input.fireButtonHeld = true;
      btn.style.setProperty("--fire-active", "1");
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== undefined) {
        try {
          btn.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
      input.fireButtonHeld = false;
      btn.style.setProperty("--fire-active", "0");
    };

    btn.addEventListener("pointerdown", onDown);
    btn.addEventListener("pointerup", onUp);
    btn.addEventListener("pointercancel", onUp);
    return () => {
      btn.removeEventListener("pointerdown", onDown);
      btn.removeEventListener("pointerup", onUp);
      btn.removeEventListener("pointercancel", onUp);
      input.fireButtonHeld = false;
    };
  }, [input]);

  return (
    <button
      ref={ref}
      type="button"
      data-testid="fire-button"
      aria-label="Fire"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background:
          "radial-gradient(circle at 35% 30%, rgba(255,120,110,0.95), rgba(190,40,35,0.9))",
        border: "3px solid rgba(255,220,210,0.65)",
        boxShadow: "0 4px 14px rgba(0,0,0,0.45), inset 0 0 12px rgba(255,255,255,0.12)",
        color: "#fff",
        fontFamily: "ui-monospace, monospace",
        fontSize: Math.max(15, Math.round(size * 0.22)),
        fontWeight: 800,
        letterSpacing: 1,
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textTransform: "uppercase",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTapHighlightColor: "transparent",
        cursor: "pointer",
        opacity: 0.92,
      }}
    >
      FIRE
    </button>
  );
}