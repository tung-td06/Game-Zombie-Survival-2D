// src/game/waveManager.ts
// WaveManager: phase machine + scaling + boss waves.

import {
  BASE_WAVE_SIZE,
  BIOME_EVERY_WAVES,
  BIOMES,
  DAMAGE_GROWTH_PER_WAVE,
  FIRST_BOSS_WAVE,
  HP_GROWTH_PER_WAVE,
  MAX_ALIVE_ZOMBIES,
  MODIFIER_PER_WAVE,
  NIGHT_SPAWN_MULT,
  SPEED_GROWTH_PER_WAVE,
  WAVE_INTERMISSION,
  WAVE_SIZE_GROWTH,
} from "./settings";
import { createZombie, type Zombie } from "./zombie";
import { bossKindForWave } from "./enemyGates";
import type { ZombieData } from "./data";
import type { IGame } from "./types";

export class WaveManager {
  wave = 0;
  state: "intermission" | "active" = "intermission";
  timer = 3;
  /**
   * Fixed per-wave enemy total, decided ONCE when the wave starts and never
   * recomputed/randomised afterwards. `spawned_this_wave + to_spawn` always
   * equals this value for the whole wave. On boss waves the boss consumes one
   * of these slots, so the actual spawn count never exceeds the total.
   */
  waveTotalEnemies = 0;
  to_spawn = 0;
  spawned_this_wave = 0;
  spawnTimer = 0;
  spawnInterval = 1.5;
  hpMult = 1;
  speedMult = 1;
  dmgMult = 1;
  bossAlive = false;
  bossSpawnedThisWave = false;
  modifier: string = "none";
  biome: string = "city";

  get waveSize(): number {
    const base = BASE_WAVE_SIZE + Math.max(0, this.wave - 1) * WAVE_SIZE_GROWTH;
    return this.modifier === "swarm" ? Math.floor(base * 1.7) : base;
  }

  private applyScaling(): void {
    const w = Math.max(0, this.wave - 1);
    this.hpMult = 1 + HP_GROWTH_PER_WAVE * w;
    this.speedMult = 1 + SPEED_GROWTH_PER_WAVE * w;
    this.dmgMult = 1 + DAMAGE_GROWTH_PER_WAVE * w;
    if (this.modifier === "frenzy") this.speedMult *= 1.35;
    if (this.modifier === "blood_moon") {
      this.hpMult *= 1.4;
      this.dmgMult *= 1.25;
    }
    this.spawnInterval = Math.max(0.18, 1.5 - this.wave * 0.08);
    if (this.modifier === "swarm") this.spawnInterval *= 0.55;
  }

  // From FIRST_BOSS_WAVE onward EVERY wave includes a boss.
  get isBossWave(): boolean {
    return this.wave >= FIRST_BOSS_WAVE;
  }

  update(dt: number, game: IGame): void {
    if (this.state === "intermission") {
      this.timer -= dt;
      if (this.timer <= 0) this.startNext(game);
    } else {
      this.updateActive(dt, game);
    }
  }

  private rollModifier(): string {
    if (this.wave <= 1 || this.wave % MODIFIER_PER_WAVE !== 0) return "none";
    const opts = ["blood_moon", "swarm", "frenzy", "fog", "none", "none"];
    return opts[Math.floor(Math.random() * opts.length)]!;
  }

  private startNext(game: IGame): void {
    this.wave += 1;
    this.state = "active";
    this.modifier = this.rollModifier();
    this.biome = BIOMES[
      Math.floor(this.wave / BIOME_EVERY_WAVES) % BIOMES.length
    ]!;
    this.applyScaling();
    // Decide the wave total exactly once, right here. The modifier is rolled
    // above, so the swarm multiplier is baked in a single time; nothing
    // downstream ever recomputes or re-rolls the count.
    this.waveTotalEnemies = this.waveSize;
    this.to_spawn = this.waveTotalEnemies;
    this.spawned_this_wave = 0;
    this.spawnTimer = 0.5;
    this.bossAlive = false;
    this.bossSpawnedThisWave = false;
    console.log(
      `[WAVE] Started Wave ${this.wave} — Total enemies: ${this.waveTotalEnemies}`,
    );
    let banner = `WAVE ${this.wave}`;
    if (this.biome !== "city") banner += ` — ${this.biome.toUpperCase()}`;
    if (this.modifier !== "none") {
      banner += ` — ${this.modifier.toUpperCase().replace(/_/g, " ")}`;
    }
    game.wave_announce?.(banner, this.isBossWave);
    game.audio.playSFX(this.isBossWave ? "wave.boss" : "wave.start");
    if (this.isBossWave) {
      game.audio.playMusic("boss");
    } else {
      game.audio.playMusic("gameplay");
    }
    if (this.modifier === "blood_moon") game.toast("BLOOD MOON: +40% HP, +25% DMG");
    else if (this.modifier === "swarm") game.toast("SWARM: more zombies, faster spawns");
    else if (this.modifier === "frenzy") game.toast("FRENZY: zombies move much faster");
    else if (this.modifier === "fog") game.toast("HEAVY FOG: vision reduced");
  }

  private updateActive(dt: number, game: IGame): void {
    const nightMult = 1 + (NIGHT_SPAWN_MULT - 1) * game.nightFactor();
    this.spawnTimer -= dt * nightMult;
    const aliveOk = game.zombies.length < MAX_ALIVE_ZOMBIES;
    const data = (game as unknown as { zombieData: Record<string, ZombieData> })
      .zombieData;
    while (this.spawnTimer <= 0 && this.to_spawn > 0 && aliveOk && data) {
      // Boss waves: keep the last slot free for the boss until it has
      // spawned, so the boss is counted inside the wave total instead of
      // being an extra zombie beyond the limit.
      if (this.isBossWave && !this.bossSpawnedThisWave && this.to_spawn === 1) {
        break;
      }
      const kind = game.spawner.pickType(this.wave, this.modifier);
      // Validate the spawn spot against the KIND's real body radius (+margin)
      // so big zombies (Brute r25) never materialise clipped into a wall.
      const kindRadius = (data[kind]?.radius ?? 16) + 3;
      const pos = game.spawner.spawnPosition(game.player!.pos, game.map!, kindRadius);
      if (pos) {
        const z: Zombie = game.spawner.makeZombie(
          kind,
          pos,
          data,
          this.wave,
          game.nightFactor(),
          this.modifier,
        );
        game.zombies.push(z);
        this.to_spawn -= 1;
        this.spawned_this_wave += 1;
        console.log(
          `[SPAWN] ${this.spawned_this_wave}/${this.waveTotalEnemies} ${kind}`,
        );
        this.spawnTimer += this.spawnInterval;
      } else {
        this.spawnTimer += 0.4;
      }
    }
    if (
      this.isBossWave &&
      !this.bossSpawnedThisWave &&
      this.to_spawn > 0 &&
      game.zombies.length < MAX_ALIVE_ZOMBIES &&
      data
    ) {
      // From FIRST_BOSS_WAVE every boss wave summons the ABOMINATION; from
      // BOSS_ALT_START_WAVE the two bosses alternate — odd waves summon the
      // NECROMANCER KING, even waves the ABOMINATION.
      const bossKind = bossKindForWave(this.wave);
      const bossData = data[bossKind];
      const bossRadius = bossData?.radius ?? 42;
      const pos = game.spawner.spawnPosition(game.player!.pos, game.map!, bossRadius);
      if (pos) {
        const boss = game.spawner.makeZombie(
          bossKind,
          pos,
          data,
          this.wave,
          game.nightFactor(),
          this.modifier,
        );
        game.zombies.push(boss);
        // The boss consumes one of the wave's fixed slots (it was reserved by
        // the spawn loop above), so spawned + to_spawn still equals the total.
        this.to_spawn -= 1;
        this.spawned_this_wave += 1;
        console.log(
          `[SPAWN] ${this.spawned_this_wave}/${this.waveTotalEnemies} BOSS ${bossKind}`,
        );
        this.bossAlive = true;
        this.bossSpawnedThisWave = true;
        game.audio.playSFX("enemy.boss_spawn", pos);
        game.toast(
          bossKind === "necromancer_boss"
            ? "!! NECROMANCER KING RISES FROM THE DEAD !!"
            : "!! THE ABOMINATION HAS AWAKENED !!",
        );
      }
    }
    if (this.to_spawn === 0 && game.zombies.length === 0) {
      console.log(
        `[WAVE] Spawn complete: ${this.spawned_this_wave}/${this.waveTotalEnemies}`,
      );
      console.log(`[WAVE] Alive enemies: ${game.zombies.length}`);
      console.log(`[WAVE] Wave ${this.wave} completed`);
      this.bossAlive = false;
      let rewardCoins = 50 + this.wave * 15;
      let rewardXp = 40 + this.wave * 20;
      if (this.isBossWave) {
        // Boss-clear bonus (parity with the desktop build).
        rewardCoins += 300;
        rewardXp += 200;
      }
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
