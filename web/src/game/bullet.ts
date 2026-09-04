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
  dead = false;
  trailA: Vec;
  trailB: Vec;

  constructor(
    pos: Vec,
    angle: number,
    speed: number,
    damage: number,
    owner: "player" | "enemy" = "player",
    crit = false,
    radius = 4,
    lifetime = BULLET_LIFETIME,
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
          const dx = this.pos.x - z.pos.x;
          const dy = this.pos.y - z.pos.y;
          const r = (z.radius as number) + this.radius;
          if (dx * dx + dy * dy <= r * r) {
            z.takeDamage(this.damage, this.crit, game);
            this.dead = true;
            game.stats.shots_hit = (game.stats.shots_hit ?? 0) + 1;
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
    drawProjectileSprite(ctx, sp, ta, tb, this.owner === "enemy");
  }
}
