"use client";

// Pause button (top-right). Dispatches a real Escape keydown event — the
// exact path the desktop binding uses (game-core handleEvent listens for the
// keydown, not for keysPressed), so the existing pause manager opens with no
// duplicate pause logic.

import type { InputManager } from "@/game/input";

interface Props {
  input: InputManager;
  size?: number;
}

export default function PauseButton({ input, size = 44 }: Props) {
  return (
    <button
      type="button"
      data-testid="pause-button"
      onClick={() => {
        const key = input.bindings["pause"] ?? "Escape";
        if (key.startsWith("Mouse")) return;
        // game-core Escape handling lives in the window keydown listener
        // (Game.handleEvent), so deliver a real KeyboardEvent.
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            code: key,
            key: key === "Escape" ? "Escape" : key,
            bubbles: true,
          }),
        );
      }}
      style={{
        // The size IS the full hit target — the zone reserves exactly this
        // square (hudLayout pause rect), so rendering anything wider here
        // would stick past the reserved gutter and off the right edge.
        width: size,
        height: size,
        background: "rgba(0,0,0,0.55)",
        border: "2px solid rgba(255,255,255,0.4)",
        borderRadius: 8,
        color: "#EBEBE1",
        fontFamily: "ui-monospace, monospace",
        fontSize: Math.max(14, Math.round(size * 0.34)),
        fontWeight: 700,
        lineHeight: 1,
        touchAction: "manipulation",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTapHighlightColor: "transparent",
        cursor: "pointer",
      }}
    >
      ‖
    </button>
  );
}