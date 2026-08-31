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

export interface PlayerOpts {
  unlocked?: string[];
  coins?: number;
  level?: number;
  xp?: number;
  weaponData: Record<string, WeaponData>;
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

  weapons: WeaponManager;

  flashTimer = 0;
  emptyClickTimer = 0;
  invuln = 0;
  walkCycle = 0;
  moving = false;
  dead = false;
  previewOnly = false;

  constructor(pos: Vec, opts: PlayerOpts) {
    this.pos = { ...pos };
    this.coins = Math.max(0, Math.floor(opts.coins ?? 0));
    this.level = Math.max(1, Math.floor(opts.level ?? 1));
    this.xp = Math.max(0, Math.floor(opts.xp ?? 0));
    this.weapons = new WeaponManager(opts.unlocked ?? ["pistol"], opts.weaponData);
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

  update(dt: number, game: IGame): void {
    const inp = game.input;
    const move: Vec = {
      x: (inp.isDown("right") ? 1 : 0) - (inp.isDown("left") ? 1 : 0),
      y: (inp.isDown("down") ? 1 : 0) - (inp.isDown("up") ? 1 : 0),
    };
    this.moving = move.x !== 0 || move.y !== 0;
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
    if (wantFire && w.canFire(wantFire || w.auto)) {
      this.fire(game);
    } else if (wantFire && !w.reloading && w.ammo === 0 && w.cooldown <= 0 && this.emptyClickTimer <= 0) {
      game.audio.playSFX(`weapon.${w.id}.empty`, this.pos);
      this.emptyClickTimer = 0.18;
    }
    this.weapons.update(dt);

    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.invuln = Math.max(0, this.invuln - dt);
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
      game.bullets.push(
        new Bullet(muzzle, s.angle, s.speed, s.damage, "player", s.crit),
      );
    }
    game.particles.muzzleFlash(muzzle, this.angle);
    game.camera.shake(w.pellets === 1 ? 1.5 : 4);
    const sbw = game.stats.shots_by_weapon;
    sbw[w.id] = (sbw[w.id] ?? 0) + 1;
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
  }

  addXp(amount: number, game: IGame): void {
    this.xp += amount;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level += 1;
      this.pendingLevels += 1;
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

    const bob = this.moving ? Math.sin(this.walkCycle) * 2 : 0;
    let bodyCol = "#5ADCFF";
    if (this.flashTimer > 0 && Math.floor(this.flashTimer * 20) % 2 === 0) {
      bodyCol = "#FFFFFF";
    }
    // Gun barrel.
    const bex = sp.x + Math.cos(this.angle) * 26;
    const bey = sp.y + Math.sin(this.angle) * 26;
    ctx.strokeStyle = "#1E1E22";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(sp.x, sp.y);
    ctx.lineTo(bex, bey);
    ctx.stroke();
    ctx.strokeStyle = "#2878A0";
    ctx.lineWidth = 4;
    ctx.stroke();
    // Body.
    ctx.fillStyle = "#121214";
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, this.radius + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    // Legs.
    ctx.fillStyle = "#2878A0";
    ctx.beginPath();
    ctx.arc(sp.x - 8 + bob, sp.y + 12 + bob, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sp.x + 8 - bob, sp.y + 12 - bob, 5, 0, Math.PI * 2);
    ctx.fill();
    // Facing marker.
    ctx.fillStyle = "#F0FAFF";
    ctx.beginPath();
    ctx.arc(
      sp.x + Math.cos(this.angle) * this.radius * 0.6,
      sp.y + Math.sin(this.angle) * this.radius * 0.6,
      3,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}
