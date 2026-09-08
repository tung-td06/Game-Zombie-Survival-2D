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
  rect() {}
  clip() {}
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

  test("NEW GAME starts fully fresh even when an old save is in localStorage", async () => {
    // Seed a stale, advanced profile: money, extra weapons, mods, drone,
    // high level/xp, spent skill tree.
    const ls = {
      _: {
        "zs.save.v1": JSON.stringify({
          high_score: 5000,
          total_kills: 100,
          coins: 999,
          player_level: 25,
          xp: 500,
          unlocked_weapons: ["pistol", "shotgun", "sniper"],
          weapon_upgrades: { shotgun: ["extended_mag"] },
          has_drone: true,
          player_upgrades: { damage: 5 },
          achievements: [],
          quests_claimed: [],
          settings: {
            master_volume: 0.8,
            music_volume: 0.6,
            sfx_volume: 0.8,
            muted: false,
            fullscreen: false,
            show_fps: false,
            resolution_index: 0,
            screen_shake: true,
            damage_numbers: true,
            hit_effects: true,
            footstep_dust: false,
            window_lights: false,
            brightness: 1,
            bindings: {},
          },
        }),
      },
      getItem(k: string) {
        return this._[k] ?? null;
      },
      setItem(k: string, v: string) {
        this._[k] = v;
      },
      removeItem(k: string) {
        delete this._[k];
      },
    } as any;
    (globalThis as any).localStorage = ls;
    (globalThis as any).window = {
      devicePixelRatio: 1,
      innerWidth: 1280,
      innerHeight: 720,
      localStorage: ls,
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
    (globalThis as any).performance = { now: () => Date.now() };

    const { Game } = await import("../src/game/game");
    const ctx = new FakeCtx() as any;
    const g = new Game(ctx, 1280, 720, {
      mode: "single",
      username: "FreshStart",
      shouldContinue: false,
    });
    await g.start();

    // start() auto-runs newRun for a named user; force it again to be sure.
    g["newRun"]();

    const p = g.player!;
    expect(p.coins).toBe(0);
    expect(p.level).toBe(1);
    expect(p.xp).toBe(0);
    expect(p.skillPoints).toBe(0);
    expect(p.hasDrone).toBe(false);
    expect(Object.keys(p.weapons.weapons)).toEqual(["pistol"]);
    expect(p.weapons.currentId).toBe("pistol");
    expect(p.upgradeLevels).toEqual({});
    expect(p.weapons.weapons["pistol"]?.mods ?? []).toEqual([]);

    // The local profile mirror was reset too (run progression fields only).
    const stored = JSON.parse(ls._["zs.save.v1"]);
    expect(stored.coins).toBe(0);
    expect(stored.unlocked_weapons).toEqual(["pistol"]);
    expect(stored.weapon_upgrades).toEqual({});
    expect(stored.has_drone).toBe(false);
    expect(stored.player_level).toBe(1);
    expect(stored.xp).toBe(0);
    // Account-level stats are preserved.
    expect(stored.high_score).toBe(5000);
    expect(stored.total_kills).toBe(100);

    // And the fresh save was pushed to the backend as a NEW GAME reset.
    const newGameFetch = (globalThis as any).fetch.mock.calls.find((c: any[]) => {
      const opts = c[1] ?? {};
      return (
        String(c[0]).includes("/api/game/save") &&
        String(opts.body ?? "").includes("new_game")
      );
    });
    expect(newGameFetch).toBeDefined();
    const body = JSON.parse(newGameFetch![1]?.body ?? "{}");
    expect(body.action).toBe("new_game");
  });
});