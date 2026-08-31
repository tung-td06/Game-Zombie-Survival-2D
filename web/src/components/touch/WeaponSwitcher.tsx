"use client";

// Weapon switcher — 5 round buttons in a row, top-centre. Tap to
// trigger the same Digit1..Digit5 keys the desktop bindings use, so
// Player.update() reads them via isPressed("weaponN") without changes.

import type { InputManager } from "@/game/input";

interface Props {
  input: InputManager;
}

const KEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"] as const;
const ACTIONS = ["weapon1", "weapon2", "weapon3", "weapon4", "weapon5"] as const;

export default function WeaponSwitcher({ input }: Props) {
  return (
    <div
      data-testid="weapon-switcher"
      style={{
        display: "flex",
        gap: 8,
        padding: 6,
        background: "rgba(0,0,0,0.45)",
        borderRadius: 10,
        touchAction: "manipulation",
      }}
    >
      {ACTIONS.map((action, i) => (
        <button
          key={action}
          type="button"
          data-testid={`weapon-${i + 1}`}
          onClick={() => {
            const key = input.bindings[action] ?? KEYS[i];
            input.keysPressed.add(key);
            input.keysDown.add(key);
          }}
          style={{
            width: 38,
            height: 38,
            borderRadius: 8,
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.35)",
            color: "#EBEBE1",
            fontFamily: "ui-monospace, monospace",
            fontSize: 16,
            fontWeight: 700,
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}