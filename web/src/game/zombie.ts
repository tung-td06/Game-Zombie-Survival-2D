// src/game/zombie.ts
// Zombie base + 6 subclasses. Data-driven via /data/zombies.json.

import { moveCircle } from "./collision";
import {
  MAX_ALIVE_ZOMBIES,
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
import { drawZombieSprite } from "./pixelArt";

export const ZOMBIE_COLORS: Record<string, string> = {
  normal: "#56963E",
  fast: "#AAB446",
  tank: "#6E5282",
  exploder: "#C47834",
  ranged: "#468C8C",
  boss: "#AA282E",
  crawler: "#B58A3C",
  necromancer: "#7A4FBF",
  necromancer_boss: "#4A2A8F",
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
  /** Wave scaling this zombie was spawned with (needed by summoners). */
  hpMult = 1;
  speedMult = 1;
  dmgMult = 1;
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
    this.hpMult = opts.hpMult ?? 1;
    this.speedMult = opts.speedMult ?? 1;
    this.dmgMult = opts.dmgMult ?? 1;
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

  /** Summon `count` crawler minions near this summoner. */
  protected summonMinions(
    game: IGame,
    count: number,
    hpMult: number,
    speedMult: number,
    dmgMult: number,
  ): void {
    const data = (game as unknown as { zombieData: Record<string, import("./data").ZombieData> })
      .zombieData;
    for (let i = 0; i < count; i++) {
      const pos = game.spawner.spawnPosition(this.pos, game.map!);
      if (pos) {
        game.zombies.push(
          createZombie("crawler", pos, data, hpMult, speedMult, dmgMult),
        );
        game.particles.heal(pos);
      }
    }
    if (count > 0) {
      game.audio.playSFX("enemy.spawn", this.pos);
      game.camera.shake(2);
    }
  }

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
    const r = this.radius;
    drawZombieSprite(ctx, sp, this.KIND, this.faceAngle, this.flash > 0, r);
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


  protected barrage(game: IGame): void {
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

export class CrawlerZombie extends Zombie {
  static override KIND = "crawler";
  // Low, fast, fragile — behavior is fully data-driven.
}

export class NecromancerZombie extends Zombie {
  static override KIND = "necromancer";
  static PREFERRED_DIST = 320;
  private summonCd = 6;
  protected override wantsToStop(dist: number): boolean {
    return dist < this.attackRange;
  }
  protected override extraBehaviour(
    dt: number,
    game: IGame,
    _dist: number,
    _damage: number,
  ): void {
    this.summonCd -= dt;
    if (this.summonCd <= 0 && game.zombies.length < MAX_ALIVE_ZOMBIES) {
      this.summonCd = 8;
      this.summonMinions(
        game,
        2,
        this.hpMult,
        this.speedMult * 0.9,
        this.dmgMult * 0.6,
      );
    }
  }
}

export class NecromancerBossZombie extends BossZombie {
  static override KIND = "necromancer_boss";
  private summonCd = 4;
  protected override extraBehaviour(
    dt: number,
    game: IGame,
    dist: number,
    damage: number,
  ): void {
    super.extraBehaviour(dt, game, dist, damage);
    this.summonCd -= dt;
    if (this.summonCd <= 0 && game.zombies.length < MAX_ALIVE_ZOMBIES) {
      this.summonCd = 5.5;
      this.summonMinions(game, 3, this.hpMult, this.speedMult, this.dmgMult);
      game.toast("MINIONS SUMMONED!");
    }
  }
  protected override barrage(game: IGame): void {
    const n = this.data.barrage_bullets ?? 10;
    const spin = performance.now() / 1000;
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + spin;
      game.enemyBullets.push(
        new Bullet(this.pos, ang, 280, this.damage * 0.7, "enemy"),
      );
    }
    game.camera.shake(8);
  }
  override draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    super.draw(ctx, cam);
    const sp = cam.apply(this.pos);
    const r = this.radius;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
    ctx.save();
    ctx.globalAlpha = 0.5 + pulse * 0.3;
    ctx.strokeStyle = "#AA5CF0";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, r + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.18 + pulse * 0.12;
    ctx.fillStyle = "#7A2FD0";
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, r + 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export const ZOMBIE_CLASSES: Record<string, new (pos: Vec, opts: ConstructorOpts) => Zombie> = {
  normal: NormalZombie,
  fast: FastZombie,
  tank: TankZombie,
  exploder: ExploderZombie,
  ranged: RangedZombie,
  boss: BossZombie,
  crawler: CrawlerZombie,
  necromancer: NecromancerZombie,
  necromancer_boss: NecromancerBossZombie,
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
