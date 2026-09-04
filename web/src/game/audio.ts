// src/game/audio.ts
// Complete Audio Manager with preloading, sound pooling, spatial audio, and music transitions.

import type { Vec } from "./vec";
import type { IGame } from "./types";

const SFX_MAP: Record<string, string> = {
  // Existing SFX mapping
  "shoot": "weapons/pistol/shoot.wav",
  "shotgun": "weapons/shotgun/shoot.wav",
  "smg": "weapons/smg/shoot.wav",
  "rifle": "weapons/rifle/shoot.wav",
  "sniper": "weapons/sniper/shoot.wav",
  "reload": "player/reload.wav",
  "zombie_hit": "enemy/hit.wav",
  "zombie_die": "enemy/death.wav",
  "player_hit": "player/damage.wav",
  "explosion": "impacts/bullet_hit_enemy.wav",
  "click": "ui/click.wav",
  "levelup": "player/levelup.wav",
  "buy": "ui/purchase.wav",
  "pickup": "player/pickup.wav",
  "boss_roar": "enemy/boss_spawn.wav",

  // Weapon states
  "weapon.pistol.shoot": "weapons/pistol/shoot.wav",
  "weapon.pistol.reload": "weapons/pistol/reload.wav",
  "weapon.pistol.empty": "weapons/pistol/empty.wav",
  "weapon.smg.shoot": "weapons/smg/shoot.wav",
  "weapon.smg.reload": "weapons/smg/reload.wav",
  "weapon.smg.empty": "weapons/smg/empty.wav",
  "weapon.rifle.shoot": "weapons/rifle/shoot.wav",
  "weapon.rifle.reload": "weapons/rifle/reload.wav",
  "weapon.rifle.empty": "weapons/rifle/empty.wav",
  "weapon.shotgun.shoot": "weapons/shotgun/shoot.wav",
  "weapon.shotgun.reload": "weapons/shotgun/reload.wav",
  "weapon.shotgun.pump": "weapons/shotgun/pump.wav",
  "weapon.shotgun.empty": "weapons/shotgun/empty.wav",
  "weapon.sniper.shoot": "weapons/sniper/shoot.wav",
  "weapon.sniper.reload": "weapons/sniper/reload.wav",
  "weapon.sniper.bolt": "weapons/sniper/bolt.wav",
  "weapon.sniper.empty": "weapons/sniper/empty.wav",
  "weapon.flamethrower.shoot": "weapons/smg/shoot.wav",
  "weapon.flamethrower.reload": "weapons/smg/reload.wav",
  "weapon.flamethrower.empty": "weapons/smg/empty.wav",
  "weapon.plasma.shoot": "weapons/rifle/shoot.wav",
  "weapon.plasma.reload": "weapons/rifle/reload.wav",
  "weapon.plasma.empty": "weapons/rifle/empty.wav",
  "weapon.crossbow.shoot": "weapons/sniper/bolt.wav",
  "weapon.crossbow.reload": "weapons/sniper/reload.wav",
  "weapon.crossbow.empty": "weapons/sniper/empty.wav",

  // UI SFX
  "ui.click": "ui/click.wav",
  "ui.hover": "ui/hover.wav",
  "ui.back": "ui/back.wav",
  "ui.pause_open": "ui/pause_open.wav",
  "ui.pause_close": "ui/pause_close.wav",
  "ui.tab_switch": "ui/tab_switch.wav",
  "ui.slider_change": "ui/slider_change.wav",
  "ui.purchase": "ui/purchase.wav",
  "ui.purchase_failed": "ui/purchase_failed.wav",
  "ui.equip": "ui/equip.wav",
  "ui.save": "ui/save.wav",
  "ui.load": "ui/load.wav",
  "ui.notification": "ui/notification.wav",
  "ui.error": "ui/error.wav",
  "ui.confirmation": "ui/confirmation.wav",

  // Impacts SFX
  "impact.enemy": "impacts/bullet_hit_enemy.wav",
  "impact.wall": "impacts/bullet_hit_wall.wav",
  "impact.metal": "impacts/bullet_hit_metal.wav",
  "impact.ground": "impacts/bullet_hit_ground.wav",
  "impact.crit": "impacts/critical_hit.wav",
  "impact.death": "impacts/enemy_death.wav",

  // Player SFX
  "player.damage": "player/damage.wav",
  "player.death": "player/death.wav",
  "player.heal": "player/heal.wav",
  "player.pickup": "player/pickup.wav",
  "player.levelup": "player/levelup.wav",
  "player.dash": "player/dash.wav",
  "player.ability": "player/ability.wav",
  "player.lowhp": "player/lowhp.wav",
  "player.footstep1": "player/footstep1.wav",
  "player.footstep2": "player/footstep2.wav",

  // Enemy SFX
  "enemy.spawn": "enemy/spawn.wav",
  "enemy.alert": "enemy/alert.wav",
  "enemy.attack": "enemy/attack.wav",
  "enemy.hit": "enemy/hit.wav",
  "enemy.death": "enemy/death.wav",
  "enemy.boss_spawn": "enemy/boss_spawn.wav",
  "enemy.boss_death": "enemy/boss_death.wav",

  // Wave Manager
  "wave.start": "ui/notification.wav",
  "wave.complete": "ui/confirmation.wav",
  "wave.warning": "enemy/boss_spawn.wav",
  "wave.boss": "enemy/boss_spawn.wav"
};

const MUSIC_MAP: Record<string, string> = {
  "menu": "music/menu.ogg",
  "gameplay": "music/gameplay.ogg",
  "boss": "music/boss.ogg",
  "pause": "music/pause.ogg"
};

// Sound-specific multipliers to balance audio mix
const SFX_INDIVIDUAL_VOLUME: Record<string, number> = {
  "shoot": 0.5,
  "shotgun": 0.7,
  "smg": 0.45,
  "rifle": 0.5,
  "sniper": 0.7,
  "reload": 0.4,
  "click": 0.35,
  "hover": 0.2,
  "zombie_hit": 0.4,
  "zombie_die": 0.45,
  "player_hit": 0.6,
  "explosion": 0.8,
  "levelup": 0.6,
  "buy": 0.5,
  "pickup": 0.45,
  "boss_roar": 0.7
};

export class AudioManager {
  ctx: AudioContext | null = null;
  game: IGame | null = null;

  master = 0.8;
  musicVolume = 0.6;
  sfxVolume = 0.8;
  sfxMuted = false;

  private bufferCache: Map<string, AudioBuffer> = new Map();
  private activeSFXCount: Map<string, number> = new Map();
  private activeReloadSounds: Map<string, AudioBufferSourceNode> = new Map();

  // Nodes for real-time control
  private masterGainNode: GainNode | null = null;
  private sfxGainNode: GainNode | null = null;
  private musicGainNode: GainNode | null = null;

  // Music state
  private currentMusicSource: AudioBufferSourceNode | null = null;
  private currentMusicGainNode: GainNode | null = null;
  private currentMusicName: string | null = null;

  ensureContext() {
    if (this.ctx) return;
    if (typeof window === "undefined") return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      
      this.masterGainNode = this.ctx.createGain();
      this.masterGainNode.connect(this.ctx.destination);

      this.sfxGainNode = this.ctx.createGain();
      this.sfxGainNode.connect(this.masterGainNode);

      this.musicGainNode = this.ctx.createGain();
      this.musicGainNode.connect(this.masterGainNode);

      this.updateNodeVolumes();
      
      // Auto-unlock events
      const unlock = () => {
        this.unlockAudioContext();
      };
      window.addEventListener("click", unlock, { once: true });
      window.addEventListener("keydown", unlock, { once: true });
      window.addEventListener("mousedown", unlock, { once: true });
      window.addEventListener("pointerdown", unlock, { once: true });
      window.addEventListener("touchstart", unlock, { once: true });

      // Start preloading critical assets in background
      void this.preloadAudio();
    } catch (e) {
      console.error("Failed to initialize AudioContext:", e);
      this.ctx = null;
    }
  }

  unlockAudioContext() {
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(e => console.error("Failed to resume AudioContext:", e));
    }
  }

  load(master: number, music: number, sfx: number) {
    this.master = master;
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.updateNodeVolumes();
  }

  setVolumes(master: number, music: number, sfx: number) {
    this.load(master, music, sfx);
  }

  setMasterVolume(val: number) {
    this.master = Math.max(0, Math.min(1, val));
    this.updateNodeVolumes();
  }

  setMusicVolume(val: number) {
    this.musicVolume = Math.max(0, Math.min(1, val));
    this.updateNodeVolumes();
  }

  setSFXVolume(val: number) {
    this.sfxVolume = Math.max(0, Math.min(1, val));
    this.updateNodeVolumes();
  }

  setSfxMuted(muted: boolean) {
    this.sfxMuted = !!muted;
    this.updateNodeVolumes();
  }

  mute() {
    this.setSfxMuted(true);
  }

  unmute() {
    this.setSfxMuted(false);
  }

  private updateNodeVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.masterGainNode) {
      this.masterGainNode.gain.setValueAtTime(this.sfxMuted ? 0 : this.master, t);
    }
    if (this.sfxGainNode) {
      this.sfxGainNode.gain.setValueAtTime(this.sfxVolume, t);
    }
    if (this.musicGainNode) {
      this.musicGainNode.gain.setValueAtTime(this.musicVolume, t);
    }
  }

  async preloadAudio(): Promise<void> {
    const critical = [
      "shoot", "shotgun", "smg", "rifle", "sniper", "reload",
      "zombie_hit", "zombie_die", "player_hit", "click", "buy", "pickup"
    ];
    await Promise.all(critical.map(name => this.loadSound(name)));
  }

  private async loadSound(name: string): Promise<AudioBuffer | null> {
    if (this.bufferCache.has(name)) return this.bufferCache.get(name)!;
    const path = SFX_MAP[name] || MUSIC_MAP[name];
    if (!path) return null;

    try {
      const response = await fetch(`/audio/${path}`);
      const arrayBuffer = await response.arrayBuffer();
      if (!this.ctx) return null;
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.bufferCache.set(name, audioBuffer);
      return audioBuffer;
    } catch (e) {
      console.error(`Failed to load audio: ${name} from /audio/${path}`, e);
      return null;
    }
  }

  // play() wrapper for backwards compatibility
  play(name: string, pos?: Vec): void {
    this.playSFX(name, pos);
  }

  async playSFX(name: string, pos?: Vec): Promise<void> {
    this.ensureContext();
    if (!this.ctx) return;
    if (this.sfxMuted || this.master <= 0 || this.sfxVolume <= 0) return;

    // Spatial Attenuation
    let distanceVolume = 1.0;
    if (pos && this.game && this.game.player) {
      const pPos = this.game.player.pos;
      const dist = Math.hypot(pos.x - pPos.x, pos.y - pPos.y);
      const maxHearingDistance = 1200;
      if (dist > maxHearingDistance) return; // Silent if too far
      distanceVolume = Math.max(0, 1 - dist / maxHearingDistance);
    }

    const buffer = await this.loadSound(name);
    if (!buffer) return;

    // Sound Pooling
    const isGunshot = name.includes("shoot") || ["shoot", "smg", "rifle", "shotgun", "sniper"].includes(name);
    const isImpact = name.includes("hit") || name.includes("impact") || name.includes("explosion");
    const category = isGunshot ? "gunshot" : isImpact ? "impact" : "other";

    const count = this.activeSFXCount.get(category) || 0;
    const maxLimit = category === "gunshot" ? 8 : category === "impact" ? 10 : 5;
    if (count >= maxLimit) return; // Cap reached, discard play request

    this.activeSFXCount.set(category, count + 1);

    const ctx = this.ctx;
    const t0 = ctx.currentTime;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Random Pitch Variation (±3~5%) for weapons/impacts to avoid repetition
    if (isGunshot || isImpact) {
      const randomPitch = 0.95 + Math.random() * 0.10; // ±5% pitch
      source.playbackRate.setValueAtTime(randomPitch, t0);
    }

    // Individual sound balance & random volume variation
    const baseMult = SFX_INDIVIDUAL_VOLUME[name] ?? 0.8;
    const randomVol = isGunshot || isImpact ? 0.95 + Math.random() * 0.10 : 1.0; // ±5% volume
    const individualVolume = baseMult * randomVol;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(individualVolume * distanceVolume, t0);

    source.connect(gainNode).connect(this.sfxGainNode!);
    source.start(t0);

    source.onended = () => {
      const current = this.activeSFXCount.get(category) || 0;
      this.activeSFXCount.set(category, Math.max(0, current - 1));
      
      // Clean up connections
      try {
        source.disconnect();
        gainNode.disconnect();
      } catch (e) {
        // Already disconnected
      }
    };

    // Track reload sounds to allow cancellation
    if (name.includes("reload")) {
      const parts = name.split(".");
      const weaponId = parts[1] || "generic";
      // Cancel previous reload sound for this weapon
      const prev = this.activeReloadSounds.get(weaponId);
      if (prev) {
        try { prev.stop(); } catch (e) {}
      }
      this.activeReloadSounds.set(weaponId, source);
    }
  }

  cancelReloadSound(weaponId: string) {
    const source = this.activeReloadSounds.get(weaponId);
    if (source) {
      try {
        source.stop();
      } catch (e) {
        // Already stopped or not playing
      }
      this.activeReloadSounds.delete(weaponId);
    }
  }

  async playMusic(name: string): Promise<void> {
    this.ensureContext();
    if (!this.ctx) return;

    const path = MUSIC_MAP[name];
    if (!path) return;

    // If the same music is already playing, do nothing
    if (this.currentMusicName === name) return;
    this.currentMusicName = name;

    const buffer = await this.loadSound(name);
    if (!buffer) return;

    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const fadeTime = 0.3; // 300ms transition

    // Fade out previous music
    if (this.currentMusicGainNode && this.currentMusicSource) {
      const oldGainNode = this.currentMusicGainNode;
      const oldSourceNode = this.currentMusicSource;
      
      oldGainNode.gain.setValueAtTime(oldGainNode.gain.value, t0);
      oldGainNode.gain.linearRampToValueAtTime(0, t0 + fadeTime);
      
      setTimeout(() => {
        try {
          oldSourceNode.stop();
          oldSourceNode.disconnect();
          oldGainNode.disconnect();
        } catch (e) {
          // Ignore
        }
      }, fadeTime * 1000 + 50);
    }

    // Start new music
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, t0);
    gainNode.gain.linearRampToValueAtTime(1.0, t0 + fadeTime);

    source.connect(gainNode).connect(this.musicGainNode!);
    source.start(t0);

    this.currentMusicSource = source;
    this.currentMusicGainNode = gainNode;
  }

  startMusic(): void {
    if (this.game && this.game.state === "PLAYING") {
      void this.playMusic("gameplay");
    } else {
      void this.playMusic("menu");
    }
  }

  stopMusic(): void {
    this.currentMusicName = null;
    if (this.currentMusicSource) {
      try {
        this.currentMusicSource.stop();
        this.currentMusicSource.disconnect();
      } catch (e) {}
      this.currentMusicSource = null;
    }
    if (this.currentMusicGainNode) {
      try {
        this.currentMusicGainNode.disconnect();
      } catch (e) {}
      this.currentMusicGainNode = null;
    }
  }

  pauseMusic(): void {
    if (this.musicGainNode && this.ctx) {
      const t = this.ctx.currentTime;
      this.musicGainNode.gain.setValueAtTime(this.musicGainNode.gain.value, t);
      this.musicGainNode.gain.linearRampToValueAtTime(0, t + 0.2);
    }
  }

  resumeMusic(): void {
    if (this.musicGainNode && this.ctx) {
      const t = this.ctx.currentTime;
      this.musicGainNode.gain.setValueAtTime(this.musicGainNode.gain.value, t);
      this.musicGainNode.gain.linearRampToValueAtTime(this.musicVolume, t + 0.2);
    }
  }

  getActiveSoundCount(): number {
    let sum = 0;
    for (const val of this.activeSFXCount.values()) {
      sum += val;
    }
    return sum;
  }
}
