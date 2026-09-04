// src/game/game.ts
// Game orchestrator: state machine, main loop, owns all systems.
// Mirrors game.py.

import { AudioManager } from "./audio";
import { Camera } from "./camera";
import { clearDataCache, loadUpgrades, loadWeapons, loadZombies, type UpgradeCatalog, type WeaponData, type ZombieData } from "./data";
import { AchievementSystem } from "./achievement";
import { InputManager } from "./input";
import { GameMap } from "./map";
import { MenuSystem } from "./menu";
import { ParticleSystem } from "./particle";
import { Player } from "./player";
import { QuestSystem } from "./quest";
import { SaveManager } from "./save";
import { DRONE_PRICE, Shop } from "./shop";
import { UpgradeSystem } from "./upgrade";
import { WaveManager } from "./waveManager";
import { ZombieSpawner } from "./spawner";
import { Bullet } from "./bullet";
import { Loot, dropsFor } from "./loot";
import { SupplyCrate, spawnSupplyCrates, CRATE_SPAWN_INTERVAL } from "./supplyCrate";
import { mulberry32, type Rng } from "../lib/rng";
import { Client } from "./network";
import { WEAPON_ORDER } from "./weapon";
import { createZombie } from "./zombie";
import {
  BIOME_TINT,
  COMBO_KILLS_PER_STEP,
  COMBO_MAX_MULT,
  COMBO_WINDOW,
  DAY_LENGTH,
  FPS,
  MAP_SEED,
  NIGHT_LENGTH,
  NIGHT_TRANSITION,
  RESOLUTIONS,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./settings";
import { isDebug, toggleDebug } from "./debug";
import type { GameState, ToastEntry, WaveBanner, Stats } from "./types";
import { Button, drawCrosshair, drawHud, drawMinimap, drawToasts } from "./ui";
import { hitTest } from "./menu";
import type { Vec } from "./vec";
import { drawPixelLight, type PixelLight } from "./pixelArt";

export const MENU = "MENU";
export const PLAYING = "PLAYING";
export const PAUSED = "PAUSED";
export const PAUSE_SETTINGS = "PAUSE_SETTINGS";
export const PAUSE_CONTROLS = "PAUSE_CONTROLS";
export const PAUSE_LEAVE_CONFIRM = "PAUSE_LEAVE_CONFIRM";
export const PAUSE_SHOP = "PAUSE_SHOP";
export const SHOP = "SHOP";
export const UPGRADE = "UPGRADE";
export const UPGRADE_INFO = "UPGRADE_INFO";
export const SETTINGS = "SETTINGS";
export const GAME_OVER = "GAME_OVER";

export class Game {
  ctx: CanvasRenderingContext2D;
  viewW: number;
  viewH: number;
  scale = 1;
  offsetX = 0;
  offsetY = 0;
  state: GameState = MENU;
  returnState: GameState = MENU;
  inRunContext = false;
  running = true;

  dt = 0;
  last = 0;
  fpsDisplay = 0;
  showFps = false;

  draggingSlider: string | null = null;
  input = new InputManager();
  save = new SaveManager();
  audio = new AudioManager();
  menus = new MenuSystem();
  shop = new Shop({} as Record<string, WeaponData>);
  upgrades: UpgradeSystem = new UpgradeSystem({ upgrades: [], limits: {} });
  spawner = new ZombieSpawner();

  // Per-run
  player: Player | null = null;
  map: GameMap | null = null;
  camera: Camera = new Camera(SCREEN_WIDTH, SCREEN_HEIGHT);
  waveManager: WaveManager = new WaveManager();
  particles = new ParticleSystem();
  quests = new QuestSystem();
  achievements: AchievementSystem = new AchievementSystem([]);

  zombies: import("./zombie").Zombie[] = [];
  bullets: Bullet[] = [];
  enemyBullets: Bullet[] = [];
  loots: Loot[] = [];
  supplyCrates: SupplyCrate[] = [];

  /** Counts down to 0 every CRATE_SPAWN_INTERVAL seconds. */
  crateTimer = CRATE_SPAWN_INTERVAL;

  score = 0;
  combo = 0;
  comboTimer = 0;
  elapsed = 0;
  timeOfDay = 10;
  stats: Stats = {
    kills: 0,
    kills_by_type: {},
    boss_kills: 0,
    survival_time: 0,
    shots_by_weapon: {},
    shots_fired: 0,
    shots_hit: 0,
  };
  toasts: ToastEntry[] = [];
  waveBanner: WaveBanner | null = null;
  newHigh = false;
  upgradeChoices: string[] = [];

  // Data caches
  weaponData: Record<string, WeaponData> = {};
  zombieData: Record<string, ZombieData> = {};
  upgradeCatalog: UpgradeCatalog = { upgrades: [], limits: {} };
  zgrid: Record<string, unknown[]> = {};

  // Active menu buttons (set by menus, consumed by event handler)
  currentButtons: Button[] = [];

  // Asset caches
  assetImages: Map<string, HTMLImageElement> = new Map();

  // Data loader promise (single load)
  dataReady: Promise<void>;
  smokeTest = false;

  // Multiplayer properties
  networkMode: "single" | "host" | "guest" = "single";
  roomCode = "";
  username = "";
  netClient: Client | null = null;
  remotePlayers: Map<string, Player> = new Map();
  lastSnapshotTime = 0;
  saveButtonState: "idle" | "saving" | "success" | "error" = "idle";
  shouldContinue = false;

  constructor(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    opts: {
      smoke?: boolean;
      mode?: "single" | "host" | "guest";
      room?: string;
      username?: string;
      wsUrl?: string;
      shouldContinue?: boolean;
    } = {},
  ) {
    this.ctx = ctx;
    this.viewW = viewW;
    this.viewH = viewH;
    this.smokeTest = !!opts.smoke;

    this.networkMode = opts.mode || "single";
    this.roomCode = opts.room || "";
    this.username = opts.username || `Survivor_${Math.floor(Math.random() * 1000)}`;
    this.shouldContinue = !!opts.shouldContinue;

    const st = this.save.settings;
    this.showFps = !!st.show_fps;
    this.audio.game = this;
    this.audio.load(st.master_volume, st.music_volume, st.sfx_volume);
    this.audio.setSfxMuted(st.muted);
    this.menus.setProfile(this.save.high_score, this.save.total_kills);
    this.achievements = new AchievementSystem(this.save.achievements);
    this.input.loadBindings(st.bindings);
    this.dataReady = this.loadData();

    if (this.networkMode !== "single" && opts.wsUrl) {
      this.netClient = new Client(opts.wsUrl);
      this.netClient.connect();
      this.netClient.onStatus = (status) => {
        if (status === "open" && this.netClient) {
          this.netClient.send({
            type: "join",
            roomCode: this.roomCode,
            username: this.username,
            isHost: this.networkMode === "host",
          });
          this.toast(`CONNECTED TO ROOM ${this.roomCode}`);
        } else if (status === "closed" || status === "error") {
          this.toast("MULTIPLAYER DISCONNECTED");
        }
      };
    }
  }

  private async loadData(): Promise<void> {
    clearDataCache();
    const [w, z, u] = await Promise.all([loadWeapons(), loadZombies(), loadUpgrades()]);
    this.weaponData = w;
    this.zombieData = z;
    this.upgradeCatalog = u;
    this.shop = new Shop(w);
    this.upgrades = new UpgradeSystem(u);
    (this as unknown as { zombieData: Record<string, ZombieData> }).zombieData = z;
  }

  // ----------------------------------------------------------- lifecycle --
  async start() {
    await this.dataReady;
    if (!this.running) return;
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    // Auto-start for multiplayer (host/guest) or when a named user navigates directly to /play
    if (this.networkMode !== "single" || (this.username && this.username !== "Survivor")) {
      if (this.shouldContinue) {
        await this.loadSaveAndStart();
      } else {
        this.newRun();
      }
    } else {
      this.audio.playMusic("menu");
    }
    requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    if (this.netClient) {
      this.netClient.close();
      this.netClient = null;
    }
    this.remotePlayers.clear();
  }

  private loop(now: number) {
    if (!this.running) return;
    // Clamp dt to max 33ms (30 FPS min) — prevents big jumps when tab is inactive
    this.dt = Math.min(1 / 30, (now - this.last) / 1000);
    this.last = now;
    this.fpsDisplay = Math.round(1 / Math.max(0.001, this.dt));
    this.update();
    this.draw();
    this.input.endFrame();
    requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------- events --
  handleEvent(e: Event) {
    this.input.handleEvent(e);
    if (e.type === "keydown") {
      const ke = e as KeyboardEvent;
      const k = ke.code;
      // Ignore browser auto-repeat for Escape specifically — prevents the
      // PLAYING↔PAUSED flicker when the user holds the key.
      if (ke.repeat && k === "Escape") return;
      if (k === "F11") {
        e.preventDefault();
        this.toggleFullscreen();
      } else if (k === "F3") {
        toggleDebug();
      } else if (k === "Escape") {
        if (this.state === PLAYING) {
          this.state = PAUSED;
          this.audio.setSfxMuted(true);
          this.audio.pauseMusic();
          if (typeof document !== "undefined" && document.pointerLockElement) {
            document.exitPointerLock();
          }
        } else if (this.state === PAUSED) {
          this.audio.setSfxMuted(this.save.settings.muted);
          this.audio.resumeMusic();
          this.state = PLAYING;
        } else if (
          this.state === PAUSE_SETTINGS ||
          this.state === PAUSE_CONTROLS ||
          this.state === PAUSE_LEAVE_CONFIRM ||
          this.state === PAUSE_SHOP
        ) {
          this.doAction("pause_back");
        } else if (
          this.state === SETTINGS ||
          this.state === SHOP ||
          this.state === UPGRADE_INFO
        ) {
          this.doAction("back");
        }
      } else if (this.state === UPGRADE) {
        if (k === "Escape") {
          this.doAction("upgrade_done");
        }
      }
    } else if (e.type === "mousedown" && this.state !== PLAYING) {
      const m = e as MouseEvent;
      const b = hitTest(this.currentButtons, m.clientX, m.clientY);
      if (b && b.action) {
        if (b.action.startsWith("slider:")) {
          this.draggingSlider = b.action.slice("slider:".length);
          this.updateSliderFromMouse(m.clientX);
        } else {
          this.doAction(b.action);
        }
      }
    } else if (e.type === "mousemove") {
      if (this.draggingSlider && this.state !== PLAYING) {
        const m = e as MouseEvent;
        this.updateSliderFromMouse(m.clientX);
      }
    } else if (e.type === "mouseup") {
      this.draggingSlider = null;
    }
  }

  updateSliderFromMouse(mx: number) {
    if (!this.draggingSlider) return;
    const key = this.draggingSlider;
    const width = this.viewW;
    const PANEL_W = Math.min(580, width - 40);
    const PANEL_X = (width - PANEL_W) / 2;
    const barX = PANEL_X + 210;
    const barW = PANEL_W - 210 - 120;
    
    const frac = (mx - barX) / barW;
    const val = Math.max(0, Math.min(1, Math.round(frac * 20) / 20));
    
    const st = this.save.settings as unknown as Record<string, any>;
    const prevVal = st[key];
    if (prevVal !== val) {
      st[key] = val;
      this.audio.setVolumes(st["master_volume"], st["music_volume"], st["sfx_volume"]);
      this.save.save();
      if (key !== "music_volume") {
        this.audio.play("click");
      }
    }
  }

  isDebug(): boolean {
    return isDebug();
  }

  toggleFullscreen() {
    const st = this.save.settings;
    st.fullscreen = !st.fullscreen;
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
    this.save.save();
  }

  applyDisplay(): void {
    // Resolution is set via the canvas host (GameCanvas) on resize; this
    // exists to satisfy the IGame interface.
  }

  // ----------------------------------------------------------- update --
  private update() {
    if (this.state === PLAYING) this.updatePlaying(this.dt);
    // Tick toasts always so they fade in menus too
    this.tickToasts(this.dt);
  }

  private updatePlaying(dt: number) {
    if (!this.player) return;
    this.stats.survival_time = (this.stats.survival_time ?? 0) + dt;

    // Handle WebSocket network events if active
    if (this.netClient) {
      const msgs = this.netClient.poll();
      for (const msg of msgs) {
        if (msg.type === "player_joined") {
          this.toast(`${msg.username.toUpperCase()} JOINED THE MATCH`);
        } else if (msg.type === "player_left") {
          this.toast(`${msg.username.toUpperCase()} LEFT THE MATCH`);
          this.remotePlayers.delete(msg.username);
        } else if (msg.type === "host_disconnected") {
          this.toast("HOST DISCONNECTED! GAME OVER");
          this.state = GAME_OVER;
        } else if (msg.type === "input" && this.networkMode === "host") {
          // Sync remote Guest input in Host's authoritative simulation
          let rp = this.remotePlayers.get(msg.username);
          if (!rp) {
            const startPos = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
            rp = new Player(startPos, {
              weaponData: this.weaponData,
              username: msg.username,
            });
            this.remotePlayers.set(msg.username, rp);
          }
          rp.pos = msg.pos;
          rp.angle = msg.aim;
          rp.walkCycle = msg.animCycle;
          rp.hp = msg.hp;
          rp.maxHp = msg.maxHp;
          rp.armor = msg.armor;
          rp.dead = msg.dead;

          if (rp.weapons.current.id !== msg.weaponId) {
            rp.weapons.selectSlot(WEAPON_ORDER.indexOf(msg.weaponId) + 1 || 1);
          }
          rp.weapons.current.ammo = msg.ammo;
          rp.weapons.current.reserve = msg.reserve;

          if (msg.fire && rp.weapons.current.canFire(true)) {
            const muzzle: Vec = {
              x: rp.pos.x + Math.cos(rp.angle) * 24,
              y: rp.pos.y + Math.sin(rp.angle) * 24,
            };
            const shots = rp.weapons.current.fire(
              rp.angle,
              rp.damageMult,
              rp.critBonus,
              rp.critMultBonus,
            );
            rp.weapons.current.cooldown = rp.weapons.current.fireRate / Math.max(0.01, rp.fireRateMult);
            for (const s of shots) {
              const b = new Bullet(
                muzzle,
                s.angle,
                s.speed,
                s.damage,
                "player",
                s.crit,
                s.radius,
                s.lifetime,
                s.elem,
              );
              if (s.elem === "pierce") {
                b.pierceLeft = 3 + (rp.pierceBonus ?? 0);
              }
              this.bullets.push(b);
            }
            this.particles.muzzleFlash(muzzle, rp.angle);
            const sound = rp.weapons.current.id === "shotgun" ? "shotgun" : rp.weapons.current.id === "sniper" ? "sniper" : rp.weapons.current.id === "smg" ? "smg" : rp.weapons.current.id === "rifle" ? "rifle" : "shoot";
            this.audio.play(sound);
          }
        } else if (msg.type === "snapshot" && this.networkMode === "guest") {
          // Sync Host authoritative state in local Guest representation
          this.score = msg.score;
          this.waveManager.wave = msg.wave;
          this.waveManager.state = msg.waveState as any;
          this.waveManager.timer = msg.waveTimer;
          this.timeOfDay = msg.timeOfDay;

          const presentUsernames = new Set<string>();
          for (const sp of msg.players) {
            if (sp.username === this.username) {
              this.player.hp = sp.hp;
              this.player.maxHp = sp.maxHp;
              this.player.armor = sp.armor;
              this.player.dead = sp.dead;
              continue;
            }
            presentUsernames.add(sp.username);
            let rp = this.remotePlayers.get(sp.username);
            if (!rp) {
              rp = new Player(sp.pos, {
                weaponData: this.weaponData,
                username: sp.username,
              });
              this.remotePlayers.set(sp.username, rp);
            }
            rp.pos = sp.pos;
            rp.angle = sp.angle;
            rp.walkCycle = sp.animCycle;
            rp.hp = sp.hp;
            rp.maxHp = sp.maxHp;
            rp.armor = sp.armor;
            rp.dead = sp.dead;
            if (rp.weapons.current.id !== sp.weaponId) {
              rp.weapons.selectSlot(WEAPON_ORDER.indexOf(sp.weaponId) + 1 || 1);
            }
          }
          for (const key of this.remotePlayers.keys()) {
            if (!presentUsernames.has(key)) {
              this.remotePlayers.delete(key);
            }
          }

          this.zombies = msg.zombies.map((sz: any) => {
            const z = createZombie(sz.kind, sz.pos, this.zombieData);
            z.hp = sz.hp;
            z.maxHp = sz.maxHp;
            z.faceAngle = sz.faceAngle;
            z.flash = sz.flash;
            return z;
          });

          this.bullets = msg.bullets.map((sb: any) => {
            const b = new Bullet(sb.pos, sb.angle, 0, 0, "player", sb.crit);
            b.trailA = sb.pos;
            b.trailB = sb.pos;
            return b;
          });

          this.enemyBullets = msg.enemyBullets.map((sb: any) => {
            const b = new Bullet(sb.pos, sb.angle, 0, 0, "enemy");
            b.trailA = sb.pos;
            b.trailB = sb.pos;
            return b;
          });

          this.loots = msg.loots.map((sl: any) => {
            const l = new Loot(sl.pos, sl.kind, sl.amount);
            l.age = sl.age || 0;
            return l;
          });
        }
      }
    }

    if (this.networkMode === "guest") {
      // Guest only runs local player inputs/updates and relays them to Host
      this.player.update(dt, this);
      
      if (this.netClient) {
        this.netClient.send({
          type: "input",
          keys: Array.from(this.input.keysDown),
          mouse: { x: this.input.mouseX, y: this.input.mouseY },
          aim: this.player.angle,
          fire: this.input.mouseHeld,
          pos: this.player.pos,
          animCycle: this.player.walkCycle,
          weaponId: this.player.weapons.current.id,
          ammo: this.player.weapons.current.ammo,
          reserve: this.player.weapons.current.reserve,
          hp: this.player.hp,
          maxHp: this.player.maxHp,
          armor: this.player.armor,
          dead: this.player.dead,
        });
      }

      this.particles.update(dt);
      this.camera.update(this.player.pos, dt);
      if (!this.save.settings.screen_shake) {
        this.camera.shakeMag = 0;
        this.camera.jitter.x = 0;
        this.camera.jitter.y = 0;
      }

      if (this.player.dead) {
        this.gameOver();
        return;
      }
      if (this.player.pendingLevels > 0) this.enterUpgradeChoice();
      return;
    }

    // Host or Singleplayer standard updates
    this.player.update(dt, this);
    
    // Decay remote player weapon cooldowns on host
    for (const rp of this.remotePlayers.values()) {
      rp.weapons.update(dt);
      rp.flashTimer = Math.max(0, rp.flashTimer - dt);
      rp.invuln = Math.max(0, rp.invuln - dt);
    }

    this.elapsed += dt;
    this.timeOfDay += dt;
    this.stats.survival_time = this.elapsed;

    this.zombies = this.zombies.filter((z) => z.hp > 0);
    this.waveManager.update(dt, this);

    this.zgrid = {};
    for (const z of this.zombies) {
      const key = `${Math.floor(z.pos.x / 128)},${Math.floor(z.pos.y / 128)}`;
      const arr = this.zgrid[key];
      if (arr) arr.push(z);
      else this.zgrid[key] = [z];
    }

    for (const z of this.zombies) z.update(dt, this);
    this.zombies = this.zombies.filter((z) => z.hp > 0);

    for (const b of this.bullets) b.update(dt, this);
    this.bullets = this.bullets.filter((b) => !b.dead);
    for (const b of this.enemyBullets) b.update(dt, this);
    this.enemyBullets = this.enemyBullets.filter((b) => !b.dead);

    for (const l of this.loots) l.update(dt, this);
    this.loots = this.loots.filter((l) => !l.dead);

    // ── Supply crate timer (30-second interval) ──────────────────────────────
    for (const c of this.supplyCrates) c.update(dt, this);
    this.supplyCrates = this.supplyCrates.filter((c) => !c.dead);
    this.crateTimer -= dt;
    if (this.crateTimer <= 0) {
      this.crateTimer = CRATE_SPAWN_INTERVAL;
      const count = 1 + Math.floor(Math.random() * 5); // 1-5 crates
      spawnSupplyCrates(this.supplyCrates, this, count);
    }

    this.particles.update(dt);
    this.camera.update(this.player.pos, dt);
    if (!this.save.settings.screen_shake) {
      this.camera.shakeMag = 0;
      this.camera.jitter.x = 0;
      this.camera.jitter.y = 0;
    }

    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;

    this.quests.update(this);
    this.achievements.update(this);

    if (this.waveBanner) {
      this.waveBanner.timer -= dt;
      if (this.waveBanner.timer <= 0) this.waveBanner = null;
    }

    // Host periodically broadcasts game state snapshots to Guests
    if (this.networkMode === "host" && this.netClient) {
      this.lastSnapshotTime += dt;
      if (this.lastSnapshotTime >= 0.05) {
        this.lastSnapshotTime = 0;
        
        const serializedPlayers = [
          {
            username: this.username,
            pos: this.player.pos,
            angle: this.player.angle,
            animCycle: this.player.walkCycle,
            weaponId: this.player.weapons.current.id,
            ammo: this.player.weapons.current.ammo,
            reserve: this.player.weapons.current.reserve,
            hp: this.player.hp,
            maxHp: this.player.maxHp,
            armor: this.player.armor,
            dead: this.player.dead,
          },
          ...Array.from(this.remotePlayers.values()).map(rp => ({
            username: rp.username,
            pos: rp.pos,
            angle: rp.angle,
            animCycle: rp.walkCycle,
            weaponId: rp.weapons.current.id,
            ammo: rp.weapons.current.ammo,
            reserve: rp.weapons.current.reserve,
            hp: rp.hp,
            maxHp: rp.maxHp,
            armor: rp.armor,
            dead: rp.dead,
          }))
        ];

        const serializedZombies = this.zombies.map((z, idx) => ({
          id: idx,
          kind: z.KIND,
          pos: z.pos,
          hp: z.hp,
          maxHp: z.maxHp,
          faceAngle: z.faceAngle,
          flash: z.flash,
        }));

        const serializedBullets = this.bullets.map(b => ({
          pos: b.pos,
          angle: Math.atan2(b.vel.y, b.vel.x),
          crit: b.crit,
        }));

        const serializedEnemyBullets = this.enemyBullets.map(b => ({
          pos: b.pos,
          angle: Math.atan2(b.vel.y, b.vel.x),
        }));

        const serializedLoots = this.loots.map(l => ({
          pos: l.pos,
          kind: l.kind,
          amount: l.amount,
          age: l.age,
        }));

        this.netClient.send({
          type: "snapshot",
          players: serializedPlayers,
          zombies: serializedZombies,
          bullets: serializedBullets,
          enemyBullets: serializedEnemyBullets,
          loots: serializedLoots,
          particles: [],
          wave: this.waveManager.wave,
          waveState: this.waveManager.state,
          waveTimer: this.waveManager.timer,
          timeOfDay: this.timeOfDay,
          score: this.score,
        });
      }
    }

    if (this.player.dead) {
      this.gameOver();
      return;
    }
    if (this.player.pendingLevels > 0) this.enterUpgradeChoice();
  }

  // ------------------------------------------------------------- draw --
  private draw() {
    const ctx = this.ctx;
    const canvas = ctx.canvas;
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.floor(this.viewW * dpr);
    const targetH = Math.floor(this.viewH * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Always clear the FULL canvas area (in CSS pixels)
    ctx.clearRect(0, 0, this.viewW, this.viewH);
    // Fill bg
    ctx.fillStyle = "#10120E";
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    if (
      this.state === PLAYING ||
      this.state === PAUSED ||
      this.state === PAUSE_SETTINGS ||
      this.state === PAUSE_CONTROLS ||
      this.state === PAUSE_LEAVE_CONFIRM ||
      this.state === PAUSE_SHOP
    ) {
      this.drawWorld();
      // Biome ground tint (subtle per-biome colour wash over the map).
      const biomeTint = BIOME_TINT[this.waveManager.biome];
      if (biomeTint && biomeTint !== "rgba(0, 0, 0, 0)") {
        ctx.fillStyle = biomeTint;
        ctx.fillRect(0, 0, this.viewW, this.viewH);
      }
      if (this.player) this.player.draw(ctx, this.camera);
      for (const rp of this.remotePlayers.values()) {
        rp.draw(ctx, this.camera);
      }
      for (const z of this.zombies) z.draw(ctx, this.camera);
      for (const b of this.bullets) b.draw(ctx, this.camera);
      for (const b of this.enemyBullets) b.draw(ctx, this.camera);
      for (const l of this.loots) l.draw(ctx, this.camera);
      for (const c of this.supplyCrates) c.draw(ctx, this.camera, this);
      this.particles.draw(ctx, this.camera);
      const fogDark = this.waveManager.modifier === "fog" ? 0.9 : 0;
      drawPixelLight(
        ctx,
        this.collectLights(),
        this.viewW,
        this.viewH,
        (this.nightFactor() + fogDark) * 0.42,
      );
      drawHud(ctx, this, this.viewW, this.viewH);
      drawMinimap(ctx, this, this.viewW, 1);
      drawCrosshair(ctx, this.input.mouseX, this.input.mouseY, 0);
      drawToasts(ctx, this.toasts, this.viewH, this.viewW);
      // Night overlay disabled — brightness is locked at 100%.
      // (Previously a 22%-opacity dark blue tint was painted over the whole
      // canvas whenever the day/night cycle reached "night". Removed so the
      // game always stays at full brightness regardless of game time.)
      if (this.waveBanner) {
        this.menus.drawWaveBanner(ctx, this.waveBanner.text, this.waveBanner.timer, this.waveBanner.boss);
      }
    }

    if (this.state === PAUSED) {
      this.currentButtons = this.menus.drawPause(ctx, this).buttons;
    } else if (this.state === PAUSE_SETTINGS) {
      this.currentButtons = this.menus.drawPauseSettings(ctx, this).buttons;
    } else if (this.state === PAUSE_CONTROLS) {
      this.currentButtons = this.menus.drawPauseControls(ctx, this).buttons;
    } else if (this.state === PAUSE_LEAVE_CONFIRM) {
      this.currentButtons = this.menus.drawPauseLeaveConfirm(ctx, this).buttons;
    } else if (this.state === PAUSE_SHOP) {
      this.currentButtons = this.menus.drawPauseShop(ctx, this).buttons;
    } else if (this.state === MENU) {
      this.currentButtons = this.menus.drawMainMenu(ctx, this, this.elapsed).buttons;
    } else if (this.state === SHOP) {
      this.currentButtons = this.menus.drawShop(ctx, this, this.shopEntries()).buttons;
    } else if (this.state === UPGRADE) {
      this.currentButtons = this.menus.drawUpgrade(ctx, this, this.upgradeChoices).buttons;
    } else if (this.state === UPGRADE_INFO) {
      this.currentButtons = this.menus.drawUpgradesInfo(ctx, this).buttons;
    } else if (this.state === SETTINGS) {
      this.currentButtons = this.menus.drawSettings(ctx, this).buttons;
    } else if (this.state === GAME_OVER) {
      this.currentButtons = this.menus.drawGameOver(ctx, this, this.runStats(), this.newHigh).buttons;
    }

    if (this.showFps) {
      ctx.fillStyle = "#82827E";
      ctx.font = "12px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`FPS ${this.fpsDisplay}`, 6, this.viewH - 18);
    }

    if (this.isDebug()) {
      ctx.save();
      ctx.fillStyle = "rgba(10, 10, 14, 0.85)";
      ctx.fillRect(16, 140, 260, 160);
      ctx.strokeStyle = "#FF3C46";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(16, 140, 260, 160);

      ctx.fillStyle = "#FFC850";
      ctx.font = "bold 13px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("--- AUDIO DEBUG ---", 26, 150);

      ctx.fillStyle = "#EBEBE1";
      ctx.font = "12px ui-monospace, monospace";
      ctx.fillText(`Context State: ${this.audio.ctx ? this.audio.ctx.state : "NULL"}`, 26, 172);
      ctx.fillText(`Master Vol: ${Math.round(this.audio.master * 100)}%`, 26, 192);
      ctx.fillText(`Music Vol: ${Math.round(this.audio.musicVolume * 100)}%`, 26, 212);
      ctx.fillText(`SFX Vol: ${Math.round(this.audio.sfxVolume * 100)}%`, 26, 232);
      ctx.fillText(`Muted: ${this.audio.sfxMuted ? "YES" : "NO"}`, 26, 252);
      ctx.fillText(`Active Sounds: ${this.audio.getActiveSoundCount()}`, 26, 272);
      ctx.restore();
    }

    // Smoke test: after 2s in PLAYING, throw if anything's wrong.
    if (this.smokeTest && this.elapsed > 2 && this.state === PLAYING) {
      this.smokeTest = false;
      // Mark for E2E: data-no-errors attribute
      document.body.setAttribute("data-smoke-ok", "1");
    }
  }

  private drawWorld() {
    if (!this.map) return;
    this.map.drawGround(this.ctx, this.camera, this.viewW, this.viewH);
    this.particles.drawDecals(this.ctx, this.camera);
    // Read live from settings so toggling WINDOW LIGHTS in either settings
    // screen re-renders windows (dark or lit) on the very next frame.
    this.map.drawObstacles(this.ctx, this.camera, this.save.settings.window_lights);
  }

  private collectLights(): PixelLight[] {
    const lights: PixelLight[] = [];
    if (this.player) {
      lights.push({ pos: this.camera.apply(this.player.pos), radius: 150, color: "#8DDDF1", intensity: 1 });
      if (this.player.recoilTimer > 0) {
        lights.push({ pos: this.camera.apply(this.player.pos), radius: 78, color: "#FFD15C", intensity: 1.3 });
      }
    }
    if (this.map) {
      for (const lamp of this.map.streetLamps) {
        const p = this.camera.apply(lamp);
        if (p.x > -90 && p.x < this.viewW + 90 && p.y > -90 && p.y < this.viewH + 90) {
          lights.push({ pos: p, radius: 76, color: "#F4C663", intensity: 0.8 });
        }
      }
    }
    for (const loot of this.loots.slice(0, 20)) lights.push({ pos: this.camera.apply(loot.pos), radius: 38, color: "#67D9F5", intensity: 0.5 });
    for (const bullet of this.enemyBullets.slice(0, 28)) lights.push({ pos: this.camera.apply(bullet.pos), radius: 28, color: "#FF655A", intensity: 0.75 });
    return lights;
  }

  private runStats() {
    return {
      score: this.score,
      kills: this.stats.kills,
      wave: this.waveManager.wave,
      level: this.player?.level ?? 1,
      survival_time: this.elapsed,
      coins: this.player?.coins ?? 0,
    };
  }

  private shopEntries() {
    if (!this.player) return [];
    const p = this.player;
    const out: { key: string; label: string; detail: string; price: number; owned: boolean }[] = [];
    const owned = (p.weapons as unknown as { weapons: Record<string, unknown> }).weapons;
    for (const wid of Object.keys(this.weaponData)) {
      const d = this.weaponData[wid]!;
      if (owned[wid]) {
        out.push({
          key: `weapon:${wid}`,
          label: d.name,
          detail: `DMG ${d.damage} x${d.pellets}  MAG ${d.magazine}`,
          price: 0,
          owned: true,
        });
      } else {
        out.push({
          key: `weapon:${wid}`,
          label: d.name,
          detail: `DMG ${d.damage} x${d.pellets}  MAG ${d.magazine}`,
          price: d.price,
          owned: false,
        });
      }
    }
    const cw = p.weapons.current;
    out.push({
      key: "ammo_pack",
      label: "AMMO PACK",
      detail: `+${cw.magazineSize * 3} reserve (${cw.name})`,
      price: 150,
      owned: false,
    });
    out.push({
      key: "health",
      label: "FULL HEAL",
      detail: `HP ${Math.floor(p.hp)}/${Math.floor(p.maxHp)}`,
      price: 150,
      owned: false,
    });
    out.push({
      key: "armor",
      label: "ARMOR +10",
      detail: `Armor ${Math.floor(p.armor)}/100`,
      price: 500,
      owned: false,
    });
    out.push({
      key: "max_hp",
      label: "MAX HP +20",
      detail: `Max HP ${Math.floor(p.maxHp)}`,
      price: 300,
      owned: false,
    });
    out.push({
      key: "drone",
      label: "UFO DRONE",
      detail: p.hasDrone
        ? "Combat drone active — auto-fires at zombies"
        : "Orbiting drone that auto-fires at nearby zombies",
      price: DRONE_PRICE,
      owned: p.hasDrone,
    });
    return out;
  }

  // ---------------------------------------------------------- actions --
  doAction(action: string): void {
    this.audio.play("click");
    const prev = this.state;
    if (action === "start") this.newRun();
    else if (action === "save_game") {
      if (this.saveButtonState === "saving") return;
      this.saveButtonState = "saving";
      void this.performSaveGame();
    }
    else if (action === "quit") this.running = false;
    else if (action === "resume") {
      this.restoreAudioForState(PLAYING);
      this.state = PLAYING;
    } else if (action === "menu") {
      this.leaveToMainMenu();
    } else if (action === "leave_to_lobby") {
      this.leaveToLobby();
    } else if (action === "settings") {
      this.returnState = prev;
      this.state = SETTINGS;
    } else if (action === "pause_settings") {
      this.returnState = PAUSED;
      this.state = PAUSE_SETTINGS;
    } else if (action === "pause_shop") {
      this.returnState = PAUSED;
      this.state = PAUSE_SHOP;
    } else if (action.startsWith("shop_tab:")) {
      this.menus.activeShopTab = action.slice("shop_tab:".length) as any;
    } else if (action.startsWith("ps_buy:")) {
      const payload = action.slice("ps_buy:".length);
      const p = this.player!;
      if (payload.startsWith("weapon:")) {
        const wid = payload.slice("weapon:".length);
        const price = this.weaponData[wid]?.price ?? 500;
        if (p.coins >= price) {
          p.coins -= price;
          p.weapons.give(wid);
          p.weapons.currentId = wid;
          this.save.coins = p.coins;
          const list = this.save.unlocked_weapons;
          if (!list.includes(wid)) list.push(wid);
          this.save.save();
          this.audio.play("buy");
          this.toast(`PURCHASED: ${wid.toUpperCase()}`);
        } else {
          this.toast("NOT ENOUGH CASH");
        }
      } else if (payload === "ammo") {
        const price = 100;
        if (p.coins >= price) {
          p.coins -= price;
          const w = p.weapons.current;
          w.addReserve(30);
          this.save.coins = p.coins;
          this.save.save();
          this.audio.play("buy");
          this.toast("PURCHASED: +30 AMMO");
        } else {
          this.toast("NOT ENOUGH CASH");
        }
      } else if (payload === "medkit") {
        const price = 200;
        if (p.hp >= p.maxHp) {
          this.toast("FULL HP");
        } else if (p.coins >= price) {
          p.coins -= price;
          p.heal(25);
          this.save.coins = p.coins;
          this.save.save();
          this.audio.play("buy");
          this.toast("PURCHASED: +25 HP");
        } else {
          this.toast("NOT ENOUGH CASH");
        }
      } else if (payload === "armor") {
        const price = 250;
        if (p.armor >= 100) {
          this.toast("MAX ARMOR");
        } else if (p.coins >= price) {
          p.coins -= price;
          p.addArmor(15);
          this.save.coins = p.coins;
          this.save.save();
          this.audio.play("buy");
          this.toast("PURCHASED: +15 ARMOR");
        } else {
          this.toast("NOT ENOUGH CASH");
        }
      } else if (payload.startsWith("upgrade:")) {
        const id = payload.slice("upgrade:".length);
        const prices: Record<string, number> = {
          max_hp: 300,
          damage: 350,
          speed: 300,
          fire_rate: 350,
        };
        const price = prices[id] ?? 300;
        const currentLvl = p.upgradeLevels[id] ?? 0;
        const maxLimit = this.upgrades.catalog.limits[id] ?? 5;
        if (currentLvl >= maxLimit) {
          this.toast("MAXED");
        } else if (p.coins >= price) {
          p.coins -= price;
          this.upgrades.apply(id, p as any, this);
          this.save.coins = p.coins;
          this.save.save();
          this.audio.play("buy");
          this.toast(`UPGRADED ${id.toUpperCase()}`);
        } else {
          this.toast("NOT ENOUGH CASH");
        }
      }
    } else if (action === "pause_controls") {
      this.returnState = PAUSED;
      this.state = PAUSE_CONTROLS;
    } else if (action === "pause_leave") {
      this.returnState = PAUSED;
      this.state = PAUSE_LEAVE_CONFIRM;
    } else if (action === "pause_back") {
      this.restoreAudioForState(PAUSED);
      this.state = PAUSED;
    } else if (action === "back") {
      this.restoreAudioForState(this.returnState);
      this.state = this.returnState;
    } else if (action === "shop") {
      this.returnState = prev;
      if (!this.player) this.createPreviewPlayer();
      this.state = SHOP;
    } else if (action === "shop_from_over") {
      this.returnState = GAME_OVER;
      this.state = SHOP;
    } else if (action === "upgrades_info") {
      this.returnState = prev;
      if (!this.player) this.createPreviewPlayer();
      this.state = UPGRADE_INFO;
    } else if (action === "restart") this.newRun();
    else if (action.startsWith("buy:")) {
      if (!this.shop.buy(action.slice(4), this)) this.toast("NOT ENOUGH COINS!");
    } else if (action.startsWith("upgrade:")) {
      // Skill tree purchase: costs one skill point.
      const uid = action.slice("upgrade:".length);
      const p = this.player!;
      const limit = this.upgrades.limitFor(uid);
      if ((p.upgradeLevels[uid] ?? 0) >= limit) {
        this.toast("MAXED OUT");
      } else if (p.skillPoints <= 0) {
        this.toast("NO SKILL POINTS — LEVEL UP TO EARN ONE");
      } else {
        this.upgrades.apply(uid, p as unknown as Parameters<UpgradeSystem["apply"]>[1], this);
        p.skillPoints -= 1;
        this.save.data["player_level"] = p.level;
        this.save.data["xp"] = p.xp;
        this.save.coins = p.coins;
        this.save.save();
        this.audio.play("buy");
        this.toast(`LEARNED ${uid.toUpperCase().replace(/_/g, " ")}`);
      }
    } else if (action === "upgrade_done") {
      // Leave the skill tree (level-up overlay or entered from pause).
      this.player!.pendingLevels = 0;
      const target =
        this.returnState === PLAYING || this.returnState === PAUSED
          ? this.returnState
          : PLAYING;
      this.restoreAudioForState(target);
      this.state = target;
    } else if (action === "skill_tree") {
      // Pause menu: open the skill tree (points can be spent anytime).
      if (!this.player) this.createPreviewPlayer();
      this.returnState = PAUSED;
      this.state = UPGRADE;
      if (typeof document !== "undefined" && document.pointerLockElement) {
        document.exitPointerLock();
      }
    } else if (action === "toggle_mute") {
      const st = this.save.settings;
      st.muted = !st.muted;
      this.audio.setSfxMuted(st.muted);
      this.save.save();
      if (!st.muted) {
        this.audio.play("click");
      }
    } else if (action.startsWith("inc:") || action.startsWith("dec:")) {
      const key = action.slice(4);
      if (key === "brightness") {
        // Brightness is LOCKED at 100% — never allow it to decrease.
        this.save.settings.brightness = 1;
        this.save.save();
        return;
      }
      const step = action.startsWith("inc") ? 0.05 : -0.05;
      const st = this.save.settings as unknown as Record<string, number>;
      st[key] = Math.max(0, Math.min(1, Math.round((st[key] + step) * 100) / 100));
      if (key === "master_volume" || key === "music_volume" || key === "sfx_volume") {
        this.audio.setVolumes(st["master_volume"], st["music_volume"], st["sfx_volume"]);
        if (key !== "music_volume") {
          this.audio.play("click");
        }
      }
      this.save.save();
    } else if (action === "toggle_fullscreen") this.toggleFullscreen();
    else if (action === "cycle_resolution") this.cycleResolution();
    else if (action === "toggle_fps") {
      const st = this.save.settings;
      st.show_fps = !st.show_fps;
      this.showFps = st.show_fps;
      this.save.save();
    } else if (action === "toggle_screen_shake") {
      this.save.settings.screen_shake = !this.save.settings.screen_shake;
      this.save.save();
    } else if (action === "toggle_damage_numbers") {
      this.save.settings.damage_numbers = !this.save.settings.damage_numbers;
      this.save.save();
    } else if (action === "toggle_hit_effects") {
      this.save.settings.hit_effects = !this.save.settings.hit_effects;
      this.save.save();
    } else if (action === "toggle_footstep_dust") {
      this.save.settings.footstep_dust = !this.save.settings.footstep_dust;
      this.save.save();
    } else if (action === "toggle_window_lights") {
      // Flipping this immediately darkens every window (OFF) or restores the
      // deterministic per-building pattern (ON) on the next rendered frame;
      // no map regeneration is involved.
      this.save.settings.window_lights = !this.save.settings.window_lights;
      this.save.save();
    }
  }

  restoreAudioForState(state: string) {
    if (state === PLAYING) {
      this.audio.setSfxMuted(this.save.settings.muted);
      this.audio.resumeMusic();
    } else if (state === MENU) {
      this.audio.setSfxMuted(this.save.settings.muted);
      this.audio.playMusic("menu");
    } else {
      this.audio.setSfxMuted(true);
      this.audio.pauseMusic();
    }
  }

  private leaveToMainMenu() {
    this.commitRun(true);
    this.inRunContext = false;
    this.audio.setSfxMuted(this.save.settings.muted);
    this.audio.playMusic("menu");
    this.menus.setProfile(this.save.high_score, this.save.total_kills);
    if (this.netClient) {
      this.netClient.close();
      this.netClient = null;
    }
    this.remotePlayers.clear();
    this.state = MENU;
  }

  private leaveToLobby() {
    this.commitRun(true);
    this.inRunContext = false;
    this.audio.setSfxMuted(this.save.settings.muted);
    this.audio.stopMusic();
    if (this.netClient) {
      this.netClient.close();
      this.netClient = null;
    }
    this.remotePlayers.clear();
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  }

  cycleResolution(): void {
    const st = this.save.settings;
    st.resolution_index = (st.resolution_index + 1) % RESOLUTIONS.length;
    const r = RESOLUTIONS[st.resolution_index]!;
    this.toast(`RESOLUTION ${r[0]}x${r[1]}`);
    this.save.save();
  }

  createPreviewPlayer(): void {
    const unlocked = ["pistol", ...this.save.unlocked_weapons.filter((w) => w !== "pistol")];
    this.player = new Player(
      { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 },
      {
        unlocked,
        coins: this.save.coins,
        level: this.save.data["player_level"] ?? 1,
        xp: this.save.data["xp"] ?? 0,
        weaponData: this.weaponData,
        previewOnly: true,
      },
    );
    this.player.hasDrone = !!this.save.data["has_drone"];
  }

  newRun(): void {
    this.map = new GameMap();
    const start: Vec = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
    if (this.map.blocked(start, 40)) {
      const alt = this.map.randomFreePoint(mulberry32(7), 0, 0, null, 24, 80);
      if (alt) {
        start.x = alt.x;
        start.y = alt.y;
      }
    }
    const unlocked = ["pistol", ...this.save.unlocked_weapons.filter((w) => w !== "pistol")];
    this.player = new Player(start, {
      unlocked,
      coins: this.save.coins,
      level: this.save.data["player_level"] ?? 1,
      xp: this.save.data["xp"] ?? 0,
      weaponData: this.weaponData,
      username: this.username,
    });
    this.player.hasDrone = !!this.save.data["has_drone"];
    this.camera = new Camera(this.viewW, this.viewH);
    this.camera.offset.x = Math.max(0, start.x - this.camera.viewW / 2);
    this.camera.offset.y = Math.max(0, start.y - this.camera.viewH / 2);
    this.particles.clear();
    this.zombies = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.loots = [];
    this.supplyCrates = [];
    this.crateTimer = CRATE_SPAWN_INTERVAL;
    this.waveManager = new WaveManager();
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.elapsed = 0;
    this.timeOfDay = 10;
    this.newHigh = false;
    this.stats = {
      kills: 0,
      kills_by_type: {},
      boss_kills: 0,
      survival_time: 0,
      shots_by_weapon: {},
      shots_fired: 0,
      shots_hit: 0,
    };
    this.toasts = [];
    this.waveBanner = null;
    this.quests.bind(this);
    this.achievements = new AchievementSystem(this.save.achievements);
    this.inRunContext = true;
    this.state = PLAYING;
    this.audio.startMusic();
    this.toast("SURVIVE THE HORDE!");
  }

  async loadSaveAndStart() {
    try {
      const res = await fetch(`/api/game/save?username=${encodeURIComponent(this.username)}`);
      const data = await res.json() as any;
      if (data.save) {
        this.restoreGameFromSave(data.save);
      } else {
        this.toast("NO SAVE FOUND, STARTING NEW RUN");
        this.newRun();
      }
    } catch (err) {
      console.error("Failed to load save:", err);
      this.toast("LOAD FAILED, STARTING NEW RUN");
      this.newRun();
    }
  }

  restoreGameFromSave(dbSave: any): void {
    // 1. Restore map using the saved seed
    const seed = dbSave.world_data?.seed ?? MAP_SEED;
    this.map = new GameMap(seed);

    // 2. Initialize Player with correct position, coins, level, xp
    const pData = dbSave.player_data;
    const start: Vec = { x: pData.x, y: pData.y };
    const unlocked = dbSave.weapon_data?.unlocked ?? ["pistol"];
    
    this.player = new Player(start, {
      unlocked,
      coins: dbSave.money,
      level: dbSave.level,
      xp: pData.xp ?? 0,
      weaponData: this.weaponData,
      username: this.username,
    });
    this.player.hasDrone = !!pData.hasDrone;

    // Restore upgrades
    this.player.upgradeLevels = {};
    for (const [uid, level] of Object.entries(pData.upgradeLevels || {})) {
      for (let i = 0; i < (level as number); i++) {
        this.upgrades.apply(uid, this.player as any);
      }
    }
    // Restore unspent skill points earned before the save
    this.player.skillPoints = pData.skillPoints ?? 0;
    
    // Explicitly restore hp/armor/maxHp in case it was modified
    this.player.maxHp = pData.maxHp;
    this.player.hp = pData.hp;
    this.player.armor = pData.armor;

    // Restore weapons ammo/reserve
    if (dbSave.weapon_data?.ammo) {
      for (const [wid, ammoObj] of Object.entries(dbSave.weapon_data.ammo) as any) {
        if (this.player.weapons.weapons[wid]) {
          this.player.weapons.weapons[wid].ammo = ammoObj.ammo;
          this.player.weapons.weapons[wid].reserve = ammoObj.reserve;
        }
      }
    }
    this.player.weapons.currentId = dbSave.weapon_data?.currentId ?? "pistol";
    // Guard: a save whose currentId isn't in the unlocked list (corruption,
    // schema drift, removed weapon) would leave weapons.current undefined
    // and crash on the next .id/.update access. WeaponManager.current is
    // also defensive, but normalizing here avoids one wasted fallback per
    // frame after the restore.
    if (!this.player.weapons.weapons[this.player.weapons.currentId]) {
      const firstOwned = WEAPON_ORDER.find(
        (wid) => this.player!.weapons.weapons[wid],
      );
      this.player.weapons.currentId = firstOwned ?? "pistol";
    }

    // 3. Restore camera
    this.camera = new Camera(this.viewW, this.viewH);
    this.camera.offset.x = Math.max(0, start.x - this.camera.viewW / 2);
    this.camera.offset.y = Math.max(0, start.y - this.camera.viewH / 2);

    // 4. Restore WaveManager
    const wm = dbSave.progression_data?.waveManager || {};
    this.waveManager = new WaveManager();
    this.waveManager.wave = dbSave.wave;
    this.waveManager.state = wm.state ?? "intermission";
    this.waveManager.timer = wm.timer ?? 3;
    this.waveManager.to_spawn = wm.to_spawn ?? 0;
    this.waveManager.spawned_this_wave = wm.spawned_this_wave ?? 0;
    this.waveManager.spawnTimer = wm.spawnTimer ?? 0;
    this.waveManager.spawnInterval = wm.spawnInterval ?? 1.5;
    this.waveManager.hpMult = wm.hpMult ?? 1;
    this.waveManager.speedMult = wm.speedMult ?? 1;
    this.waveManager.dmgMult = wm.dmgMult ?? 1;
    this.waveManager.bossAlive = wm.bossAlive ?? false;

    // 5. Clear dynamic arrays
    this.particles.clear();
    this.zombies = [];
    this.bullets = [];
    this.enemyBullets = [];

    // 6. Restore Loot drops
    this.loots = dbSave.world_data?.loot?.map((l: any) => new Loot(l.pos, l.kind, l.amount, l.payload)) ?? [];

    // 7. Restore Supply crates
    this.supplyCrates = dbSave.world_data?.supplyCrates?.map((c: any) => new SupplyCrate(c.pos, c.kind)) ?? [];
    this.crateTimer = dbSave.world_data?.crateTimer ?? CRATE_SPAWN_INTERVAL;

    // 8. Restore game state variables
    this.score = dbSave.score;
    this.combo = dbSave.progression_data?.combo ?? 0;
    this.comboTimer = dbSave.progression_data?.comboTimer ?? 0;
    this.elapsed = dbSave.progression_data?.elapsed ?? 0;
    this.timeOfDay = dbSave.progression_data?.timeOfDay ?? 10;
    this.newHigh = false;
    
    this.stats = dbSave.progression_data?.stats ?? {
      kills: 0,
      kills_by_type: {},
      boss_kills: 0,
      survival_time: 0,
      shots_by_weapon: {},
      shots_fired: 0,
      shots_hit: 0,
    };

    this.toasts = [];
    this.waveBanner = null;
    this.quests.bind(this);
    this.achievements = new AchievementSystem(this.save.achievements);
    this.inRunContext = true;
    this.state = PLAYING;
    this.audio.startMusic();
    this.toast("RUN RESUMED!");
  }

  async performSaveGame() {
    if (!this.player) {
      this.saveButtonState = "error";
      setTimeout(() => { this.saveButtonState = "idle"; }, 2000);
      return;
    }

    const payload = {
      save_version: 1,
      level: this.player.level,
      wave: this.waveManager.wave,
      score: this.score,
      money: this.player.coins,
      player: {
        x: this.player.pos.x,
        y: this.player.pos.y,
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        armor: this.player.armor,
        xp: this.player.xp,
        skillPoints: this.player.skillPoints,
        upgradeLevels: this.player.upgradeLevels,
        hasDrone: this.player.hasDrone,
      },
      weapons: {
        currentId: this.player.weapons.currentId,
        unlocked: Object.keys(this.player.weapons.weapons),
        ammo: Object.entries(this.player.weapons.weapons).reduce((acc, [id, w]) => {
          acc[id] = { ammo: (w as any).ammo, reserve: (w as any).reserve };
          return acc;
        }, {} as Record<string, { ammo: number, reserve: number }>)
      },
      inventory: {},
      progression: {
        combo: this.combo,
        comboTimer: this.comboTimer,
        elapsed: this.elapsed,
        timeOfDay: this.timeOfDay,
        stats: this.stats,
        waveManager: {
          state: this.waveManager.state,
          timer: this.waveManager.timer,
          to_spawn: this.waveManager.to_spawn,
          spawned_this_wave: this.waveManager.spawned_this_wave,
          spawnTimer: this.waveManager.spawnTimer,
          spawnInterval: this.waveManager.spawnInterval,
          hpMult: this.waveManager.hpMult,
          speedMult: this.waveManager.speedMult,
          dmgMult: this.waveManager.dmgMult,
          bossAlive: this.waveManager.bossAlive,
        }
      },
      world: {
        seed: this.map?.seed ?? MAP_SEED,
        loot: this.loots.map(l => ({ pos: l.pos, kind: l.kind, amount: l.amount, payload: l.payload })),
        supplyCrates: this.supplyCrates.map(c => ({ pos: c.pos, kind: c.kind })),
        crateTimer: this.crateTimer
      }
    };

    try {
      const res = await fetch("/api/game/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.username,
          savePayload: payload
        })
      });
      
      if (res.ok) {
        this.saveButtonState = "success";
        this.toast("GAME SAVED SUCCESSFULLY");
      } else {
        if (res.status === 401) {
          this.saveButtonState = "error";
          this.toast("SESSION EXPIRED");
        } else {
          this.saveButtonState = "error";
          this.toast("SAVE FAILED. PLEASE TRY AGAIN.");
        }
      }
    } catch (err) {
      this.saveButtonState = "error";
      this.toast("SAVE FAILED. PLEASE TRY AGAIN.");
    }

    setTimeout(() => {
      this.saveButtonState = "idle";
    }, 2000);
  }

  enterUpgradeChoice(): void {
    // Level-ups grant skill points; open the SKILL TREE to spend them.
    this.upgradeChoices = [];
    this.returnState = PLAYING;
    this.state = UPGRADE;
    this.audio.play("levelup");
    // Free the pointer so the mouse cursor is visible and mouse coordinates
    // are absolute again — required for hover hit-testing in the tree.
    if (typeof document !== "undefined" && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  gameOver(): void {
    // Set state BEFORE commitRun so that the leaderboard submission check passes
    this.state = GAME_OVER;
    this.newHigh = this.commitRun(false);
    this.menus.setProfile(this.save.high_score, this.save.total_kills);

    // Delete save game on death
    if (typeof window !== "undefined") {
      fetch("/api/game/save", {
        method: "DELETE"
      }).catch(err => console.error("Failed to delete save game on death:", err));
    }
  }

  commitRun(saveAlways: boolean): boolean {
    if (!this.player) return false;
    if (!saveAlways && this.state !== GAME_OVER) return false;
    const isNewHigh = this.save.recordRun(
      this.score,
      this.stats.kills,
      this.player.coins,
      this.player.level,
      this.player.xp,
    );

    if (typeof window !== "undefined" && this.state === GAME_OVER) {
      fetch("/api/game/submit-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score: Math.max(0, Math.floor(this.score)),
          wave: Math.max(0, Math.floor(this.waveManager.wave)),
          zombies_killed: Math.max(0, Math.floor(this.stats.kills)),
          survival_time: Math.max(0, Math.floor(this.stats.survival_time || 0)),
          shots_fired: Math.max(0, Math.floor(this.stats.shots_fired || 0)),
          shots_hit: Math.max(0, Math.floor(this.stats.shots_hit || 0)),
        }),
      }).catch((err) => console.error("Failed to submit score to Cloudflare D1:", err));
    }

    return isNewHigh;
  }

  onLevelUp(): void {
    this.particles.heal(this.player!.pos);
    this.toast(`LEVEL UP!  LV ${this.player!.level}  ·  +1 SKILL POINT`);
  }

  onZombieKilled(z: import("./zombie").Zombie): void {
    const kind = z.KIND;
    const isBoss = kind === "boss" || kind === "necromancer_boss";
    if (isBoss) {
      this.stats.boss_kills = (this.stats.boss_kills ?? 0) + 1;
      this.waveManager.bossAlive = false;
    }
    this.combo += 1;
    this.comboTimer = COMBO_WINDOW;
    const mult = this.comboMultiplier();
    this.score += Math.floor(z.scoreValue * mult);
    this.stats.kills = (this.stats.kills ?? 0) + 1;
    this.stats.kills_by_type[kind] = (this.stats.kills_by_type[kind] ?? 0) + 1;
    this.player!.coins += z.coinValue;
    this.player!.addXp(z.xpValue, this);
    const lifeSteal = this.player!.lifeSteal;
    if (lifeSteal > 0) {
      this.player!.heal(Math.max(1, Math.round(z.maxHp * lifeSteal)));
    }
    const rng: Rng = mulberry32(Math.floor(Math.random() * 2 ** 31));
    this.loots.push(...dropsFor(z, rng));
    if (isBoss) {
      this.spawnBossLoot(z.pos, rng);
      this.camera.shake(10);
      this.particles.explosion(z.pos, true);
    } else {
      this.camera.shake(2);
    }
  }

  /** Boss kill bonus: a rich loot burst strewn around the corpse. */
  private spawnBossLoot(pos: Vec, rng: Rng): void {
    const scatter = (radius: number, angle: number): Vec => ({
      x: pos.x + Math.cos(angle) * radius,
      y: pos.y + Math.sin(angle) * radius,
    });
    // Golden shower: 10 x $25 coins on a ring around the body.
    for (let i = 0; i < 10; i++) {
      const ang = (Math.PI * 2 * i) / 10 + rng.next() * 0.4;
      this.loots.push(new Loot(scatter(36 + rng.next() * 46, ang), "coin", 25));
    }
    this.loots.push(new Loot(scatter(60, rng.next() * Math.PI * 2), "health", 50));
    this.loots.push(new Loot(scatter(70, rng.next() * Math.PI * 2), "armor", 30));
    this.loots.push(new Loot(scatter(80, rng.next() * Math.PI * 2), "ammo", 0));
    this.toast("BOSS DESTROYED — RICH LOOT DROPPED!");
    this.audio.playSFX("ui.notification");
  }

  comboMultiplier(): number {
    return Math.min(COMBO_MAX_MULT, 1 + Math.floor(this.combo / COMBO_KILLS_PER_STEP));
  }

  toast(text: string): void {
    this.toasts.push({ text, remaining: 3 });
  }

  private tickToasts(dt: number) {
    for (const t of this.toasts) t.remaining -= dt;
    while (this.toasts.length && this.toasts[0]!.remaining < -0.3) this.toasts.shift();
  }

  // helpers required by IGame
  isNight(): boolean {
    // Brightness locked at 100%: never enter "night".
    return false;
  }
  nightFactor(): number {
    // Brightness locked at 100%: day/night cycle disabled.
    // Returning 0 unconditionally so any downstream logic that still
    // multiplies by nightFactor (zombie speed/damage, spawn rate, etc.)
    // behaves as if it's always daytime.
    return 0;
  }
  toScreen(p: Vec): Vec {
    return { x: p.x - this.camera.offset.x, y: p.y - this.camera.offset.y };
  }
  wave_announce(text: string, boss: boolean): void {
    this.waveBanner = { text, timer: 2.5, boss };
  }
}

// Bullet
import { Bullet as _Bullet } from "./bullet";
void _Bullet;
void FPS;
void SCREEN_WIDTH;
void SCREEN_HEIGHT;
