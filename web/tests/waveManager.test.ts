// tests/waveManager.test.ts
import { describe, test, expect, vi, afterEach } from "vitest";
import { WaveManager } from "@/game/waveManager";
import {
  FIRST_BOSS_WAVE,
  BASE_WAVE_SIZE,
  WAVE_SIZE_GROWTH,
} from "@/game/settings";

// Minimal zombie catalog — enough for the spawn loop to run and the boss
// block to resolve the kind it wants (abomination / necromancer_boss).
const zombieData: Record<string, { radius: number }> = {
  normal: { radius: 12 },
  fast: { radius: 12 },
  crawler: { radius: 12 },
  boss: { radius: 42 },
  necromancer_boss: { radius: 42 },
};

function makeGame(night = 0) {
  return {
    zombies: [] as unknown[],
    player: { coins: 0, addXp: vi.fn() },
    spawner: {
      pickType: () => "normal",
      spawnPosition: () => ({ x: 0, y: 0 }),
      makeZombie: (kind: string) => ({ KIND: kind, hp: 100 }),
    },
    zombieData,
    map: {},
    audio: { play: vi.fn(), playSFX: vi.fn(), playMusic: vi.fn() },
    wave_announce: vi.fn(),
    nightFactor: () => night,
    toast: vi.fn(),
    save: { data: {}, recordRun: vi.fn() },
    audio_play: vi.fn(),
    score: 0,
    particles: { blood: vi.fn(), deathBurst: vi.fn() },
    bullets: [],
    enemy_bullets: [],
    onZombieKilled: vi.fn(),
  } as unknown as Parameters<WaveManager["update"]>[1];
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Drive the active spawner until the wave has spawned everything it can. */
function drainWave(w: WaveManager, g: ReturnType<typeof makeGame>, maxIters = 5000) {
  let iters = 0;
  while (w.to_spawn > 0 && iters < maxIters) {
    w.spawnTimer = 0;
    w.update(0.016, g);
    iters++;
  }
  return iters;
}

describe("WaveManager", () => {
  test("sizes grow with wave", () => {
    const w = new WaveManager();
    expect(w.waveSize).toBe(BASE_WAVE_SIZE);
    w.wave = 6;
    expect(w.waveSize).toBe(BASE_WAVE_SIZE + 5 * WAVE_SIZE_GROWTH);
  });

  test("isBossWave true from FIRST_BOSS_WAVE on every wave", () => {
    const w = new WaveManager();
    w.wave = 1;
    expect(w.isBossWave).toBe(false);
    w.wave = FIRST_BOSS_WAVE - 1;
    expect(w.isBossWave).toBe(false);
    w.wave = FIRST_BOSS_WAVE;
    expect(w.isBossWave).toBe(true);
    w.wave = FIRST_BOSS_WAVE + 1;
    expect(w.isBossWave).toBe(true);
    w.wave = 30;
    expect(w.isBossWave).toBe(true);
  });

  test("starts in intermission then moves to active", () => {
    const w = new WaveManager();
    const g = makeGame();
    w.timer = 0.1;
    w.update(0.2, g);
    expect(w.state).toBe("active");
    expect(w.wave).toBe(1);
  });

  test("cleared wave -> intermission + reward", () => {
    const w = new WaveManager();
    w.wave = 1;
    w.state = "active";
    w.to_spawn = 0;
    const g = makeGame();
    w.update(0.1, g);
    expect(w.state).toBe("intermission");
    expect((g.player!.coins as number) >= 50).toBe(true);
  });

  test("wave 5 boss wave transitions correctly to wave 6", () => {
    const w = new WaveManager();
    w.wave = 5;
    w.state = "active";
    w.to_spawn = 0;
    w.bossAlive = true;
    w.bossSpawnedThisWave = true;
    const g = makeGame();

    // All wave-5 enemies cleared
    w.update(0.1, g);
    expect(w.state).toBe("intermission");
    expect(w.bossAlive).toBe(false);

    // Intermission completes -> Wave 6
    w.update(5.1, g);
    expect(w.state).toBe("active");
    expect(w.wave).toBe(6);
    expect(w.bossSpawnedThisWave).toBe(false);
  });

  test("wave total is decided once and never recomputed mid-wave", () => {
    const w = new WaveManager();
    const g = makeGame();
    w.wave = 4;
    w.state = "intermission";
    w.timer = 0.01;
    w.update(0.02, g); // startNext -> wave 5 (modifier "none": 5 % 7 !== 0)

    expect(w.state).toBe("active");
    const total = w.waveTotalEnemies;
    expect(total).toBe(BASE_WAVE_SIZE + 4 * WAVE_SIZE_GROWTH);
    expect(w.to_spawn).toBe(total);
    expect(w.spawned_this_wave).toBe(0);

    // Run a bunch of frames: the total must stay fixed and the invariant
    // spawned + to_spawn == total must hold at every step.
    for (let i = 0; i < 30; i++) {
      w.update(0.1, g);
      expect(w.waveTotalEnemies).toBe(total);
      expect(w.spawned_this_wave + w.to_spawn).toBe(total);
      expect(w.spawned_this_wave).toBeLessThanOrEqual(total);
    }
  });

  test("swarm modifier is baked in exactly once at wave start", () => {
    // Force the wave-7 modifier roll to pick "swarm" (opts[1]):
    // floor(random * 6) === 1 -> random in [1/6, 2/6).
    vi.spyOn(Math, "random").mockReturnValue(0.2);
    const w = new WaveManager();
    const g = makeGame();
    w.wave = 6;
    w.state = "intermission";
    w.timer = 0.01;
    w.update(0.02, g); // startNext -> wave 7, modifier "swarm"

    expect(w.modifier).toBe("swarm");
    const base = BASE_WAVE_SIZE + 6 * WAVE_SIZE_GROWTH;
    expect(w.waveTotalEnemies).toBe(Math.floor(base * 1.7));
    expect(w.to_spawn).toBe(w.waveTotalEnemies);

    // Drain the whole wave: the multiplier is never re-applied, so the total
    // never grows past the single baked-in value.
    drainWave(w, g);
    expect(w.spawned_this_wave).toBe(w.waveTotalEnemies);
    expect(w.to_spawn).toBe(0);
    expect(w.spawned_this_wave).toBeLessThanOrEqual(w.waveTotalEnemies);
  });

  test("boss is counted inside the wave total — spawn never exceeds the limit", () => {
    const w = new WaveManager();
    const g = makeGame();
    w.wave = 4;
    w.state = "intermission";
    w.timer = 0.01;
    w.update(0.02, g); // startNext -> wave 5 (boss wave, modifier "none")

    expect(w.isBossWave).toBe(true);
    const total = w.waveTotalEnemies;

    // Spawn the whole wave (the boss may spawn early — it consumes one of
    // the fixed slots either way). The total must never be exceeded and
    // exactly one boss must exist among the spawned zombies.
    drainWave(w, g);
    expect(w.bossSpawnedThisWave).toBe(true);
    expect(w.to_spawn).toBe(0);
    expect(w.spawned_this_wave).toBe(total);
    expect(g.zombies.length).toBe(total); // 29 regular + 1 boss = 30, never 31
    const bosses = g.zombies.filter((z) => (z as { KIND: string }).KIND !== "normal");
    expect(bosses.length).toBe(1);
    expect((bosses[0] as { KIND: string }).KIND).toBe("boss"); // ABOMINATION
  });

  test("wave only completes when spawned == total and alive == 0", () => {
    const w = new WaveManager();
    const g = makeGame();
    w.wave = 4;
    w.state = "intermission";
    w.timer = 0.01;
    w.update(0.02, g); // wave 5 active

    // Spawn everything (incl. boss), but zombies are still alive.
    drainWave(w, g);
    w.spawnTimer = 0;
    w.update(0.016, g);
    expect(w.state).toBe("active"); // alive enemies remain -> not completed

    // Kill all zombies -> wave completes.
    g.zombies = [];
    w.update(0.016, g);
    expect(w.state).toBe("intermission");
    expect(w.to_spawn).toBe(0);
  });
});