// src/game/loot.ts
// Loot pickups: coin, ammo, health, armor, weapon. Mirrors loot.py.

import type { IGame } from "./types";
import type { Vec } from "./vec";
import type { Camera } from "./camera";
import { drawLootSprite } from "./pixelArt";
import { modDef, randomModId } from "./mods";

export type LootKind = "coin" | "ammo" | "health" | "armor" | "weapon";

const STYLE: Record<LootKind, { color: string; glyph: string }> = {
  coin: { color: "#F0C850", glyph: "$" },
  ammo: { color: "#C8C8D2", glyph: "A" },
  health: { color: "#FF3C46", glyph: "+" },
  armor: { color: "#5AB4FF", glyph: "#" },
  weapon: { color: "#FF8CDC", glyph: "W" },
};

export class Loot {
  pos: Vec;
  kind: LootKind;
  amount: number;
  payload: string | null = null;
  /** Weapon-loot only: mod id granted for free (rare drop). */
  bonusMod: string | null = null;
  age = 0;
  dead = false;

  constructor(pos: Vec, kind: LootKind, amount = 0, payload: string | null = null) {
    this.pos = { ...pos };
    this.kind = kind;
    this.amount = Math.floor(amount);
    this.payload = payload;
  }

  update(dt: number, game: IGame): void {
    this.age += dt;
    const p = game.player!;
    const dx = p.pos.x - this.pos.x;
    const dy = p.pos.y - this.pos.y;
    const d = Math.hypot(dx, dy);
    const grabbing = game.input.isDown("vacuum");
    const magnetRange = (grabbing ? 220 : 110) * (p.magnetMult || 1);
    const pickupRange = p.radius + (grabbing ? 48 : 14);
    if (d < magnetRange) {
      const speed = grabbing ? 420 : 300;
      const factor = Math.max(0.3, 1 - d / magnetRange);
      const nx = d > 0.001 ? dx / d : 0;
      const ny = d > 0.001 ? dy / d : 0;
      this.pos.x += nx * speed * dt * factor;
      this.pos.y += ny * speed * dt * factor;
    }
    if (d < pickupRange) {
      this.apply(game);
      this.dead = true;
    }
  }

  private apply(game: IGame): void {
    const p = game.player!;
    switch (this.kind) {
      case "coin":
        p.coins += this.amount;
        game.particles.floatText(this.pos, `+$${this.amount}`, "#F0C850");
        break;
      case "health":
        p.heal(this.amount);
        game.particles.floatText(this.pos, `+${this.amount} HP`, "#6EDC82");
        break;
      case "armor":
        p.addArmor(this.amount);
        game.particles.floatText(this.pos, `+${this.amount} ARMOR`, "#5AB4FF");
        break;
      case "ammo": {
        const w = p.weapons.current;
        w.addReserve(Math.floor(w.magazineSize * 1.5));
        game.particles.floatText(this.pos, "AMMO", "#DCDCE6");
        break;
      }
      case "weapon": {
        const wid = this.payload ?? "shotgun";
        const mgr = p.weapons as unknown as {
          give: (id: string) => boolean;
          applyMod: (id: string, modId: string) => boolean;
          currentId: string;
          weapons: Record<string, { addReserve: (n: number) => void; magazineSize: number; mods: string[] }>;
        };
        if (mgr.give(wid)) {
          mgr.currentId = wid;
          if (this.bonusMod) {
            mgr.applyMod(wid, this.bonusMod);
            game.save.data.weapon_upgrades[wid] = [...mgr.weapons[wid]!.mods];
            game.save.save();
            game.toast(
              `RARE DROP: ${wid.toUpperCase()} + ${modDef(this.bonusMod)?.name.toUpperCase() ?? this.bonusMod}!`,
              "rare",
            );
          } else {
            game.toast(`PICKED UP ${wid.toUpperCase()}!`);
          }
        } else {
          mgr.weapons[wid]?.addReserve(mgr.weapons[wid].magazineSize * 2);
        }
        break;
      }
    }
    game.audio.playSFX("player.pickup", this.pos);
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    const phase = ((performance.now() % 800) / 400) - 1;
    const bob = -4 + 3 * Math.abs(phase);
    const sp = cam.apply({ x: this.pos.x, y: this.pos.y + bob });
    drawLootSprite(ctx, sp, this.kind, Math.abs(phase));
    if (this.bonusMod) {
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 180);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = "#FFD24A";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rad: number,
): void {
  const r = Math.min(rad, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Chance a dropped (unowned) weapon is a rare pickup that comes with a free mod. */
const RARE_WEAPON_CHANCE = 0.2;

export function dropsFor(
  zombie: { pos: Vec; coinValue: number },
  rng: { next: () => number; range: (a: number, b: number) => number; pick: <T>(a: T[]) => T },
  ownedWeapons: string[] = [],
): Loot[] {
  const drops: Loot[] = [
    new Loot(zombie.pos, "coin", zombie.coinValue),
  ];
  const r = rng.next();
  const off = (): Vec => ({
    x: zombie.pos.x + rng.range(-20, 20),
    y: zombie.pos.y,
  });
  if (r < 0.06) drops.push(new Loot(off(), "health", 25));
  else if (r < 0.17) drops.push(new Loot(off(), "ammo", 0));
  else if (r < 0.21) drops.push(new Loot(off(), "armor", 15));
  else if (r < 0.225) {
    // Never drop a weapon the player already owns — it would just be wasted.
    const pool = ["shotgun", "smg", "rifle", "sniper", "crossbow", "flamethrower", "plasma"].filter(
      (id) => !ownedWeapons.includes(id),
    );
    if (pool.length > 0) {
      const loot = new Loot(zombie.pos, "weapon", 0, rng.pick(pool));
      if (rng.next() < RARE_WEAPON_CHANCE) loot.bonusMod = randomModId(rng);
      drops.push(loot);
    }
  }
  return drops;
}
