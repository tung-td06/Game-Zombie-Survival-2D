// src/game/player.ts
// Player: move/aim/shoot/XP/upgrade multipliers. Mirrors player.py.

import {
  PLAYER_BASE_MAX_HP,
  PLAYER_BASE_SPEED,
  PLAYER_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  XP_BASE_REQUIREMENT,
} from "./settings";
import { moveCircle } from "./collision";
import { clamp } from "./utils";
import { WeaponManager } from "./weapon";
import type { WeaponData } from "./data";
import { Bullet } from "./bullet";
import type { IGame } from "./types";
import type { Vec } from "./vec";
import type { Camera } from "./camera";
import { drawPlayerSprite } from "./pixelArt";

export interface PlayerOpts {
  unlocked?: string[];
  coins?: number;
  level?: number;
  xp?: number;
  weaponData: Record<string, WeaponData>;
  weaponMods?: Record<string, string[]>;
  previewOnly?: boolean;
  username?: string;
}

export class Player {
  radius = PLAYER_RADIUS;
  static XP_BASE = XP_BASE_REQUIREMENT;

  pos: Vec;
  vel: Vec = { x: 0, y: 0 };
  angle = 0;
  username?: string;

  maxHp = PLAYER_BASE_MAX_HP;
  hp = PLAYER_BASE_MAX_HP;
  armor = 0;
  baseSpeed = PLAYER_BASE_SPEED;
  coins = 0;

  level = 1;
  xp = 0;
  pendingLevels = 0;
  upgradeLevels: Record<string, number> = {};

  damageMult = 1;
  fireRateMult = 1;
  reloadMult = 1;
  speedMult = 1;
  critBonus = 0;
  critMultBonus = 0;
  regen = 0;
  magnetMult = 1;
  lifeSteal = 0;
  pierceBonus = 0;
  skillPoints = 0;
  /** Set by a tank's charge attack: blocks movement/firing while > 0. */
  stunTimer = 0;

  // Drone companion ("UFO") — unlocked by buying it in the shop.
  hasDrone = false;
  droneAngle = 0;
  droneCooldown = 0;
  droneDamage = 18;

  weapons: WeaponManager;

  flashTimer = 0;
  recoilTimer = 0;
  emptyClickTimer = 0;
  invuln = 0;
  walkCycle = 0;
  moving = false;
  dustCd = 0;
  dead = false;
  previewOnly = false;

  constructor(pos: Vec, opts: PlayerOpts) {
    this.pos = { ...pos };
    this.coins = Math.max(0, Math.floor(opts.coins ?? 0));
    this.level = Math.max(1, Math.floor(opts.level ?? 1));
    this.xp = Math.max(0, Math.floor(opts.xp ?? 0));
    this.weapons = new WeaponManager(opts.unlocked ?? ["pistol"], opts.weaponData, opts.weaponMods ?? {});
    this.previewOnly = !!opts.previewOnly;
    this.username = opts.username;
  }

  get xpNeeded(): number {
    return Player.XP_BASE * this.level;
  }

  get speed(): number {
    return this.baseSpeed * this.speedMult;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  addArmor(amount: number): void {
    this.armor = Math.min(100, this.armor + amount);
  }

  /** Push the player away from `source`, sliding along walls like a zombie's knockback. */
  knockbackFrom(source: Vec, force: number, game: IGame): void {
    const dx = this.pos.x - source.x;
    const dy = this.pos.y - source.y;
    const d = Math.hypot(dx, dy) || 1;
    const rects = game.map!.getNear(this.pos, this.radius + 4);
    moveCircle(this.pos, { x: (dx / d) * force, y: (dy / d) * force }, this.radius, rects);
    this.pos.x = clamp(this.pos.x, this.radius, WORLD_WIDTH - this.radius);
    this.pos.y = clamp(this.pos.y, this.radius, WORLD_HEIGHT - this.radius);
  }

  update(dt: number, game: IGame): void {
    const inp = game.input;
    this.stunTimer = Math.max(0, this.stunTimer - dt);
    const stunned = this.stunTimer > 0;
    const move: Vec = stunned
      ? { x: 0, y: 0 }
      : {
          x: (inp.isDown("right") ? 1 : 0) - (inp.isDown("left") ? 1 : 0),
          y: (inp.isDown("down") ? 1 : 0) - (inp.isDown("up") ? 1 : 0),
        };
    this.moving = !stunned && (move.x !== 0 || move.y !== 0);
    if (this.moving) {
      const len = Math.hypot(move.x, move.y) || 1;
      move.x /= len;
      move.y /= len;
      const rects = game.map!.getNear(this.pos, this.radius + 4);
      moveCircle(
        this.pos,
        { x: move.x * this.speed * dt, y: move.y * this.speed * dt },
        this.radius,
        rects,
      );
      this.pos.x = clamp(this.pos.x, this.radius, WORLD_WIDTH - this.radius);
      this.pos.y = clamp(this.pos.y, this.radius, WORLD_HEIGHT - this.radius);
      const lastCycle = this.walkCycle;
      this.walkCycle += dt * 10;
      
      const stepFreq = Math.PI;
      if (Math.floor(lastCycle / stepFreq) !== Math.floor(this.walkCycle / stepFreq)) {
        const stepSound = Math.random() < 0.5 ? "player.footstep1" : "player.footstep2";
        game.audio.playSFX(stepSound, this.pos);
      }
      // FOOTSTEP DUST (optional, OFF by default): subtle puffs trailing the
      // feet every 0.18s while moving — only when the setting is enabled.
      if (game.save.settings.footstep_dust) {
        this.dustCd -= dt;
        if (this.dustCd <= 0) {
          this.dustCd = 0.18;
          game.particles.dust({
            x: this.pos.x + Math.cos(this.walkCycle + Math.PI) * 8,
            y: this.pos.y + Math.sin(this.walkCycle + Math.PI) * 8,
          });
        }
      }
    }

    // Aim: touch auto-aim override (mobile) or mouse in world coords (desktop).
    const aimWorld = inp.getAimWorld(game.camera);
    this.angle = Math.atan2(aimWorld.y - this.pos.y, aimWorld.x - this.pos.x);

    this.emptyClickTimer = Math.max(0, this.emptyClickTimer - dt);

    // Weapon switching.
    const prevWepId = this.weapons.currentId;
    if (inp.isPressed("weapon1")) this.weapons.selectSlot(1);
    if (inp.isPressed("weapon2")) this.weapons.selectSlot(2);
    if (inp.isPressed("weapon3")) this.weapons.selectSlot(3);
    if (inp.isPressed("weapon4")) this.weapons.selectSlot(4);
    if (inp.isPressed("weapon5")) this.weapons.selectSlot(5);
    if (inp.isPressed("weapon6")) this.weapons.selectSlot(6);
    if (inp.isPressed("weapon7")) this.weapons.selectSlot(7);
    if (inp.isPressed("weapon8")) this.weapons.selectSlot(8);
    if (inp.isPressed("next_weapon")) this.weapons.cycle();

    if (this.weapons.currentId !== prevWepId) {
      game.audio.cancelReloadSound(prevWepId);
      const prevWep = this.weapons.weapons[prevWepId];
      if (prevWep && prevWep.reloading) {
        prevWep.reloading = false;
      }
      game.audio.playSFX("ui.equip");
    }

    const w = this.weapons.current;
    const wantFire = inp.mouseHeld;
    if (
      inp.isPressed("reload") ||
      (wantFire && !w.reloading && w.ammo === 0 && w.reserve > 0)
    ) {
      if (w.startReload(this.reloadMult)) {
        game.audio.playSFX(`weapon.${w.id}.reload`, this.pos);
      }
    }
    if (!stunned && wantFire && w.canFire(wantFire || w.auto)) {
      this.fire(game);
    } else if (!stunned && wantFire && !w.reloading && w.ammo === 0 && w.cooldown <= 0 && this.emptyClickTimer <= 0) {
      game.audio.playSFX(`weapon.${w.id}.empty`, this.pos);
      this.emptyClickTimer = 0.18;
    }
    this.weapons.update(dt);

    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.recoilTimer = Math.max(0, this.recoilTimer - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.regen > 0) this.heal(this.regen * dt);
    if (this.hasDrone) this.droneTick(dt, game);
  }

  /** Orbiting drone that auto-fires at the nearest zombie in range. */
  private droneTick(dt: number, game: IGame): void {
    this.droneAngle += dt * 1.6;
    this.droneCooldown -= dt;
    if (this.droneCooldown > 0) return;
    for (const z of game.zombies) {
      if (z.dying) continue;
      const dx = z.pos.x - this.pos.x;
      const dy = z.pos.y - this.pos.y;
      if (dx * dx + dy * dy < 280 * 280) {
        const muzzle: Vec = {
          x: this.pos.x + Math.cos(this.droneAngle + Math.PI) * 36,
          y: this.pos.y + Math.sin(this.droneAngle + Math.PI) * 36,
        };
        const ang = Math.atan2(z.pos.y - muzzle.y, z.pos.x - muzzle.x);
        game.bullets.push(
          new Bullet(muzzle, ang, 1200, this.droneDamage, "player"),
        );
        game.particles.muzzleFlash(muzzle, ang);
        this.droneCooldown = 0.55;
        return;
      }
    }
  }

  private fire(game: IGame): void {
    const w = this.weapons.current;
    const muzzle: Vec = {
      x: this.pos.x + Math.cos(this.angle) * 24,
      y: this.pos.y + Math.sin(this.angle) * 24,
    };
    const shots = w.fire(
      this.angle,
      this.damageMult,
      this.critBonus,
      this.critMultBonus,
    );
    w.cooldown = w.fireRate / Math.max(0.01, this.fireRateMult);
    for (const s of shots) {
      const b = new Bullet(
        muzzle,
        s.angle,
        s.speed,
        s.damage,
        "player",
        s.crit,
        s.radius,
        s.lifetime,
        s.elem,
      );
      if (s.elem === "pierce") {
        // Crossbow bolt: pierces 3 enemies by default, +1 per pierce skill.
        b.pierceLeft = 3 + this.pierceBonus;
      }
      game.bullets.push(b);
    }
    game.particles.muzzleFlash(muzzle, this.angle);
    this.recoilTimer = 0.09;
    game.camera.shake(w.pellets === 1 ? 1.5 : 4);
    const sbw = game.stats.shots_by_weapon;
    sbw[w.id] = (sbw[w.id] ?? 0) + 1;
    game.stats.shots_fired = (game.stats.shots_fired ?? 0) + shots.length;
    game.audio.playSFX(`weapon.${w.id}.shoot`, this.pos);
  }

  takeDamage(amount: number, game: IGame): void {
    if (this.invuln > 0 || this.dead) return;
    const absorbed = Math.min(this.armor, amount);
    this.armor -= absorbed;
    const hpLoss = amount - absorbed;
    this.hp -= hpLoss;
    this.flashTimer = game.save.settings.hit_effects ? 0.25 : 0;
    this.invuln = 0.15;
    game.particles.blood(this.pos, 6, undefined, game.save.settings.hit_effects);
    game.particles.damageNumber(this.pos, hpLoss + absorbed, false, game.save.settings.damage_numbers);
    game.camera.shake(Math.min(10, 2 + amount * 0.15));
    game.audio.playSFX("player.damage", this.pos);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }    addXp(amount: number, game: IGame): void {
    this.xp += amount;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level += 1;
      this.pendingLevels += 1;
      this.skillPoints += 1;
      game.onLevelUp();
    }
    game.save.data["player_level"] = this.level;
    game.save.data["xp"] = this.xp;
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    const sp = cam.apply(this.pos);
    
    // Draw username above player if it exists
    if (this.username) {
      ctx.fillStyle = "#EBEBE1";
      ctx.font = "bold 12px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(this.username, sp.x, sp.y - this.radius - 10);
    }

    drawPlayerSprite(
      ctx,
      sp,
      this.angle,
      this.moving ? this.walkCycle : 0,
      this.recoilTimer,
      this.weapons.currentId,
      this.flashTimer > 0 && Math.floor(this.flashTimer * 20) % 2 === 0,
    );

    // Drone companion: orbits the player and glows softly.
    if (this.hasDrone) {
      const dxx = sp.x + Math.cos(this.droneAngle) * 40;
      const dyy = sp.y + Math.sin(this.droneAngle) * 40 - 14;
      ctx.strokeStyle = "rgba(140, 230, 255, 0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(dxx, dyy, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#3A3A44";
      ctx.beginPath();
      ctx.arc(dxx, dyy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8FE8FF";
      ctx.beginPath();
      ctx.arc(dxx, dyy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#EAFBFF";
      ctx.beginPath();
      ctx.arc(dxx - 2, dyy - 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
