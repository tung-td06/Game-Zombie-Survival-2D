// src/game/grenade.ts
// Thrown frag bomb ("BOMB PACK" in the shop, F to throw).
//
// The bomb is launched toward the aim point, skids across the ground with
// drag so it comes to rest roughly under the crosshair, bounces off walls,
// and detonates on a short fuse with radius damage that falls off with
// distance. Zombies are knocked back; the thrower takes reduced damage, so
// hugging your own blast still hurts.

import { circleRectCollide } from "./collision";
import { WORLD_HEIGHT, WORLD_WIDTH } from "./settings";
import type { Camera } from "./camera";
import type { IGame } from "./types";
import type { Vec } from "./vec";

/** Bombs carried at the start of a run. */
export const BOMB_START_COUNT = 2;
/** Hard cap on carried bombs. */
export const BOMB_MAX = 6;
/** Bombs granted per shop BOMB PACK. */
export const BOMB_PACK_AMOUNT = 2;
export const BOMB_PACK_PRICE = 150;

/** Seconds between throws. */
export const BOMB_THROW_COOLDOWN = 0.65;

const RADIUS = 7;
/** How far in front of the player the bomb is released. */
const MUZZLE_OFFSET = 20;
const FUSE = 1.15;
/** Aim distances outside this range are clamped before the throw. */
const MIN_THROW_DIST = 70;
const MAX_THROW_DIST = 460;
/** Velocity decay per second — with `v0 = dist * DRAG` the bomb lands on the crosshair. */
const DRAG = 2.1;
/** Fraction of speed kept when bouncing off a wall. */
const BOUNCE = 0.45;

export const BLAST_RADIUS = 155;
export const BLAST_DAMAGE = 180;
/** Damage kept at the very edge of the blast (linear falloff down to this). */
const EDGE_FRACTION = 0.3;
/** Fraction of the blast the thrower takes when caught in it. */
const SELF_DAMAGE_FRACTION = 0.35;
const KNOCKBACK_FORCE = 340;

export class Grenade {
  pos: Vec;
  vel: Vec;
  fuse = FUSE;
  dead = false;
  /** Purely cosmetic tumble angle. */
  spin = 0;
  private spinRate: number;

  constructor(pos: Vec, angle: number, speed: number) {
    this.pos = { ...pos };
    this.vel = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
    this.spinRate = 6 + Math.random() * 6;
  }

  /**
   * Build a bomb thrown from `from` toward `target`. The launch speed is
   * derived from the (clamped) aim distance so the bomb decelerates to a
   * stop right about where the player was aiming.
   */
  static toward(from: Vec, target: Vec): Grenade {
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const angle = Math.atan2(dy, dx);
    const dist = Math.min(MAX_THROW_DIST, Math.max(MIN_THROW_DIST, Math.hypot(dx, dy)));
    const muzzle: Vec = {
      x: from.x + Math.cos(angle) * MUZZLE_OFFSET,
      y: from.y + Math.sin(angle) * MUZZLE_OFFSET,
    };
    // The bomb leaves the hand already MUZZLE_OFFSET along the throw, so it
    // only has to cover the remainder to come to rest on the crosshair.
    return new Grenade(muzzle, angle, (dist - MUZZLE_OFFSET) * DRAG);
  }

  update(dt: number, game: IGame): void {
    if (this.dead) return;

    this.fuse -= dt;
    this.spin += this.spinRate * dt;

    const rects = game.map!.getNear(this.pos, RADIUS + 4);
    // Axis-separated bounce: whichever axis put the bomb inside a wall is
    // rolled back and reflected, so it skips along walls instead of sticking.
    const nx = this.pos.x + this.vel.x * dt;
    if (this.hits(nx, this.pos.y, rects)) {
      this.vel.x = -this.vel.x * BOUNCE;
    } else {
      this.pos.x = nx;
    }
    const ny = this.pos.y + this.vel.y * dt;
    if (this.hits(this.pos.x, ny, rects)) {
      this.vel.y = -this.vel.y * BOUNCE;
    } else {
      this.pos.y = ny;
    }

    this.pos.x = Math.min(WORLD_WIDTH - RADIUS, Math.max(RADIUS, this.pos.x));
    this.pos.y = Math.min(WORLD_HEIGHT - RADIUS, Math.max(RADIUS, this.pos.y));

    const decay = Math.max(0, 1 - DRAG * dt);
    this.vel.x *= decay;
    this.vel.y *= decay;

    if (this.fuse <= 0) this.explode(game);
  }

  private hits(x: number, y: number, rects: ReadonlyArray<{ x: number; y: number; w: number; h: number }>): boolean {
    for (const r of rects) {
      if (circleRectCollide(x, y, RADIUS, r)) return true;
    }
    return false;
  }

  explode(game: IGame): void {
    if (this.dead) return;
    this.dead = true;

    game.particles.explosion(this.pos, true);
    game.camera.shake(16);
    game.audio.playSFX("explosion", this.pos);

    for (const z of game.zombies) {
      if (z.dying) continue;
      const dx = z.pos.x - this.pos.x;
      const dy = z.pos.y - this.pos.y;
      const d = Math.hypot(dx, dy);
      if (d > BLAST_RADIUS + z.radius) continue;
      z.takeDamage(BLAST_DAMAGE * falloff(d), false, game);
      const len = d || 1;
      z.knockback.x += (dx / len) * KNOCKBACK_FORCE * falloff(d);
      z.knockback.y += (dy / len) * KNOCKBACK_FORCE * falloff(d);
    }

    const p = game.player;
    if (p && !p.dead) {
      const d = Math.hypot(p.pos.x - this.pos.x, p.pos.y - this.pos.y);
      if (d < BLAST_RADIUS) {
        p.takeDamage(BLAST_DAMAGE * falloff(d) * SELF_DAMAGE_FRACTION, game);
        p.knockbackFrom(this.pos, 26, game);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    const sp = cam.apply(this.pos);

    // Ground shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.ellipse(sp.x + 2, sp.y + 5, RADIUS, RADIUS * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    // Danger ring: closes in on the blast radius as the fuse burns down.
    const t = 1 - Math.max(0, this.fuse) / FUSE;
    ctx.strokeStyle = `rgba(255, 90, 60, ${0.15 + t * 0.35})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, BLAST_RADIUS * (0.35 + t * 0.65), 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.rotate(this.spin);
    // Casing
    ctx.fillStyle = "#2E4028";
    ctx.beginPath();
    ctx.arc(0, 0, RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1A2418";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-RADIUS, 0);
    ctx.lineTo(RADIUS, 0);
    ctx.moveTo(0, -RADIUS);
    ctx.lineTo(0, RADIUS);
    ctx.stroke();
    // Spoon / lever
    ctx.fillStyle = "#8A8A78";
    ctx.fillRect(-1.5, -RADIUS - 3, 3, 4);
    ctx.restore();

    // Fuse light: blinks faster the closer the bomb is to going off.
    const blink = Math.sin(this.spin * (2 + t * 8));
    if (blink > 0) {
      ctx.fillStyle = "#FF5A32";
      ctx.beginPath();
      ctx.arc(sp.x, sp.y - RADIUS - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Linear damage falloff from full at the centre to EDGE_FRACTION at the rim. */
function falloff(dist: number): number {
  const t = Math.min(1, Math.max(0, dist / BLAST_RADIUS));
  return EDGE_FRACTION + (1 - EDGE_FRACTION) * (1 - t);
}
