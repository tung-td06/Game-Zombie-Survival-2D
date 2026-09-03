// src/game/particle.ts
// Particle system + floating damage numbers. Mirrors particle.py.

import { MAX_PARTICLES } from "./settings";
import type { Camera } from "./camera";
import type { Vec } from "./vec";

interface Particle {
  pos: Vec;
  vel: Vec;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  shrink: boolean;
}

interface DamageNumber {
  text: string;
  pos: Vec;
  vel: Vec;
  life: number;
  color: string;
}

interface GroundDecal {
  pos: Vec;
  kind: "blood" | "scorch";
  life: number;
  maxLife: number;
  size: number;
}

const MAX_DECALS = 120;

const BLOOD = "#96141A";
const YELLOW = "#FFD25A";
const ORANGE = "#FF5A1E";
const GRAY = "#5A5A5A";
const GREEN = "#6EDC82";
const WHITE = "#FFFFFF";

function rot(v: Vec, ang: number): Vec {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function newParticle(p: Omit<Particle, "maxLife">): Particle {
  return { ...p, maxLife: p.life };
}

export class ParticleSystem {
  particles: Particle[] = [];
  numbers: DamageNumber[] = [];
  private decals: GroundDecal[] = [];

  private push(p: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  blood(pos: Vec, count = 8, color: string = BLOOD, enabled = true): void {
    if (!enabled) return;
    for (let i = 0; i < count; i++) {
      const ang = rand(0, Math.PI * 2);
      const spd = rand(40, 220);
      this.push(
        newParticle({
          pos: { ...pos },
          vel: rot({ x: spd, y: 0 }, ang),
          life: rand(0.3, 0.7),
          size: 2 + Math.floor(rand(0, 3)),
          color,
          gravity: 0,
          shrink: true,
        }),
      );
    }
  }

  impact(pos: Vec, color: string, count = 5): void {
    for (let i = 0; i < count; i++) {
      const ang = rand(0, Math.PI * 2);
      const spd = rand(30, 130);
      this.push(
        newParticle({
          pos: { ...pos },
          vel: rot({ x: spd, y: 0 }, ang),
          life: 0.25,
          size: 2,
          color,
          gravity: 0,
          shrink: true,
        }),
      );
    }
  }

  muzzleFlash(pos: Vec, angle: number): void {
    for (let i = 0; i < 5; i++) {
      const spread = angle + rand(-0.35, 0.35);
      const spd = rand(120, 320);
      this.push(
        newParticle({
          pos: { ...pos },
          vel: rot({ x: spd, y: 0 }, spread),
          life: rand(0.06, 0.14),
          size: 3,
          color: YELLOW,
          gravity: 0,
          shrink: true,
        }),
      );
    }
    this.push(
      newParticle({
        pos: { ...pos },
        vel: { x: Math.cos(angle) * 60, y: Math.sin(angle) * 60 },
        life: 0.08,
        size: 9,
        color: "#FFF0AA",
        gravity: 0,
        shrink: true,
      }),
    );
  }

  explosion(pos: Vec, big = false): void {
    this.addDecal(pos, "scorch");
    const n = big ? 40 : 26;
    const colors = ["#FFA028", ORANGE, GRAY];
    for (let i = 0; i < n; i++) {
      const ang = rand(0, Math.PI * 2);
      const spd = rand(80, big ? 420 : 300);
      this.push(
        newParticle({
          pos: { ...pos },
          vel: rot({ x: spd, y: 0 }, ang),
          life: rand(0.4, 1.0),
          size: 3 + Math.floor(rand(0, 4)),
          color: colors[i % colors.length]!,
          gravity: 0,
          shrink: true,
        }),
      );
    }
    for (let i = 0; i < 12; i++) {
      const ang = rand(0, Math.PI * 2);
      this.push(
        newParticle({
          pos: { ...pos },
          vel: rot({ x: rand(-40, 40), y: 0 }, ang),
          life: rand(0.8, 1.6),
          size: 6 + Math.floor(rand(0, 7)),
          color: "#3C3C3C",
          gravity: -20,
          shrink: true,
        }),
      );
    }
  }

  heal(pos: Vec): void {
    for (let i = 0; i < 10; i++) {
      this.push(
        newParticle({
          pos: { ...pos },
          vel: { x: rand(-30, 30), y: -80 },
          life: 0.6,
          size: 3,
          color: GREEN,
          gravity: 0,
          shrink: true,
        }),
      );
    }
  }

  deathBurst(pos: Vec, color: string): void {
    this.addDecal(pos, "blood");
    for (let i = 0; i < 18; i++) {
      const ang = rand(0, Math.PI * 2);
      const spd = rand(60, 260);
      this.push(
        newParticle({
          pos: { ...pos },
          vel: rot({ x: spd, y: 0 }, ang),
          life: rand(0.4, 0.9),
          size: 2 + Math.floor(rand(0, 4)),
          color,
          gravity: 0,
          shrink: true,
        }),
      );
    }
  }

  addDecal(pos: Vec, kind: "blood" | "scorch"): void {
    if (this.decals.length >= MAX_DECALS) this.decals.shift();
    this.decals.push({
      pos: { ...pos },
      kind,
      life: kind === "blood" ? 12 : 6,
      maxLife: kind === "blood" ? 12 : 6,
      size: kind === "blood" ? 14 + Math.random() * 12 : 18 + Math.random() * 14,
    });
  }

  damageNumber(pos: Vec, amount: number, crit: boolean, enabled = true): void {
    if (!enabled) return;
    const text = crit ? `CRIT ${Math.floor(amount)}` : `${Math.floor(amount)}!`;
    const color = crit ? "#FFE650" : WHITE;
    this.numbers.push({
      text,
      pos: { x: pos.x + rand(-8, 8), y: pos.y - 14 },
      vel: { x: rand(-12, 12), y: -55 },
      life: 0.9,
      color,
    });
  }

  floatText(pos: Vec, text: string, color: string): void {
    this.numbers.push({
      text,
      pos: { x: pos.x + rand(-8, 8), y: pos.y - 14 },
      vel: { x: rand(-12, 12), y: -55 },
      life: 0.9,
      color,
    });
  }

  update(dt: number): void {
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      const decay = Math.max(0, 1 - dt * 2.5);
      p.vel.x *= decay;
      p.vel.y *= decay;
      p.vel.y += p.gravity * dt;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      return true;
    });
    this.numbers = this.numbers.filter((n) => {
      n.life -= dt;
      n.pos.x += n.vel.x * dt;
      n.pos.y += n.vel.y * dt;
      return n.life > 0;
    });
    this.decals = this.decals.filter((decal) => {
      decal.life -= dt;
      return decal.life > 0;
    });
  }

  drawDecals(ctx: CanvasRenderingContext2D, cam: Camera): void {
    ctx.save();
    for (const decal of this.decals) {
      const sp = cam.apply(decal.pos);
      ctx.globalAlpha = Math.min(0.58, decal.life / decal.maxLife);
      ctx.fillStyle = decal.kind === "blood" ? "#5C1518" : "#24211D";
      const s = Math.round(decal.size);
      ctx.fillRect(Math.round(sp.x - s / 2), Math.round(sp.y - s / 2), s, Math.max(3, Math.round(s * 0.45)));
      ctx.fillStyle = decal.kind === "blood" ? "#8A2224" : "#3D3830";
      ctx.fillRect(Math.round(sp.x - s * 0.2), Math.round(sp.y - s * 0.1), Math.max(2, Math.round(s * 0.35)), 2);
    }
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    ctx.save();
    for (const p of this.particles) {
      const t = Math.max(0, p.life / p.maxLife);
      const size = Math.max(1, Math.floor(p.size * (p.shrink ? t : 1)));
      const sp = cam.apply(p.pos);
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(sp.x - size / 2), Math.round(sp.y - size / 2), size, size);
    }
    ctx.globalAlpha = 1;
    for (const n of this.numbers) {
      const sp = cam.apply(n.pos);
      const alpha = n.life < 0.35 ? n.life / 0.35 : 1;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = n.color;
      ctx.font = `${n.text.length < 5 ? 16 : 14}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(n.text, sp.x, sp.y);
    }
    ctx.restore();
  }

  get count(): number {
    return this.particles.length + this.numbers.length;
  }

  get decalCount(): number {
    return this.decals.length;
  }

  clear(): void {
    this.particles.length = 0;
    this.numbers.length = 0;
    this.decals.length = 0;
  }
}
