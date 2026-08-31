// src/game/loot.ts
// Loot pickups: coin, ammo, health, armor, weapon. Mirrors loot.py.

import type { IGame } from "./types";
import type { Vec } from "./vec";
import type { Camera } from "./camera";

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
    const magnetRange = grabbing ? 220 : 110;
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
        const mgr = p.weapons as unknown as { give: (id: string) => boolean; currentId: string; weapons: Record<string, { addReserve: (n: number) => void; magazineSize: number }> };
        if (mgr.give(wid)) {
          mgr.currentId = wid;
          game.toast(`PICKED UP ${wid.toUpperCase()}!`);
        } else {
          mgr.weapons[wid]?.addReserve(mgr.weapons[wid].magazineSize * 2);
        }
        break;
      }
    }
    game.audio.playSFX("player.pickup", this.pos);
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    const s = STYLE[this.kind] ?? { color: "#FFFFFF", glyph: "?" };
    const phase = ((performance.now() % 800) / 400) - 1;
    const bob = -4 + 3 * Math.abs(phase);
    const sp = cam.apply({ x: this.pos.x, y: this.pos.y + bob });
    const r = 10;
    ctx.fillStyle = s.color;
    roundRect(ctx, sp.x - r, sp.y - r, r * 2, r * 2, 4);
    ctx.fill();
    ctx.strokeStyle = "#0C0C0E";
    ctx.lineWidth = 2;
    roundRect(ctx, sp.x - r, sp.y - r, r * 2, r * 2, 4);
    ctx.stroke();
    ctx.fillStyle = "#101012";
    ctx.font = "bold 13px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s.glyph, sp.x, sp.y);
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

export function dropsFor(
  zombie: { pos: Vec; coinValue: number },
  rng: { next: () => number; range: (a: number, b: number) => number; pick: <T>(a: T[]) => T },
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
    const pool = ["shotgun", "smg", "rifle", "sniper"];
    drops.push(new Loot(zombie.pos, "weapon", 0, rng.pick(pool)));
  }
  return drops;
}
