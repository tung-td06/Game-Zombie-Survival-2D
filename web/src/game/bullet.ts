// src/game/bullet.ts
// Projectiles fired by player and ranged enemies. Mirrors bullet.py.

import { BULLET_LIFETIME, WORLD_HEIGHT, WORLD_WIDTH } from "./settings";
import { circleRectCollide } from "./collision";
import type { Camera } from "./camera";
import type { Vec } from "./vec";
import type { IGame as Game } from "./types";
import { drawProjectileSprite } from "./pixelArt";

export class Bullet {
  pos: Vec;
  vel: Vec;
  damage: number;
  owner: "player" | "enemy";
  crit: boolean;
  radius: number;
  lifetime: number;
  elem?: "fire" | "plasma" | "pierce";
  dead = false;
  trailA: Vec;
  trailB: Vec;
  /** Zombies already pierced by this bolt. */
  hitSet: Set<import("./zombie").Zombie> = new Set();
  /** Remaining pierces for crossbow bolts (default Infinity for safety). */
  pierceLeft = Infinity;

  constructor(
    pos: Vec,
    angle: number,
    speed: number,
    damage: number,
    owner: "player" | "enemy" = "player",
    crit = false,
    radius = 4,
    lifetime = BULLET_LIFETIME,
    elem?: "fire" | "plasma" | "pierce",
  ) {
    this.pos = { ...pos };
    this.vel = {
      x: Math.cos(angle) * speed,
      y: Math.sin(angle) * speed,
    };
    this.damage = damage;
    this.owner = owner;
    this.crit = crit;
    this.radius = radius;
    this.elem = elem;
    // Weapons can cap their reach per shot (range / speed); enemies and
    // the drone keep the shared default lifetime.
    this.lifetime = lifetime;
    this.trailA = { ...pos };
    this.trailB = { ...pos };
  }

  update(dt: number, game: Game): void {
    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      this.dead = true;
      return;
    }
    const speed = Math.hypot(this.vel.x, this.vel.y);
    const distance = speed * dt;
    const steps = Math.max(1, Math.floor(distance / 10));
    const stepVec = { x: this.vel.x * (dt / steps), y: this.vel.y * (dt / steps) };

    for (let i = 0; i < steps; i++) {
      this.trailB = { ...this.trailA };
      this.trailA = { ...this.pos };
      this.pos.x += stepVec.x;
      this.pos.y += stepVec.y;

      if (
        this.pos.x < 0 ||
        this.pos.x > WORLD_WIDTH ||
        this.pos.y < 0 ||
        this.pos.y > WORLD_HEIGHT
      ) {
        this.dead = true;
        return;
      }

      for (const rect of game.map!.getNear(this.pos, this.radius)) {
        if (circleRectCollide(this.pos.x, this.pos.y, this.radius, rect)) {
          this.dead = true;
          game.particles.impact(this.pos, "#82827E", 4);
          return;
        }
      }

      if (this.owner === "player") {
        for (const z of game.zombies) {
          if (this.hitSet.has(z)) continue;
          const dx = this.pos.x - z.pos.x;
          const dy = this.pos.y - z.pos.y;
          const r = (z.radius as number) + this.radius;
          if (dx * dx + dy * dy <= r * r) {
            z.takeDamage(this.damage, this.crit, game);
            game.stats.shots_hit = (game.stats.shots_hit ?? 0) + 1;
            if (this.elem === "pierce") {
              // Crossbow bolt: punch through, hit each zombie once.
              this.hitSet.add(z);
              game.particles.impact(this.pos, "#E8E8E8", 2);
              this.pierceLeft -= 1;
              if (this.pierceLeft <= 0) {
                this.dead = true;
                return;
              }
              continue;
            }
            if (this.elem === "plasma") {
              // Plasma rounds burst: splash damage to zombies near the impact.
              const SPLASH_R = 72;
              const SPLASH_FRACTION = 0.5;
              for (const z2 of game.zombies) {
                if (z2 === z || z2.dying) continue;
                const dx2 = z2.pos.x - this.pos.x;
                const dy2 = z2.pos.y - this.pos.y;
                const rr = (z2.radius as number) + SPLASH_R;
                if (dx2 * dx2 + dy2 * dy2 <= rr * rr) {
                  z2.takeDamage(
                    Math.max(1, Math.round(this.damage * SPLASH_FRACTION)),
                    false,
                    game,
                  );
                }
              }
              game.particles.explosion(this.pos, false);
              game.camera.shake(2);
            } else if (this.elem === "fire") {
              game.particles.impact(this.pos, "#FF8C2E", 4);
            }
            this.dead = true;
            return;
          }
        }
      } else {
        const p = game.player;
        if (!p || p.dead) continue;
        const dx = this.pos.x - p.pos.x;
        const dy = this.pos.y - p.pos.y;
        const r = (p.radius as number) + this.radius;
        if (dx * dx + dy * dy <= r * r) {
          p.takeDamage(this.damage, game);
          this.dead = true;
          return;
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    const sp = cam.apply(this.pos);
    const ta = cam.apply(this.trailA);
    const tb = cam.apply(this.trailB);
    drawProjectileSprite(
      ctx,
      sp,
      ta,
      tb,
      this.owner === "enemy",
      this.elem,
    );
  }
}
