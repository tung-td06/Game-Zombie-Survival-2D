// tests/game_smoke.test.ts
import { describe, test, expect, vi } from "vitest";

// Mock fetch to return data files from disk
import fs from "fs";
import path from "path";

function readJSON(p: string) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "public", p), "utf8"));
}

const weaponsData = readJSON("data/weapons.json");
const zombiesData = readJSON("data/zombies.json");
const upgradesData = readJSON("data/upgrades.json");

(globalThis as any).fetch = vi.fn(async (url: string) => {
  if (url.includes("weapons.json")) return { ok: true, json: async () => weaponsData } as any;
  if (url.includes("zombies.json")) return { ok: true, json: async () => zombiesData } as any;
  if (url.includes("upgrades.json")) return { ok: true, json: async () => upgradesData } as any;
  if (url.includes("/api/game/save")) {
    return {
      ok: true,
      json: async () => ({
        save: {
          save_version: 1,
          level: 5,
          wave: 3,
          score: 1000,
          money: 500,
          player_data: {
            x: 100, y: 100, hp: 80, maxHp: 100, armor: 0, xp: 50,
            upgradeLevels: { damage: 2, speed: 1 },
          },
          weapon_data: {
            currentId: "shotgun",
            unlocked: ["pistol", "shotgun"],
            ammo: { pistol: { ammo: 12, reserve: 96 }, shotgun: { ammo: 6, reserve: 24 } },
          },
          inventory_data: {},
          progression_data: {
            combo: 0, comboTimer: 0, elapsed: 60, timeOfDay: 12,
            stats: { kills: 10, kills_by_type: {}, boss_kills: 0, survival_time: 60, shots_by_weapon: {} },
            waveManager: { state: "active", timer: 0, to_spawn: 5, spawned_this_wave: 0, spawnTimer: 0, spawnInterval: 1, hpMult: 1, speedMult: 1, dmgMult: 1, bossAlive: false },
          },
          world_data: { seed: 12345, loot: [], supplyCrates: [], crateTimer: 30 },
        }
      })
    } as any;
  }
  return { ok: false, status: 404, json: async () => ({}) } as any;
});

class FakeCtx {
  width = 1280;
  height = 720;
  canvas = { width: 1280, height: 720 } as any;
  fillStyle = "";
  strokeStyle = "";
  font = "";
  textAlign: any = "left";
  textBaseline: any = "top";
  globalAlpha = 1;
  lineWidth = 1;
  shadowColor = "";
  shadowBlur = 0;
  setTransform() {}
  clearRect() {}
  fillRect() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  quadraticCurveTo() {}
  bezierCurveTo() {}
  closePath() {}
  stroke() {}
  fill() {}
  arc() {}
  fillText() {}
  save() {}
  restore() {}
  translate() {}
  rotate() {}
  scale() {}
  drawImage() {}
  strokeRect() {}
  measureText() { return { width: 0 } as any; }
  createRadialGradient() { return { addColorStop() {} } as any; }
  createLinearGradient() { return { addColorStop() {} } as any; }
}

describe("Game smoke", () => {
  test("construct and start, exercise main states", async () => {
    (globalThis as any).window = {
      devicePixelRatio: 1,
      innerWidth: 1280,
      innerHeight: 720,
      addEventListener: () => {},
      removeEventListener: () => {},
      location: { protocol: "http:", host: "localhost" },
    };
    (globalThis as any).document = {
      pointerLockElement: null,
      exitPointerLock: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      fullscreenElement: null,
      body: { setAttribute: () => {} },
      createElement: () => ({ getContext: () => new FakeCtx() }),
    };
    (globalThis as any).localStorage = {
      _: {} as Record<string, string>,
      getItem(k: string) { return this._[k] ?? null; },
      setItem(k: string, v: string) { this._[k] = v; },
      removeItem(k: string) { delete this._[k]; },
    };
    (globalThis as any).performance = { now: () => Date.now() };

    const { Game } = await import("../src/game/game");

    const ctx = new FakeCtx() as any;
    const g = new Game(ctx, 1280, 720, { mode: "single", username: "Test", shouldContinue: true });
    await g.start();

    for (let i = 0; i < 5; i++) {
      (g as any).dt = 0.016;
      (g as any).update();
      (g as any).draw();
    }

    g["newRun"]();
    expect(g.state).toBe("PLAYING");

    g.input.mouseDown.add(0);
    for (let i = 0; i < 30; i++) {
      (g as any).dt = 0.016;
      (g as any).update();
      (g as any).draw();
    }
    g.input.mouseDown.delete(0);

    g.state = "PAUSED" as any;
    (g as any).draw();

    g.state = "SHOP" as any;
    (g as any).draw();

    g.state = "PLAYING" as any;
    g["doAction"]("shop");
    (g as any).draw();

    g.player!.pendingLevels = 1;
    (g as any).update();
    (g as any).draw();
    if (g.upgradeChoices.length > 0) {
      g["doAction"](`upgrade:${g.upgradeChoices[0]}`);
    }

    g.player!.dead = true;
    (g as any).update();
    (g as any).draw();
  });
});