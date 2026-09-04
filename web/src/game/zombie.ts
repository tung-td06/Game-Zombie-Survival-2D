// src/game/zombie.ts
// Zombie base + 6 subclasses. Data-driven via /data/zombies.json.

import { moveCircle, circleRectCollide } from "./collision";
import type { Rect } from "./collision";
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
  elite: "#3C7A8C",
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
  /** Turning bias used when steering around obstacles (per zombie). */
  steerBias = Math.random() < 0.5 ? -1 : 1;
  /** Huge zombies bulldoze light scenery they wedge against. */
  protected crushLight = false;
  private crushCd = 0;
  /** Rotates which escape side is tried first on successive jams. */
  private escapeTry = 0;
  private escapeLosT = 0;
  /** How long this zombie has been blocked while trying to close in. */
  stuckTime = 0;
  /**
   * Waypoint navigation around a blocking obstacle. When the line to the
   * player crosses a building, the zombie walks to a point just outside the
   * nearer corner of that building, then keeps walking corner to corner (in
   * `pathOrder`) until the line opens again. Kept per zombie so the horde
   * spreads across both ends of a face instead of stacking against it.
   */
  pathTarget: Vec | null = null;
  private pathRect: Rect | null = null;
  private pathOrder: number[] = [];
  private pathStep = 0;
  private losTimer = 0;
  /** Jam escape: while true the zombie walks straight along `escapeDir`. */
  private escaping = false;
  private escapeDir: Vec = { x: 0, y: 0 };
  private escapeTimer = 0;
  private escapeStart: Vec | null = null;
  private escapeDist = 170;
  /** Dither detection: net approach vs gross movement over a short window. */
  private winT = 0;
  private winApproach = 0;
  private winGross = 0;
  private winStartX = 0;
  private winStartY = 0;
  growlCd = 0;
  dying = false;
  /** Set only by EliteZombie; partial resistance to a matching bullet elem. */
  resistElem?: "fire" | "plasma" | "pierce";

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
      if (this.escaping) {
        // Jam escape: keep walking along the chosen open direction until it
        // has travelled far enough (or times out), then re-plan normally.
        this.escapeTimer -= dt;
        const travelled = this.escapeStart
          ? Math.hypot(this.pos.x - this.escapeStart.x, this.pos.y - this.escapeStart.y)
          : 0;
        // Stop the moment a straight line to the player opens up again —
        // never march past the point where chasing can resume.
        const mapNow = game.map;
        this.escapeLosT -= dt;
        if (mapNow && this.escapeLosT <= 0) {
          this.escapeLosT = 0.3;
          if (!this.losBlocked(mapNow, player.pos)) this.escaping = false;
        }
        if (this.escapeTimer <= 0 || travelled >= this.escapeDist) this.escaping = false;
        if (this.escaping) move = { x: this.escapeDir.x * speed, y: this.escapeDir.y * speed };
        else if (this.wantsToStop(dist)) {
          // hold position
        } else if (dist > this.attackRange * 0.85 && dist > 0.001) {
          const dirX = toP.x / dist;
          const dirY = toP.y / dist;
          move = this.steerMove(game, dirX, dirY, speed, dt);
        }
      } else if (this.wantsToStop(dist)) {
        // hold position
      } else if (dist > this.attackRange * 0.85) {
        if (dist > 0.001) {
          const dirX = toP.x / dist;
          const dirY = toP.y / dist;
          move = this.steerMove(game, dirX, dirY, speed, dt);
        }
      }
      const reach = this.attackRange + this.radius + player.radius * 0.5;
      this.attackTimer -= dt;
      // Melee never reaches through a wall: if an obstacle sits between the
      // zombie and its target it keeps pushing around it instead.
      const wallBetween = this.wallBetween(game, player.pos);
      if (dist <= reach && this.attackTimer <= 0 && !wallBetween) {
        this.attackTimer = this.attackCooldownMax;
        player.takeDamage(damage, game);
        this.onAttack(game);
      }
    }

    this.extraBehaviour(dt, game, dist, damage, move);

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
    const px0 = this.pos.x;
    const py0 = this.pos.y;
    if (total.x !== 0 || total.y !== 0) {
      const rects = game.map!.getNear(this.pos, this.radius + 4);
      moveCircle(this.pos, total, this.radius, rects);
      this.pos.x = clamp(this.pos.x, this.radius, WORLD_WIDTH - this.radius);
      this.pos.y = clamp(this.pos.y, this.radius, WORLD_HEIGHT - this.radius);
    }
    // Stuck meters: (1) a hard-stuck zombie that barely moves at all, and
    // (2) a dithering zombie that keeps moving back and forth (or sideways)
    // along a wall but never actually approaches the player. Both drop the
    // current plan and trigger a jam-escape toward the most open side.
    if (
      this.state === "chase" &&
      !this.wantsToStop(dist) &&
      dist > this.attackRange * 0.85
    ) {
      const moved = Math.hypot(this.pos.x - px0, this.pos.y - py0);
      const expected = Math.hypot(total.x, total.y);
      const newDist = Math.hypot(player.pos.x - this.pos.x, player.pos.y - this.pos.y);
      // Reactive crush: a bulldozing zombie smashes light props the moment
      // they block it, instead of waiting until it is fully stuck.
      this.crushCd -= dt;
      if (this.crushLight && this.crushCd <= 0 && expected > 0.5 && moved < expected * 0.5) {
        if (this.crushBlockers(game)) {
          this.crushCd = 0.4;
          this.stuckTime = 0;
        } else {
          this.crushCd = 0.8;
        }
      }
      if (expected > 0.5 && moved < expected * 0.35) {
        this.stuckTime += dt;
        if (this.stuckTime > 0.5) {
          this.stuckTime = 0;
          // Alternate the escape side every jam so successive escapes try
          // BOTH ends of the obstacle instead of always undoing each other.
          this.steerBias = -this.steerBias;
          // Wedged against something that isn't on our route: drop the path
          // so the next line check picks a fresh corner (opposite side).
          this.pathRect = null;
          this.pathTarget = null;
          if (this.crushBlockers(game)) this.stuckTime = 0;
          else if (!this.escaping) this.startEscape(game, toP, dist);
        }
      } else {
        this.stuckTime = Math.max(0, this.stuckTime - dt * 2);
      }

      // Dither window: measure whether movement translates into progress.
      if (this.winT === 0) {
        this.winStartX = this.pos.x;
        this.winStartY = this.pos.y;
      }
      this.winT += dt;
      this.winApproach += dist - newDist;
      this.winGross += moved;
      if (this.winT >= 0.7) {
        const winT = this.winT;
        const approach = this.winApproach;
        const gross = this.winGross;
        const net = Math.hypot(this.pos.x - this.winStartX, this.pos.y - this.winStartY);
        this.winT = 0;
        this.winApproach = 0;
        this.winGross = 0;
        // Moving a lot but ending up (almost) where it started, without
        // net-approaching the player => vibrating against an obstacle.
        if (approach < 10 && gross > winT * 35 && net < 14 && !this.escaping) {
          this.stuckTime = 0;
          this.steerBias = -this.steerBias;
          this.pathRect = null;
          this.pathTarget = null;
          if (this.crushBlockers(game)) this.stuckTime = 0;
          else this.startEscape(game, toP, dist);
        }
      }
    } else {
      this.winT = 0;
      this.winApproach = 0;
      this.winGross = 0;
    }
    this.flash = Math.max(0, this.flash - dt);
  }

  /**
   * Chase movement with obstacle navigation. Every ~0.25s the zombie checks
   * whether a straight line to the player is clear; if a building blocks it,
   * it walks to a waypoint just outside the nearer corner of that building
   * and keeps advancing corner to corner until the line opens again. Between
   * checks it simply beelines to the current waypoint (or the player), and
   * the collision resolver slides it along wall faces.
   */
  private steerMove(game: IGame, dx: number, dy: number, speed: number, dt: number): Vec {
    const map = game.map;
    const player = game.player!;
    if (!map) return { x: dx * speed, y: dy * speed };

    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.25;
      this.refreshPath(map, player.pos);
    }

    if (this.pathTarget) {
      const vx = this.pathTarget.x - this.pos.x;
      const vy = this.pathTarget.y - this.pos.y;
      const d = Math.hypot(vx, vy);
      if (d > 24) return { x: (vx / d) * speed, y: (vy / d) * speed };
      // Reached the corner waypoint: advance to the next corner of the
      // blocking building.
      this.advancePath();
      if (this.pathTarget) {
        const wx = this.pathTarget.x - this.pos.x;
        const wy = this.pathTarget.y - this.pos.y;
        const wd = Math.hypot(wx, wy);
        if (wd > 24) return { x: (wx / wd) * speed, y: (wy / wd) * speed };
      }
    }
    return { x: dx * speed, y: dy * speed };
  }

  /** True when an obstacle blocks the straight line to `target`. */
  private wallBetween(game: IGame, target: Vec): boolean {
    const map = game.map;
    if (!map) return false;
    for (let t = 0.3; t <= 0.7; t += 0.2) {
      const sx = this.pos.x + (target.x - this.pos.x) * t;
      const sy = this.pos.y + (target.y - this.pos.y) * t;
      if (map.blocked({ x: sx, y: sy }, Math.max(2, this.radius * 0.3))) return true;
    }
    return false;
  }

  /**
   * Walk the line of sight from this zombie to `to` and report the first
   * obstacle rect it crosses (and a sample point on it), or null if clear.
   */
  private losBlocked(map: { getNear(pos: Vec, radius: number): Rect[] }, to: Vec): { rect: Rect; entry: Vec } | null {
    const dx = to.x - this.pos.x;
    const dy = to.y - this.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return null;
    const ux = dx / dist;
    const uy = dy / dist;
    const step = Math.max(24, this.radius + 6);
    for (let t = step; t < dist; t += step) {
      const p = { x: this.pos.x + ux * t, y: this.pos.y + uy * t };
      for (const r of map.getNear(p, this.radius)) {
        if (circleRectCollide(p.x, p.y, this.radius, r)) return { rect: r, entry: p };
      }
    }
    return null;
  }

  private refreshPath(map: { getNear(pos: Vec, radius: number): Rect[] }, playerPos: Vec): void {
    const hit = this.losBlocked(map, playerPos);
    if (!hit) {
      this.pathRect = null;
      this.pathTarget = null;
      return;
    }
    // Already rounding this obstacle (or one merged into the same cluster)?
    // Keep walking instead of re-planning every LOS tick.
    const pr = this.pathRect;
    const inside =
      pr !== null &&
      hit.rect.x >= pr.x - 1 &&
      hit.rect.y >= pr.y - 1 &&
      hit.rect.x + hit.rect.w <= pr.x + pr.w + 1 &&
      hit.rect.y + hit.rect.h <= pr.y + pr.h + 1;
    if (inside && this.pathTarget) return;
    this.beginPath(playerPos, hit.rect, hit.entry);
  }

  /** Break out of a jam: walk toward the side with the most open room. */
  private startEscape(game: IGame, toP: Vec, dist: number): void {
    const map = game.map;
    if (!map || dist < 1) return;
    const hx = toP.x / dist;
    const hy = toP.y / dist;
    // Laterals (left/right of the heading, by per-zombie bias) plus back
    // (away from the player). Every jam rotates which side is tried first,
    // so repeated escapes sweep through all open sides instead of always
    // undoing each other by picking the same one.
    const left = { x: -hy, y: hx };
    const right = { x: hy, y: -hx };
    const base: Vec[] = this.steerBias > 0
      ? [left, right, { x: -hx, y: -hy }]
      : [right, left, { x: -hx, y: -hy }];
    const start = this.escapeTry % base.length;
    this.escapeTry = start + 1;
    const cands: Vec[] = [];
    for (let i = 0; i < base.length; i++) cands.push(base[(start + i) % base.length]);
    const r = this.radius + 2;
    let best: Vec | null = null;
    let bestScore = -1;
    let firstOpen: Vec | null = null;
    for (const d of cands) {
      let score = 0;
      for (let t = 60; t <= 340; t += 40) {
        const p = { x: this.pos.x + d.x * t, y: this.pos.y + d.y * t };
        if (!map.blocked(p, r)) score = t;
        else break;
      }
      if (!firstOpen && score >= 160) firstOpen = d;
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    // Prefer the first side with a genuinely open run; fall back to the
    // most open direction only when boxed in.
    const dir = firstOpen ?? (best && bestScore >= 100 ? best : null);
    if (dir) {
      // Repeated jams (escapeTry has rotated several times without breaking
      // out) take a much longer detour so the zombie clears the whole
      // obstacle side instead of orbiting its corner.
      const longEscape = this.escapeTry >= 3;
      this.escaping = true;
      this.escapeDir = dir;
      this.escapeDist = longEscape ? 420 : 170;
      this.escapeTimer = longEscape ? 9 : 3.2;
      this.escapeStart = { x: this.pos.x, y: this.pos.y };
    }
  }

  /** Start rounding `rect`, heading for the corner closest to the zombie. */
  private beginPath(playerPos: Vec, rect: Rect, entry: Vec): void {
    this.pathRect = { ...rect };
    const margin = this.radius + 14;
    // Corner offsets just outside the rect: TL, TR, BR, BL.
    const corners: Vec[] = [
      { x: rect.x - margin, y: rect.y - margin },
      { x: rect.x + rect.w + margin, y: rect.y - margin },
      { x: rect.x + rect.w + margin, y: rect.y + rect.h + margin },
      { x: rect.x - margin, y: rect.y + rect.h + margin },
    ];
    // Which face of the rect does the sightline cross? Round the nearer end.
    const dl = Math.abs(entry.x - rect.x);
    const dr = Math.abs(entry.x - (rect.x + rect.w));
    const dt = Math.abs(entry.y - rect.y);
    const db = Math.abs(entry.y - (rect.y + rect.h));
    const min = Math.min(dl, dr, dt, db);
    const vertical = min === dl || min === dr;
    const a = vertical ? (min === dl ? 0 : 1) : min === dt ? 0 : 3;
    const b = vertical ? (min === dl ? 3 : 2) : min === dt ? 1 : 2;
    const da = Math.hypot(this.pos.x - corners[a].x, this.pos.y - corners[a].y);
    const db2 = Math.hypot(this.pos.x - corners[b].x, this.pos.y - corners[b].y);
    // Ties (zombie centred on the face) split the horde by steering bias.
    const pick = da < db2 - 30 ? a : db2 < da - 30 ? b : this.steerBias > 0 ? a : b;
    // Walk the perimeter in the direction whose next corner is closer to the
    // player, so thin/wide obstacles are rounded the short way instead of
    // marching the long way around (or into a dead pocket) first.
    const cw = corners[(pick + 1) % 4];
    const ccw = corners[(pick + 3) % 4];
    const cwD = Math.hypot(playerPos.x - cw.x, playerPos.y - cw.y);
    const ccwD = Math.hypot(playerPos.x - ccw.x, playerPos.y - ccw.y);
    if (ccwD < cwD) {
      this.pathOrder = [pick, (pick + 3) % 4, (pick + 2) % 4, (pick + 1) % 4];
    } else {
      this.pathOrder = [pick, (pick + 1) % 4, (pick + 2) % 4, (pick + 3) % 4];
    }
    this.pathStep = 0;
    this.pathTarget = { ...corners[pick] };
  }

  /** Move to the next corner of the building being rounded. */
  private advancePath(): void {
    const rect = this.pathRect;
    if (!rect) {
      this.pathTarget = null;
      return;
    }
    this.pathStep = (this.pathStep + 1) % this.pathOrder.length;
    const idx = this.pathOrder[this.pathStep];
    const margin = this.radius + 14;
    const corners: Vec[] = [
      { x: rect.x - margin, y: rect.y - margin },
      { x: rect.x + rect.w + margin, y: rect.y - margin },
      { x: rect.x + rect.w + margin, y: rect.y + rect.h + margin },
      { x: rect.x - margin, y: rect.y + rect.h + margin },
    ];
    this.pathTarget = { ...corners[idx] };
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

  /**
   * Big zombies bulldoze the light scenery they have wedged against (small
   * trees, bushes, hydrants…). Returns true when an obstacle was smashed.
   */
  protected crushBlockers(game: IGame): boolean {
    if (!this.crushLight) return false;
    const map = game.map as unknown as {
      tryCrushSmallObstacle?: (pos: Vec, radius: number) => boolean;
    } | null;
    if (!map || !map.tryCrushSmallObstacle) return false;
    if (map.tryCrushSmallObstacle(this.pos, this.radius + 30)) {
      game.particles?.deathBurst?.(this.pos, "#7A6A4A");
      return true;
    }
    return false;
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
    _move: Vec,
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

  takeDamage(
    amount: number,
    crit: boolean,
    game: IGame,
    elem?: "fire" | "plasma" | "pierce",
  ): void {
    const dealt =
      elem && this.resistElem === elem && this.data.resist_mult != null
        ? amount * this.data.resist_mult
        : amount;
    this.hp -= dealt;
    this.flash = game.save.settings.hit_effects ? 0.12 : 0;
    this.state = "chase";
    game.particles.blood(this.pos, 6, undefined, game.save.settings.hit_effects);
    game.particles.damageNumber(this.pos, dealt, crit, game.save.settings.damage_numbers);
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
  private lungeCd = 0;
  private lungeWindup = 0;
  private lunging = false;
  private lungeTimer = 0;
  protected override extraBehaviour(
    dt: number,
    game: IGame,
    dist: number,
    _damage: number,
    move: Vec,
  ): void {
    this.lungeCd -= dt;
    const player = game.player!;
    const dx = player.pos.x - this.pos.x;
    const dy = player.pos.y - this.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    if (this.lungeWindup > 0) {
      this.lungeWindup -= dt;
      move.x = 0;
      move.y = 0;
      if (this.lungeWindup <= 0) {
        this.lunging = true;
        this.lungeTimer = 0.35;
      }
      return;
    }
    if (this.lunging) {
      this.lungeTimer -= dt;
      const mult = (this.data.lunge_speed_mult ?? 2.6) - 1;
      move.x += (dx / d) * this.speed * mult;
      move.y += (dy / d) * this.speed * mult;
      if (this.lungeTimer <= 0) this.lunging = false;
      return;
    }
    const range = this.data.lunge_range ?? 90;
    if (
      this.state === "chase" &&
      dist <= range &&
      dist > this.attackRange &&
      this.lungeCd <= 0
    ) {
      this.lungeCd = this.data.lunge_cooldown ?? 3.5;
      this.lungeWindup = this.data.lunge_windup ?? 0.3;
      game.audio.playSFX("enemy.alert", this.pos);
    }
  }
  override draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    super.draw(ctx, cam);
    if (this.lungeWindup > 0) {
      const sp = cam.apply(this.pos);
      ctx.strokeStyle = "#FF5A3C";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, this.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
export class TankZombie extends Zombie {
  static override KIND = "tank";
  private chargeCd = 0;
  private charging = false;
  private chargeTimer = 0;
  protected override extraBehaviour(
    dt: number,
    game: IGame,
    dist: number,
    damage: number,
    move: Vec,
  ): void {
    this.chargeCd -= dt;
    if (this.charging) {
      this.chargeTimer -= dt;
      const player = game.player!;
      const dx = player.pos.x - this.pos.x;
      const dy = player.pos.y - this.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      const mult = (this.data.charge_speed_mult ?? 3.2) - 1;
      move.x += (dx / d) * this.speed * mult;
      move.y += (dy / d) * this.speed * mult;
      // The dash lands its own hit the instant it connects — independent of
      // the normal melee attackTimer, so a charge can never "whiff" just
      // because that cooldown hasn't ticked down yet.
      const reach = this.attackRange + this.radius + player.radius * 0.5;
      if (d <= reach) {
        this.charging = false;
        player.takeDamage(damage * 1.5, game);
        player.stunTimer = Math.max(
          player.stunTimer,
          this.data.charge_stun_duration ?? 1.1,
        );
        player.knockbackFrom(this.pos, 50, game);
        game.camera.shake(10);
        game.toast("STUNNED!");
      } else if (this.chargeTimer <= 0) {
        this.charging = false;
      }
      return;
    }
    const triggerRange = this.data.charge_trigger_range ?? 220;
    if (
      this.state === "chase" &&
      dist <= triggerRange &&
      dist > this.attackRange &&
      this.chargeCd <= 0
    ) {
      this.charging = true;
      this.chargeTimer = 0.6;
      this.chargeCd = this.data.charge_cooldown ?? 6;
      game.audio.playSFX("enemy.alert", this.pos);
    }
  }
  override draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    super.draw(ctx, cam);
    if (this.charging) {
      const sp = cam.apply(this.pos);
      ctx.strokeStyle = "#FFD24A";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, this.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
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
    _move: Vec,
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
    this.crushLight = true;
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
    _move: Vec,
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
    _move: Vec,
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
    move: Vec,
  ): void {
    super.extraBehaviour(dt, game, dist, damage, move);
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

const ELITE_ELEMS: Array<"fire" | "plasma" | "pierce"> = ["fire", "plasma", "pierce"];

export class EliteZombie extends Zombie {
  static override KIND = "elite";
  constructor(pos: Vec, opts: ConstructorOpts) {
    super(pos, opts);
    this.resistElem = ELITE_ELEMS[Math.floor(Math.random() * ELITE_ELEMS.length)];
  }
  override draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    super.draw(ctx, cam);
    const sp = cam.apply(this.pos);
    const color =
      this.resistElem === "fire" ? "#FF6A2E" : this.resistElem === "plasma" ? "#3CD6FF" : "#D8D8D8";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, this.radius + 5, 0, Math.PI * 2);
    ctx.stroke();
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
  elite: EliteZombie,
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
