"use client";

// Fire button (bottom-right). Press-and-hold sets input.fireHeld and
// asks touchAim for an aim direction. Each button instance owns its
// pointerId so multi-touch with the joystick is safe.

import { useEffect, useRef } from "react";
import type { InputManager } from "@/game/input";
import { getAutoAimDirection, type AimTarget } from "@/game/touchAim";
import type { Game } from "@/game/game";
import type { RefObject } from "react";

interface Props {
  input: InputManager;
  gameRef: RefObject<Game | null>;
  size?: number;
}

export default function FireButton({ input, gameRef, size = 110 }: Props) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const captured = useRef<number | null>(null);
  const rafId = useRef<number>(0);
  const lastDir = useRef<{ x: number; y: number }>({ x: 1, y: 0 });

  useEffect(() => {
    const btn = ref.current;
    if (!btn) return;

    const tick = () => {
      const game = gameRef.current;
      if (game && game.player) {
        const targets: AimTarget[] = [];
        for (const z of game.zombies) {
          if (z.hp <= 0) continue;
          // Heuristic priority: a zombie that recently damaged the
          // player is "attacking". Without a direct flag on Zombie,
          // use proximity bias: anything within a small radius gets
          // priority 1; otherwise 0. Keeps the resolver simple while
          // preferring close-range threats.
          const dx = z.pos.x - game.player.pos.x;
          const dy = z.pos.y - game.player.pos.y;
          const d2 = dx * dx + dy * dy;
          const priority = d2 < 220 * 220 ? 1 : 0;
          targets.push({ pos: z.pos, priority });
        }
        const dir = getAutoAimDirection(game.player.pos, targets);
        if (dir) {
          input.aimOverride = {
            x: game.player.pos.x + dir.x * 1000,
            y: game.player.pos.y + dir.y * 1000,
          };
          lastDir.current = dir;
        } else {
          // No target: aim in last known joystick direction (or +x).
          input.aimOverride = {
            x: game.player.pos.x + lastDir.current.x * 1000,
            y: game.player.pos.y + lastDir.current.y * 1000,
          };
        }
      }
      rafId.current = requestAnimationFrame(tick);
    };

    const startFire = () => {
      input.fireHeld = true;
      rafId.current = requestAnimationFrame(tick);
    };

    const stopFire = () => {
      input.fireHeld = false;
      input.aimOverride = null;
      cancelAnimationFrame(rafId.current);
    };

    const onDown = (e: PointerEvent) => {
      if (captured.current !== null) return;
      captured.current = e.pointerId;
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      e.preventDefault();
      startFire();
    };

    const onUp = (e: PointerEvent) => {
      if (captured.current !== e.pointerId) return;
      captured.current = null;
      try {
        btn.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      stopFire();
    };

    btn.addEventListener("pointerdown", onDown);
    btn.addEventListener("pointerup", onUp);
    btn.addEventListener("pointercancel", onUp);
    btn.addEventListener("pointerleave", onUp);
    return () => {
      btn.removeEventListener("pointerdown", onDown);
      btn.removeEventListener("pointerup", onUp);
      btn.removeEventListener("pointercancel", onUp);
      btn.removeEventListener("pointerleave", onUp);
      cancelAnimationFrame(rafId.current);
    };
  }, [input, gameRef]);

  return (
    <button
      ref={ref}
      type="button"
      data-testid="fire-button"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "rgba(255,60,70,0.85)",
        border: "3px solid rgba(0,0,0,0.5)",
        color: "#fff",
        fontFamily: "ui-monospace, monospace",
        fontSize: 20,
        fontWeight: 700,
        touchAction: "none",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
        cursor: "pointer",
      }}
    >
      FIRE
    </button>
  );
}