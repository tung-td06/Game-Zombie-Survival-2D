// src/game/waveManager.ts
// WaveManager: phase machine + scaling + boss waves.

import {
  BASE_WAVE_SIZE,
  BOSS_EVERY_N_WAVES,
  DAMAGE_GROWTH_PER_WAVE,
  HP_GROWTH_PER_WAVE,
  MAX_ALIVE_ZOMBIES,
  NIGHT_SPAWN_MULT,
  SPEED_GROWTH_PER_WAVE,
  WAVE_INTERMISSION,
  WAVE_SIZE_GROWTH,
} from "./settings";
import { createZombie, type Zombie } from "./zombie";
import type { ZombieData } from "./data";
import type { IGame } from "./types";

export class WaveManager {
  wave = 0;
  state: "intermission" | "active" = "intermission";
  timer = 3;
  to_spawn = 0;
  spawned_this_wave = 0;
  spawnTimer = 0;
  spawnInterval = 1.5;
  hpMult = 1;
  speedMult = 1;
  dmgMult = 1;
  bossAlive = false;

  get waveSize(): number {
    return BASE_WAVE_SIZE + Math.max(0, this.wave - 1) * WAVE_SIZE_GROWTH;
  }

  private applyScaling(): void {
    const w = Math.max(0, this.wave - 1);
    this.hpMult = 1 + HP_GROWTH_PER_WAVE * w;
    this.speedMult = 1 + SPEED_GROWTH_PER_WAVE * w;
    this.dmgMult = 1 + DAMAGE_GROWTH_PER_WAVE * w;
    this.spawnInterval = Math.max(0.25, 1.5 - this.wave * 0.08);
  }

  get isBossWave(): boolean {
    return this.wave > 0 && this.wave % BOSS_EVERY_N_WAVES === 0;
  }

  update(dt: number, game: IGame): void {
    if (this.state === "intermission") {
      this.timer -= dt;
      if (this.timer <= 0) this.startNext(game);
    } else {
      this.updateActive(dt, game);
    }
  }

  private startNext(game: IGame): void {
    this.wave += 1;
    this.state = "active";
    this.applyScaling();
    this.to_spawn = this.waveSize;
    this.spawned_this_wave = 0;
    this.spawnTimer = 0.5;
    this.bossAlive = false;
    game.wave_announce?.(`WAVE ${this.wave}`, this.isBossWave);
    game.audio.playSFX(this.isBossWave ? "wave.boss" : "wave.start");
    if (this.isBossWave) {
      game.audio.playMusic("boss");
    } else {
      game.audio.playMusic("gameplay");
    }
  }

  private updateActive(dt: number, game: IGame): void {
    const nightMult = 1 + (NIGHT_SPAWN_MULT - 1) * game.nightFactor();
    this.spawnTimer -= dt * nightMult;
    const aliveOk = game.zombies.length < MAX_ALIVE_ZOMBIES;
    const data = (game as unknown as { zombieData: Record<string, ZombieData> })
      .zombieData;
    while (this.spawnTimer <= 0 && this.to_spawn > 0 && aliveOk && data) {
      const kind = game.spawner.pickType(this.wave);
      const pos = game.spawner.spawnPosition(game.player!.pos, game.map!);
      if (pos) {
        const z: Zombie = game.spawner.makeZombie(
          kind,
          pos,
          data,
          this.wave,
          game.nightFactor(),
        );
        game.zombies.push(z);
        this.to_spawn -= 1;
        this.spawned_this_wave += 1;
        this.spawnTimer += this.spawnInterval;
      } else {
        this.spawnTimer += 0.4;
      }
    }
    if (
      this.isBossWave &&
      !this.bossAlive &&
      game.zombies.length < MAX_ALIVE_ZOMBIES &&
      data
    ) {
      const bossRadius = data.boss?.radius ?? 42;
      const pos = game.spawner.spawnPosition(game.player!.pos, game.map!, bossRadius);
      if (pos) {
        const boss = game.spawner.makeZombie(
          "boss",
          pos,
          data,
          this.wave,
          game.nightFactor(),
        );
        game.zombies.push(boss);
        this.bossAlive = true;
        game.audio.playSFX("enemy.boss_spawn", pos);
        game.toast("!! THE ABOMINATION HAS AWAKENED !!");
      }
    }
    if (this.to_spawn === 0 && game.zombies.length === 0) {
      this.bossAlive = false;
      const rewardCoins = 50 + this.wave * 15;
      const rewardXp = 40 + this.wave * 20;
      game.player!.coins += rewardCoins;
      game.player!.addXp(rewardXp, game);
      game.toast(`WAVE ${this.wave} COMPLETE!  +$${rewardCoins}`);
      game.audio.playSFX("wave.complete");
      if (this.isBossWave) {
        // Transition back to normal gameplay music after boss is defeated
        game.audio.playMusic("gameplay");
      }
      this.state = "intermission";
      this.timer = WAVE_INTERMISSION;
    }
  }
}
