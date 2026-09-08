"use client";

// Single WEAPON button — cycles to the next owned/unlocked weapon.
// Fires the same `next_weapon` action the desktop MouseMiddle binding uses,
// so WeaponManager.cycle() handles the switch and enforces ownership: only
// weapons the player actually owns are iterated, and the shop/unlock system
// is never bypassed. Shows the currently equipped weapon name.

import { useEffect, useRef, useState } from "react";
import type { InputManager } from "@/game/input";
import type { Game } from "@/game/game";
import type { RefObject } from "react";

interface Props {
  input: InputManager;
  gameRef: RefObject<Game | null>;
  size?: number;
}

export default function WeaponSwitchButton({ input, gameRef, size = 64 }: Props) {
  const [weaponName, setWeaponName] = useState("PISTOL");

  // Poll the equipped weapon name (same pattern as BombButton's counter) so
  // the label tracks switching. State only changes when the name changes.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const w = gameRef.current?.player?.weapons.current;
      if (w && w.name !== weaponName) setWeaponName(w.name);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [gameRef, weaponName]);

  return (
    <button
      type="button"
      data-testid="weapon-switch-button"
      onClick={() => {
        const key = input.bindings["next_weapon"];
        if (key) {
          input.keysPressed.add(key);
          input.keysDown.add(key);
        }
      }}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "rgba(255,200,80,0.22)",
        border: "2px solid rgba(255,200,80,0.6)",
        color: "#FFC850",
        fontFamily: "ui-monospace, monospace",
        fontSize: Math.max(10, Math.round(size * 0.18)),
        fontWeight: 700,
        lineHeight: 1.2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        touchAction: "manipulation",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTapHighlightColor: "transparent",
        cursor: "pointer",
        textTransform: "uppercase",
      }}
    >
      WEAPON
      <br />
      {weaponName}
    </button>
  );
}