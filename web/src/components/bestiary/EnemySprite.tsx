"use client";

// Canvas preview that draws a zombie with the EXACT sprite renderer used
// in-game (pixelArt.drawZombieSprite), so the lobby artwork always matches
// the game. The optional ring mirrors the in-game indicator colours:
//   boss (ABOMINATION)         → gold ring   (BossZombie.draw)
//   necromancer_boss           → purple ring (NecromancerBossZombie.draw)
//   elite (Mutant)             → white ring  (EliteZombie.draw, neutral)
import { useEffect, useRef } from "react";
import { drawZombieSprite } from "@/game/pixelArt";
import { BOSS_KIND, NECROMANCER_BOSS_KIND, ELITE_KIND } from "@/game/enemyGates";

const RING_COLORS: Record<string, string> = {
  [BOSS_KIND]: "#FFC83C",
  [NECROMANCER_BOSS_KIND]: "#AA5CF0",
  [ELITE_KIND]: "#E8E8F0",
};

export function EnemySprite({
  kind,
  radius,
  size = 72,
  shadow = false,
}: {
  kind: string;
  radius: number;
  size?: number;
  /** Dark circular plate behind the sprite (keeps light sprites readable). */
  shadow?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    cv.width = Math.max(1, Math.round(size * dpr));
    cv.height = Math.max(1, Math.round(size * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    if (shadow) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Every kind renders at roughly the same apparent size: the sprite's
    // internal scale is max(0.75, radius/16), so compensate by 1.55/scale.
    const scale = Math.max(0.75, radius / 16);
    const f = 1.55 / scale;
    ctx.save();
    ctx.translate(size / 2, size / 2 + 2);
    ctx.scale(f, f);
    // Angle 0 (facing right) → no horizontal mirroring; static pose reads well.
    drawZombieSprite(ctx, { x: 0, y: 0 }, kind, 0, false, radius);
    ctx.restore();

    const ring = RING_COLORS[kind];
    if (ring) {
      ctx.save();
      ctx.strokeStyle = ring;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2;
      if (kind === NECROMANCER_BOSS_KIND) ctx.shadowBlur = 10;
      else ctx.shadowBlur = 6;
      ctx.shadowColor = ring;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2 + 2, (radius + (kind === NECROMANCER_BOSS_KIND ? 10 : 6)) * f, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }, [kind, radius, size, shadow]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={`Hình ảnh quái vật`}
      style={{
        width: size,
        height: size,
        display: "block",
        imageRendering: "pixelated",
        flexShrink: 0,
      }}
    />
  );
}
