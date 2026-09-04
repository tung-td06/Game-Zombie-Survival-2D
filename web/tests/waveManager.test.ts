// tests/waveManager.test.ts
import { describe, test, expect, vi } from "vitest";
import { WaveManager } from "@/game/waveManager";
import { FIRST_BOSS_WAVE, BASE_WAVE_SIZE, WAVE_SIZE_GROWTH } from "@/game/settings";

function makeGame(night = 0) {
  return {
    zombies: [] as unknown[],
    player: { coins: 0, addXp: vi.fn() },
    spawner: { pickType: () => "normal", spawnPosition: () => ({ x: 0, y: 0 }) },
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

  test("wave 5 boss wave (31 zombies) transitions correctly to wave 6", () => {
    const w = new WaveManager();
    w.wave = 5;
    w.state = "active";
    w.to_spawn = 0;
    w.bossAlive = true;
    w.bossSpawnedThisWave = true;
    const g = makeGame();

    // All 31 zombies cleared
    w.update(0.1, g);
    expect(w.state).toBe("intermission");
    expect(w.bossAlive).toBe(false);

    // Intermission completes -> Wave 6
    w.update(5.1, g);
    expect(w.state).toBe("active");
    expect(w.wave).toBe(6);
    expect(w.bossSpawnedThisWave).toBe(false);
  });
});
