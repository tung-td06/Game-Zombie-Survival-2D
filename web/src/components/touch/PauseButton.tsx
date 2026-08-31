"use client";

// Pause button (top-right). Fires the Escape action (same as the
// desktop binding) so game-core pause handling picks it up with no
// changes.

import type { InputManager } from "@/game/input";

interface Props {
  input: InputManager;
}

export default function PauseButton({ input }: Props) {
  return (
    <button
      type="button"
      data-testid="pause-button"
      onClick={() => {
        const key = input.bindings["pause"];
        if (key) {
          input.keysPressed.add(key);
          input.keysDown.add(key);
        }
      }}
      style={{
        width: 56,
        height: 44,
        background: "rgba(0,0,0,0.55)",
        border: "2px solid rgba(255,255,255,0.4)",
        borderRadius: 8,
        color: "#EBEBE1",
        fontFamily: "ui-monospace, monospace",
        fontSize: 14,
        fontWeight: 700,
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      ‖
    </button>
  );
}