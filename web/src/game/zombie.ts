// src/game/zombie.ts
// Zombie base + 6 subclasses. Data-driven via /data/zombies.json.

import { moveCircle } from "./collision";
import {
  NIGHT_DAMAGE_BONUS,
  NIGHT_SPEED_BONUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./settings";
import { clamp } from "./utils";
import type { ZombieData } from "./data";
import type { IGame } from "./types";
import type { Vec } from "./vec";
import type { Camera } from "./camera";
import { Bullet } from "./bullet";

export const ZOMBIE_COLORS: Record<string, string> = {
  normal: "#56963E",
  fast: "#AAB446",
  tank: "#6E5282",
  exploder: "#C47834",
  ranged: "#468C8C",
  boss: "#AA282E",
};

interface ConstructorOpts {
  hpMult?: number;
  speedMult?: number;
  dmgMult?: number;
  data: Record<string, ZombieData>;
}

export class Zombie {
  static KIND = "normal";
  data: ZombieData;
  pos: Vec;
  vel: Vec = { x: 0, y: 0 };
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  radius: number;
  attackRange: number;
  attackCooldownMax: number;
  detectionRange: number;
  scoreValue: number;
  coinValue: number;
  xpValue: number;
  state: "idle" | "chase" = "idle";
  faceAngle = 0;
  attackTimer = 0;
  flash = 0;
  knockback: Vec = { x: 0, y: 0 };
  wanderAngle = 0;
  wanderTimer = 0;
  growlCd = 0;
  dying = false;

  constructor(pos: Vec, opts: ConstructorOpts) {
    const d = opts.data[(this.constructor as typeof Zombie).KIND] ?? opts.data["normal"]!;
    this.data = d;
    this.pos = { ...pos };
    this.hp = d.hp * (opts.hpMult ?? 1);
    this.maxHp = this.hp;
    this.speed = d.speed * (opts.speedMult ?? 1);
    this.damage = d.damage * (opts.dmgMult ?? 1);
    this.radius = d.radius;
    this.attackRange = d.attack_range;
    this.attackCooldownMax = d.attack_cooldown;
    this.detectionRange = d.detection_range;
    this.scoreValue = d.score;
    this.coinValue = d.coins;
    this.xpValue = d.xp;
    this.attackTimer = Math.random() * this.attackCooldownMax;
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.growlCd = 2 + Math.random() * 6;
  }

  get KIND(): string {
    return (this.constructor as typeof Zombie).KIND;
  }

  update(dt: number, game: IGame): void {
    const player = game.player!;
    const toP: Vec = { x: player.pos.x - this.pos.x, y: player.pos.y - this.pos.y };
    const dist = Math.hypot(toP.x, toP.y);
    const night = game.nightFactor();
    const speed = this.speed * (1 + NIGHT_SPEED_BONUS * night);
    const damage = this.damage * (1 + NIGHT_DAMAGE_BONUS * night);

    if (dist > 0.001) {
      this.faceAngle = Math.atan2(toP.y, toP.x);
    }
    if (dist <= this.detectionRange || this.hp < this.maxHp) {
      if (this.state === "idle") {
        this.state = "chase";
        if (Math.random() < 0.3) game.audio.playSFX("enemy.alert", this.pos);
      }
    } else {
      this.state = "idle";
    }

    let move: Vec = { x: 0, y: 0 };
    if (this.state === "idle") {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 1.5 + Math.random() * 2;
        this.wanderAngle += (Math.random() * 2 - 1) * 2;
      }
      move = {
        x: Math.cos(this.wanderAngle) * speed * 0.25,
        y: Math.sin(this.wanderAngle) * speed * 0.25,
      };
    } else {
      this.growlCd -= dt;
      if (this.growlCd <= 0 && dist < 600) {
        this.growlCd = 4 + Math.random() * 5;
      }
      if (this.wantsToStop(dist)) {
        // hold position
      } else if (dist > this.attackRange * 0.85) {
        if (dist > 0.001) {
          move = { x: (toP.x / dist) * speed, y: (toP.y / dist) * speed };
        }
      }
      const reach = this.attackRange + this.radius + player.radius * 0.5;
      this.attackTimer -= dt;
      if (dist <= reach && this.attackTimer <= 0) {
        this.attackTimer = this.attackCooldownMax;
        player.takeDamage(damage, game);
        this.onAttack(game);
      }
    }

    this.extraBehaviour(dt, game, dist, damage);

    // separation
    const sep = this.separation(game);
    move.x += sep.x;
    move.y += sep.y;

    // knockback decay
    const kb = { x: this.knockback.x * dt, y: this.knockback.y * dt };
    const decay = Math.max(0, 1 - dt * 6);
    this.knockback.x *= decay;
    this.knockback.y *= decay;
    const total = { x: move.x * dt + kb.x, y: move.y * dt + kb.y };
    if (total.x !== 0 || total.y !== 0) {
      const rects = game.map!.getNear(this.pos, this.radius + 4);
      moveCircle(this.pos, total, this.radius, rects);
      this.pos.x = clamp(this.pos.x, this.radius, WORLD_WIDTH - this.radius);
      this.pos.y = clamp(this.pos.y, this.radius, WORLD_HEIGHT - this.radius);
    }
    this.flash = Math.max(0, this.flash - dt);
  }

  private separation(game: IGame): Vec {
    const minD = this.radius * 1.9;
    let px = 0;
    let py = 0;
    const gx = Math.floor(this.pos.x / 128);
    const gy = Math.floor(this.pos.y / 128);
    const grid = game.zgrid;
    if (!grid) return { x: 0, y: 0 };
    for (let cx = gx - 1; cx <= gx + 1; cx++) {
      for (let cy = gy - 1; cy <= gy + 1; cy++) {
        const bucket = grid[`${cx},${cy}`];
        if (!bucket) continue;
        for (const o of bucket) {
          const other = o as Zombie;
          if (other === this) continue;
          const dx = this.pos.x - other.pos.x;
          const dy = this.pos.y - other.pos.y;
          const d2 = dx * dx + dy * dy;
          const md = minD + other.radius * 0.4;
          if (d2 > 0.001 && d2 < md * md) {
            const d = Math.sqrt(d2);
            const f = (md - d) / d;
            px += dx * f;
            py += dy * f;
          }
        }
      }
    }
    return { x: px * 2, y: py * 2 };
  }

  protected wantsToStop(_dist: number): boolean {
    return false;
  }
  protected onAttack(_game: IGame): void {}
  protected extraBehaviour(
    _dt: number,
    _game: IGame,
    _dist: number,
    _damage: number,
  ): void {}

  takeDamage(amount: number, crit: boolean, game: IGame): void {
    this.hp -= amount;
    this.flash = game.save.settings.hit_effects ? 0.12 : 0;
    this.state = "chase";
    game.particles.blood(this.pos, 6, undefined, game.save.settings.hit_effects);
    game.particles.damageNumber(this.pos, amount, crit, game.save.settings.damage_numbers);
    game.audio.playSFX(crit ? "impact.crit" : "impact.enemy", this.pos);
    if (this.hp <= 0) this.die(game);
  }

  protected die(game: IGame): void {
    if (this.dying) return;
    this.dying = true;
    game.onZombieKilled(this);
    game.particles.deathBurst(
      this.pos,
      ZOMBIE_COLORS[this.KIND] ?? ZOMBIE_COLORS["normal"]!,
    );
    game.audio.playSFX("enemy.death", this.pos);
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    const sp = cam.apply(this.pos);
    const col = ZOMBIE_COLORS[this.KIND] ?? ZOMBIE_COLORS["normal"]!;
    const r = this.radius;
    const wob = Math.sin(performance.now() / 120 + this.pos.x) * 1.5;
    const bodyCol =
      this.flash > 0 && Math.floor(this.flash * 40) % 2 === 0 ? "#FFFFFF" : col;
    ctx.fillStyle = "#0E140E";
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, r + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y + wob, r, 0, Math.PI * 2);
    ctx.fill();
    // Eyes
    const ang = this.faceAngle;
    const eyeOffX = Math.cos(ang) * r * 0.45;
    const eyeOffY = Math.sin(ang) * r * 0.45;
    const perpX = r > 10 ? -Math.sin(ang) * 4 : 0;
    const perpY = r > 10 ? Math.cos(ang) * 4 : 0;
    for (const sign of [-1, 1]) {
      ctx.fillStyle = "#DC1E1E";
      ctx.beginPath();
      ctx.arc(sp.x + eyeOffX + perpX * sign, sp.y + eyeOffY + perpY * sign, Math.max(1, Math.floor(r / 5)), 0, Math.PI * 2);
      ctx.fill();
    }
    // HP bar
    if (this.hp < this.maxHp) {
      const w = r * 2;
      const frac = Math.max(0, this.hp / this.maxHp);
      const barY = sp.y - r - 9;
      ctx.fillStyle = "#1E1E1E";
      ctx.fillRect(sp.x - r, barY, w, 5);
      ctx.fillStyle = "#C83232";
      ctx.fillRect(sp.x - r, barY, w * frac, 5);
    }
  }
}

// --- subclasses ---------------------------------------------------------

export class NormalZombie extends Zombie {
  static override KIND = "normal";
}
export class FastZombie extends Zombie {
  static override KIND = "fast";
}
export class TankZombie extends Zombie {
  static override KIND = "tank";
}
export class ExploderZombie extends Zombie {
  static override KIND = "exploder";
  protected override die(game: IGame): void {
    if (this.dying) return;
    this.dying = true;
    const radius = this.data.explosion_radius ?? 140;
    const boomDmg =
      (this.data.explosion_damage ?? 55) *
      (1 + NIGHT_DAMAGE_BONUS * game.nightFactor());
    game.particles.explosion(this.pos, true);
    game.camera.shake(14);
    game.audio.playSFX("explosion", this.pos);
    const p = game.player!;
    const pdist = Math.hypot(p.pos.x - this.pos.x, p.pos.y - this.pos.y);
    if (pdist < radius) {
      const falloff = 1 - pdist / radius;
      p.takeDamage(Math.max(6, boomDmg * falloff), game);
    }
    for (const z of game.zombies) {
      if (z === this) continue;
      const d = Math.hypot(z.pos.x - this.pos.x, z.pos.y - this.pos.y);
      if (d < radius) z.takeDamage(boomDmg * 0.5, false, game);
    }
    game.onZombieKilled(this);
  }
}
export class RangedZombie extends Zombie {
  static override KIND = "ranged";
  static PREFERRED_DIST = 280;
  protected override wantsToStop(dist: number): boolean {
    return dist < this.attackRange;
  }
  protected override extraBehaviour(
    dt: number,
    game: IGame,
    dist: number,
    damage: number,
  ): void {
    if (
      dist > RangedZombie.PREFERRED_DIST * 0.7 &&
      dist < this.attackRange &&
      this.state !== "idle"
    ) {
      if (this.attackTimer <= 0) {
        this.attackTimer = this.attackCooldownMax;
        const p = game.player!;
        const ang = Math.atan2(p.pos.y - this.pos.y, p.pos.x - this.pos.x);
        const muzzle: Vec = {
          x: this.pos.x + Math.cos(ang) * this.radius,
          y: this.pos.y + Math.sin(ang) * this.radius,
        };
        const speed = this.data.projectile_speed ?? 420;
        game.enemyBullets.push(
          new Bullet(muzzle, ang, speed, damage, "enemy"),
        );
        game.particles.muzzleFlash(muzzle, ang);
      }
    }
  }
}
export class BossZombie extends Zombie {
  static override KIND = "boss";
  phase = 1;
  barrageTimer = 3;
  constructor(pos: Vec, opts: ConstructorOpts) {
    super(pos, opts);
    this.detectionRange = 100000;
  }
  private currentPhase(): number {
    const f = this.hp / this.maxHp;
    if (f > 0.66) return 1;
    if (f > 0.33) return 2;
    return 3;
  }
  protected override extraBehaviour(
    dt: number,
    game: IGame,
    _dist: number,
    _damage: number,
  ): void {
    const np = this.currentPhase();
    if (np !== this.phase) {
      this.phase = np;
      game.camera.shake(18);
      game.audio.playSFX("enemy.boss_spawn", this.pos);
      game.toast(`BOSS PHASE ${this.phase}!`);
    }
    if (this.phase >= 2) {
      this.barrageTimer -= dt;
      let interval = this.data.barrage_interval ?? 6;
      if (this.phase >= 3) interval *= 0.5;
      if (this.barrageTimer <= 0) {
        this.barrageTimer = interval;
        this.barrage(game);
      }
    }
  }
  private barrage(game: IGame): void {
    const n = (this.data.barrage_bullets ?? 14) + (this.phase - 1) * 3;
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n;
      game.enemyBullets.push(
        new Bullet(this.pos, ang, 300, this.damage * 0.6, "enemy"),
      );
    }
    game.camera.shake(8);
  }
  override draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    super.draw(ctx, cam);
    const sp = cam.apply(this.pos);
    const r = this.radius;
    ctx.strokeStyle = "#FFC83C";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, r + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#FFD250";
    ctx.font = "bold 13px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`P${this.phase}`, sp.x, sp.y - r - 16);
  }
}

export const ZOMBIE_CLASSES: Record<string, new (pos: Vec, opts: ConstructorOpts) => Zombie> = {
  normal: NormalZombie,
  fast: FastZombie,
  tank: TankZombie,
  exploder: ExploderZombie,
  ranged: RangedZombie,
  boss: BossZombie,
};

export function createZombie(
  kind: string,
  pos: Vec,
  data: Record<string, ZombieData>,
  hpMult = 1,
  speedMult = 1,
  dmgMult = 1,
): Zombie {
  const Cls = ZOMBIE_CLASSES[kind] ?? NormalZombie;
  return new Cls(pos, { data, hpMult, speedMult, dmgMult });
}
