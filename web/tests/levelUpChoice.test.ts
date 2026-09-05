// tests/levelUpChoice.test.ts
// Level-up offer: three randomly rolled skills (one per skill-tree branch),
// with a countdown that swallows the stray clicks of a player still shooting.
import { describe, test, expect, vi, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { LEVELUP_PICK_LOCK, SKILL_BRANCHES, branchForSkill } from "@/game/upgrade";

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

let GameCtor: any;

beforeAll(async () => {
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
  GameCtor = (await import("../src/game/game")).Game;
});

/** A fresh game already running a new run. */
async function newGame() {
  const g = new GameCtor(new FakeCtx() as any, 1280, 720, {
    mode: "single",
    username: "Test",
    shouldContinue: false,
  });
  await g.start();
  g["newRun"]();
  g.state = "PLAYING";
  return g;
}

/** Advance `seconds` of update()+draw() frames at a fixed step. */
function tick(g: any, seconds: number, step = 0.05) {
  for (let t = 0; t < seconds; t += step) {
    g.dt = step;
    g.update();
    g.draw();
  }
}

/** Level the player up once and let the game open the level-up overlay. */
function levelUp(g: any, levels = 1) {
  g.player.pendingLevels = levels;
  g.player.skillPoints = levels;
  tick(g, 0.05);
}

const pickActions = (g: any) =>
  g.currentButtons
    .map((b: any) => b.action as string)
    .filter((a: string) => a.startsWith("upgrade:"));

describe("level-up skill choice", () => {
  test("a level-up offers one random skill per branch", async () => {
    const g = await newGame();
    levelUp(g);

    expect(g.state).toBe("UPGRADE");
    expect(g.upgradeChoices).toHaveLength(SKILL_BRANCHES.length);
    expect(new Set(g.upgradeChoices).size).toBe(SKILL_BRANCHES.length);
    expect(g.upgradeChoices.map((uid: string) => branchForSkill(uid)?.name)).toEqual(
      SKILL_BRANCHES.map((b) => b.name),
    );
  });

  test("clicks are ignored during the countdown, then accepted", async () => {
    const g = await newGame();
    levelUp(g);
    const uid = g.upgradeChoices[0];
    expect(g.levelUpLockTimer).toBeGreaterThan(0);

    // The panel exposes no clickable skill while locked, so a stray click from
    // combat hits nothing at all.
    g.draw();
    expect(pickActions(g)).toEqual([]);

    // Even a synthesised action is refused mid-countdown.
    g["doAction"](`upgrade:${uid}`);
    expect(g.state).toBe("UPGRADE");
    expect(g.player.upgradeLevels[uid] ?? 0).toBe(0);

    tick(g, LEVELUP_PICK_LOCK + 0.2);
    expect(g.levelUpLockTimer).toBe(0);
    expect(pickActions(g).sort()).toEqual(
      g.upgradeChoices.map((u: string) => `upgrade:${u}`).sort(),
    );

    g["doAction"](`upgrade:${uid}`);
    expect(g.player.upgradeLevels[uid]).toBe(1);
    expect(g.state).toBe("PLAYING");
    expect(g.player.pendingLevels).toBe(0);
    expect(g.upgradeChoices).toEqual([]);
  });

  test("the overlay waits forever — it can't be dismissed without choosing", async () => {
    const g = await newGame();
    levelUp(g);
    tick(g, LEVELUP_PICK_LOCK + 30);

    expect(g.state).toBe("UPGRADE");
    g["doAction"]("upgrade_done");
    expect(g.state).toBe("UPGRADE");
    g.handleEvent({ type: "keydown", code: "Escape", repeat: false, preventDefault() {} } as any);
    expect(g.state).toBe("UPGRADE");

    g["doAction"](`upgrade:${g.upgradeChoices[1]}`);
    expect(g.state).toBe("PLAYING");
  });

  test("only the three rolled skills can be picked", async () => {
    const g = await newGame();
    levelUp(g);
    tick(g, LEVELUP_PICK_LOCK + 0.2);

    const offered: string[] = g.upgradeChoices;
    const outsider = SKILL_BRANCHES.flatMap((b) => b.skills).find(
      (uid) => !offered.includes(uid),
    )!;
    g["doAction"](`upgrade:${outsider}`);
    expect(g.player.upgradeLevels[outsider] ?? 0).toBe(0);
    expect(g.state).toBe("UPGRADE");
  });

  test("stacked level-ups roll a fresh offer and re-arm the countdown", async () => {
    const g = await newGame();
    levelUp(g, 2);
    tick(g, LEVELUP_PICK_LOCK + 0.2);

    g["doAction"](`upgrade:${g.upgradeChoices[0]}`);
    // Still choosing: one level remains, and the lock is armed again.
    expect(g.state).toBe("UPGRADE");
    expect(g.player.pendingLevels).toBe(1);
    expect(g.levelUpLockTimer).toBe(LEVELUP_PICK_LOCK);
    expect(g.upgradeChoices).toHaveLength(SKILL_BRANCHES.length);

    tick(g, LEVELUP_PICK_LOCK + 0.2);
    g["doAction"](`upgrade:${g.upgradeChoices[0]}`);
    expect(g.state).toBe("PLAYING");
    expect(g.player.pendingLevels).toBe(0);
  });

  test("the skill tree opened from pause still browses freely", async () => {
    const g = await newGame();
    g.state = "PAUSED";
    g["doAction"]("skill_tree");
    expect(g.state).toBe("UPGRADE");
    expect(g.upgradeChoices).toEqual([]);
    expect(g.levelUpLockTimer).toBe(0);

    g.draw();
    // Every skill in the tree is clickable, not just three.
    expect(pickActions(g).length).toBe(SKILL_BRANCHES.flatMap((b) => b.skills).length);

    g["doAction"]("upgrade_done");
    expect(g.state).toBe("PAUSED");
  });
});
