"use client";

// Reload button (bottom-left, beside the movement joystick). A tap raises
// input.reloadPressed for one frame — the same one-shot surface Player.update()
// reads for the desktop R key. The button only arms when a reload is actually
// possible (magazine partially empty AND reserve ammo available AND not already
// reloading); Weapon.startReload() enforces those same guards as the final
// authority, so nothing can reload a full magazine or with no reserve.

import { useEffect, useRef, useState } from "react";
import type { InputManager } from "@/game/input";
import type { Game } from "@/game/game";
import type { RefObject } from "react";

interface Props {
  input: InputManager;
  gameRef: RefObject<Game | null>;
  size?: number;
}

export default function ReloadButton({ input, gameRef, size = 60 }: Props) {
  const ref = useRef<HTMLButtonElement | null>(null);
  // Mirrored weapon state read by the pointer handler without re-subscribing.
  const armedRef = useRef(false);
  const [armed, setArmed] = useState(false);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    const btn = ref.current;
    if (!btn) return;

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      if (!armedRef.current) return;
      input.reloadPressed = true;
    };
    btn.addEventListener("pointerdown", onDown);
    return () => btn.removeEventListener("pointerdown", onDown);
  }, [input]);

  // Poll the equipped weapon so the armed state tracks fire/reload/pickups.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const w = gameRef.current?.player?.weapons.current;
      if (w) {
        const can = !w.reloading && w.ammo < w.magazineSize && w.reserve > 0;
        armedRef.current = can;
        setArmed((prev) => (prev === can ? prev : can));
        setReloading((prev) => (prev === w.reloading ? prev : w.reloading));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [gameRef]);

  const inactive = !armed || reloading;
  return (
    <button
      ref={ref}
      type="button"
      data-testid="reload-button"
      aria-label="Reload"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: inactive ? "rgba(70,70,80,0.6)" : "rgba(120,150,220,0.8)",
        border: inactive
          ? "3px solid rgba(255,255,255,0.18)"
          : "3px solid rgba(200,220,255,0.7)",
        color: inactive ? "#9A9AA2" : "#fff",
        fontFamily: "ui-monospace, monospace",
        fontSize: Math.max(8, Math.round(size * 0.13)),
        fontWeight: 700,
        lineHeight: 1.25,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTapHighlightColor: "transparent",
        cursor: "pointer",
        opacity: inactive ? 0.55 : 1,
      }}
    >
      <span style={{ fontSize: Math.max(14, Math.round(size * 0.32)), lineHeight: 1 }}>
        ↻
      </span>
      RELOAD
    </button>
  );
}
