"use client";

// Bomb button (bottom-right, above FIRE). A tap raises input.bombPressed
// for one frame — the same one-shot surface Player.update() reads for the
// desktop F key. Shows the carried count so the pouch is readable on mobile.

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { InputManager } from "@/game/input";
import type { Game } from "@/game/game";

interface Props {
  input: InputManager;
  gameRef: RefObject<Game | null>;
  size?: number;
}

export default function BombButton({ input, gameRef, size = 68 }: Props) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [bombs, setBombs] = useState(0);

  useEffect(() => {
    const btn = ref.current;
    if (!btn) return;

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      input.bombPressed = true;
    };
    btn.addEventListener("pointerdown", onDown);
    return () => btn.removeEventListener("pointerdown", onDown);
  }, [input]);

  // Poll the carried count so the label tracks throws and pickups.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = gameRef.current?.player;
      if (p) setBombs(p.bombs);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [gameRef]);

  const empty = bombs <= 0;
  return (
    <button
      ref={ref}
      type="button"
      data-testid="bomb-button"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: empty ? "rgba(70,70,80,0.6)" : "rgba(90,130,60,0.85)",
        border: "3px solid rgba(0,0,0,0.5)",
        color: empty ? "#9A9AA2" : "#fff",
        fontFamily: "ui-monospace, monospace",
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 1.3,
        touchAction: "none",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
        cursor: "pointer",
      }}
    >
      BOMB
      <br />
      {bombs}
    </button>
  );
}
