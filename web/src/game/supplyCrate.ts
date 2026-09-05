// src/game/supplyCrate.ts
// Supply Crates ("thính"): large world-space loot objects that appear on the
// map periodically. Player walks near and holds E (vacuum key) to open them.
// Spawns on a 2-minute interval starting at t=120s elapsed.
// Reuses existing Loot, Camera, map.blocked(), map.randomFreePoint(),
// particles.floatText(), game.toast(), and the vacuum input already in use.

import type { IGame } from "./types";
import type { Camera } from "./camera";
import type { Vec } from "./vec";
import { Loot } from "./loot";
import { mulberry32 } from "../lib/rng";

// ── Types ────────────────────────────────────────────────────────────────────

export type CrateKind = "ammo" | "medical" | "armor" | "mixed";

interface CrateStyle {
  bodyColor: string;
  borderColor: string;
  labelColor: string;
  glowColor: string;
  label: string;
  icon: string; // single ASCII glyph
}

const CRATE_STYLES: Record<CrateKind, CrateStyle> = {
  ammo:    { bodyColor: "#3C3824", borderColor: "#C8C860", glowColor: "rgba(200,200,80,0.18)",  labelColor: "#D2BE5A", label: "AMMO",   icon: "A" },
  medical: { bodyColor: "#2A1220", borderColor: "#FF4860", glowColor: "rgba(255,60,80,0.18)",   labelColor: "#FF6070", label: "MEDIC",  icon: "+" },
  armor:   { bodyColor: "#182030", borderColor: "#5AB4FF", glowColor: "rgba(80,160,255,0.18)",  labelColor: "#6EC4FF", label: "ARMOR",  icon: "#" },
  mixed:   { bodyColor: "#20202E", borderColor: "#C882FF", glowColor: "rgba(180,100,255,0.18)", labelColor: "#D096FF", label: "SUPPLY", icon: "S" },
};

// ── Constants ────────────────────────────────────────────────────────────────

/** Crate half-size for rendering and collision. */
const CRATE_HALF = 20;

/** Player must be within this world-distance to interact. */
const INTERACT_RANGE = 56;

/** How long the player must hold vacuum (E) to open a crate (seconds). */
const HOLD_TIME = 0.8;

/** Crates blink/pulse when player is in range — period in ms. */
const PULSE_MS = 900;

/** Maximum simultaneous supply crates on the map. */
const MAX_CRATES = 15;

/** First spawn at 30 s elapsed, then every 30 s. */
export const CRATE_SPAWN_INTERVAL = 30;

/** Crates spawn at least this far from the player. */
const SPAWN_AWAY_MIN = 350;
/** … and at most this far. */
const SPAWN_AWAY_MAX = 1200;

// ── SupplyCrate class ────────────────────────────────────────────────────────

export class SupplyCrate {
  pos: Vec;
  kind: CrateKind;
  dead = false;

  /** Progress 0→1 for the hold-to-open bar. */
  openProgress = 0;

  /** Jitter offset for idle bob animation. */
  private phase: number;

  constructor(pos: Vec, kind: CrateKind) {
    this.pos = { ...pos };
    this.kind = kind;
    this.phase = Math.random() * Math.PI * 2;
  }

  update(dt: number, game: IGame): void {
    if (this.dead) return;
    const p = game.player!;
    const dx = p.pos.x - this.pos.x;
    const dy = p.pos.y - this.pos.y;
    const dist = Math.hypot(dx, dy);

    const inRange = dist < INTERACT_RANGE;

    if (inRange && game.input.isDown("vacuum")) {
      this.openProgress = Math.min(1, this.openProgress + dt / HOLD_TIME);
      if (this.openProgress >= 1) {
        this.open(game);
      }
    } else {
      // Gradually release progress when E is not held
      this.openProgress = Math.max(0, this.openProgress - dt * 1.5);
    }
  }

  private open(game: IGame): void {
    this.dead = true;
    const rng = mulberry32(Math.floor(Math.random() * 2 ** 31));
    const p = game.player!;

    switch (this.kind) {
      case "ammo": {
        const w = p.weapons.current;
        const bonus = 25 + Math.floor(rng.next() * 11); // 25 to 35 bullets (approx. 30)
        w.addReserve(bonus);
        game.particles.floatText(this.pos, `+${bonus} AMMO`, "#D2BE5A");
        game.toast("AMMO CRATE — RELOADED!");
        break;
      }
      case "medical": {
        const heal = 20 + Math.floor(rng.next() * 15); // 20–35 HP
        const coins = 10 + Math.floor(rng.next() * 20);
        p.heal(heal);
        p.coins += coins;
        game.particles.floatText(this.pos, `+${heal} HP`, "#FF6070");
        game.particles.floatText({ x: this.pos.x, y: this.pos.y - 15 }, `+$${coins}`, "#F0C850");
        game.toast("MEDICAL CRATE — PATCHED UP!");
        break;
      }
      case "armor": {
        const armAmt = 15 + Math.floor(rng.next() * 15); // 15–30 armor
        const coins = 10 + Math.floor(rng.next() * 15);
        p.addArmor(armAmt);
        p.coins += coins;
        game.particles.floatText(this.pos, `+${armAmt} ARMOR`, "#6EC4FF");
        game.particles.floatText({ x: this.pos.x, y: this.pos.y - 15 }, `+$${coins}`, "#F0C850");
        game.toast("ARMOR CRATE — PROTECTED!");
        break;
      }
      case "mixed": {
        // Apply mixed rewards directly to stats: some HP, some armor, some ammo, and some coins
        const heal = 10 + Math.floor(rng.next() * 15);
        const armor = 10 + Math.floor(rng.next() * 15);
        const coins = 20 + Math.floor(rng.next() * 20);
        
        p.heal(heal);
        p.addArmor(armor);
        p.coins += coins;
        
        const w = p.weapons.current;
        const ammoBonus = 10 + Math.floor(rng.next() * 11); // 10 to 20 bullets
        w.addReserve(ammoBonus);

        // Mixed crates are the only free source of throwable bombs.
        const bombs = p.addBombs(1);

        game.particles.floatText(this.pos, `+${heal} HP  +${armor} ARMOR`, "#D096FF");
        game.particles.floatText({ x: this.pos.x, y: this.pos.y - 15 }, `+${ammoBonus} AMMO  +$${coins}`, "#DEDED6");
        if (bombs > 0) {
          game.particles.floatText({ x: this.pos.x, y: this.pos.y - 30 }, `+${bombs} BOMB`, "#8FCC6E");
        }
        game.toast("SUPPLY CRATE — STOCKED UP!");
        break;
      }
    }

    game.audio.playSFX("player.pickup", this.pos);
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, game: IGame): void {
    if (this.dead) return;

    const style = CRATE_STYLES[this.kind];
    const now = performance.now();

    // Idle bob
    const bob = Math.sin(now / 500 + this.phase) * 2.5;
    const sp = cam.apply({ x: this.pos.x, y: this.pos.y + bob });

    // Proximity check for glow/pulse
    const p = game.player!;
    const dist = Math.hypot(p.pos.x - this.pos.x, p.pos.y - this.pos.y);
    const inRange = dist < INTERACT_RANGE;
    const pulse = inRange
      ? 0.5 + 0.5 * Math.abs(Math.sin((now % PULSE_MS) / PULSE_MS * Math.PI))
      : 0;

    const hw = CRATE_HALF;

    // ── Outer glow ───────────────────────────────────────────────────────────
    if (pulse > 0.05 || this.openProgress > 0) {
      const glowA = Math.max(pulse * 0.45, this.openProgress * 0.6);
      ctx.save();
      ctx.shadowColor = style.borderColor;
      ctx.shadowBlur = 18 + pulse * 14 + this.openProgress * 20;
      ctx.globalAlpha = glowA;
      ctx.fillStyle = style.glowColor;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, hw + 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── Crate body ───────────────────────────────────────────────────────────
    ctx.save();

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    rr(ctx, sp.x - hw + 3, sp.y - hw + 3, hw * 2, hw * 2, 5);
    ctx.fill();

    // Body fill
    ctx.fillStyle = style.bodyColor;
    rr(ctx, sp.x - hw, sp.y - hw, hw * 2, hw * 2, 5);
    ctx.fill();

    // Wood-plank cross lines (matches map crate style)
    ctx.strokeStyle = style.borderColor + "55";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sp.x - hw + 4, sp.y - hw + 4);
    ctx.lineTo(sp.x + hw - 4, sp.y + hw - 4);
    ctx.moveTo(sp.x + hw - 4, sp.y - hw + 4);
    ctx.lineTo(sp.x - hw + 4, sp.y + hw - 4);
    ctx.stroke();

    // Border
    ctx.strokeStyle = style.borderColor;
    ctx.lineWidth = inRange ? 2.5 : 1.8;
    rr(ctx, sp.x - hw, sp.y - hw, hw * 2, hw * 2, 5);
    ctx.stroke();

    // ── Icon glyph ───────────────────────────────────────────────────────────
    ctx.fillStyle = style.labelColor;
    ctx.font = `bold 14px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(style.icon, sp.x, sp.y - 3);

    // ── Label text ───────────────────────────────────────────────────────────
    ctx.font = `bold 9px ui-monospace, monospace`;
    ctx.fillStyle = style.labelColor + "CC";
    ctx.fillText(style.label, sp.x, sp.y + 11);

    ctx.restore();

    // ── Hold-to-open progress bar ────────────────────────────────────────────
    if (this.openProgress > 0) {
      const bw = hw * 2 + 8;
      const bh = 5;
      const bx = sp.x - bw / 2;
      const by = sp.y + hw + 8;

      ctx.fillStyle = "#1E1E26";
      rr(ctx, bx, by, bw, bh, 3);
      ctx.fill();

      ctx.fillStyle = style.borderColor;
      rr(ctx, bx, by, bw * this.openProgress, bh, 3);
      ctx.fill();
    }

    // ── "[ E ] OPEN" prompt ──────────────────────────────────────────────────
    if (inRange && this.openProgress === 0) {
      const alpha = 0.6 + 0.4 * pulse;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#DEDED6";
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("[ E ] OPEN", sp.x, sp.y - hw - 6);
      ctx.restore();
    } else if (inRange && this.openProgress > 0) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = style.labelColor;
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("OPENING...", sp.x, sp.y - hw - 6);
      ctx.restore();
    }
  }
}

// ── Spawn helpers ────────────────────────────────────────────────────────────

const KINDS: CrateKind[] = ["ammo", "medical", "armor", "mixed"];
const KIND_WEIGHTS = [4, 2, 2, 3]; // ammo most common, armor/medical less

function pickKind(rng: ReturnType<typeof mulberry32>): CrateKind {
  const total = KIND_WEIGHTS.reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < KINDS.length; i++) {
    roll -= KIND_WEIGHTS[i]!;
    if (roll <= 0) return KINDS[i]!;
  }
  return "mixed";
}

/**
 * Attempt to spawn 2–3 supply crates at safe, reachable world positions.
 * Uses map.randomFreePoint() which already checks for obstacle collision.
 * Respects MAX_CRATES cap.
 *
 * Call this from game.ts on the 2-minute timer.
 */
export function spawnSupplyCrates(
  crates: SupplyCrate[],
  game: IGame,
  count = 3,
): void {
  if (!game.map || !game.player) return;

  // Remove dead crates first
  const live = crates.filter((c) => !c.dead);
  crates.length = 0;
  for (const c of live) crates.push(c);

  const rng = mulberry32(Math.floor(Math.random() * 2 ** 31));
  let spawned = 0;
  const playerPos = game.player.pos;

  for (let attempt = 0; attempt < count && crates.length < MAX_CRATES; attempt++) {
    const pos = game.map.randomFreePoint(
      rng,
      SPAWN_AWAY_MIN,
      SPAWN_AWAY_MAX,
      playerPos,
      CRATE_HALF + 8,
      60,
    );
    if (!pos) continue;

    // Ensure no overlap with existing crates
    const tooClose = crates.some(
      (c) => !c.dead && Math.hypot(c.pos.x - pos.x, c.pos.y - pos.y) < 80,
    );
    if (tooClose) continue;

    crates.push(new SupplyCrate(pos, pickKind(rng)));
    spawned++;
  }

  if (spawned > 0) {
    game.toast(`${spawned} SUPPLY CRATE${spawned > 1 ? "S" : ""} DROPPED ON MAP!`);
  }
}

// ── Mini round rect helper (local, no import needed) ────────────────────────

function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}
