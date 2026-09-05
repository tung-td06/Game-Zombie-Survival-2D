// src/game/input.ts
// Centralised input handling with rebindable actions.
// Mirrors input_manager.py. Browser DOM events feed `handleEvent`.
//
// Bindings map an action name to a keyboard code (KeyW, KeyS, Digit1, ...)
// or "MouseLeft" / "MouseMiddle" / "MouseRight".

import type { Camera } from "./camera";
import type { SaveData } from "./save";
import type { Vec } from "./vec";

export type WeaponSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type Action =
  | "up"
  | "down"
  | "left"
  | "right"
  | "reload"
  | "vacuum"
  | "throw_bomb"
  | "pause"
  | "weapon1"
  | "weapon2"
  | "weapon3"
  | "weapon4"
  | "weapon5"
  | "weapon6"
  | "weapon7"
  | "weapon8"
  | "next_weapon"
  | "debug"
  | "fullscreen";

export type Key = string; // KeyboardEvent.code or "MouseLeft" | "MouseMiddle" | "MouseRight"

export const MOUSE_LEFT: Key = "MouseLeft";
export const MOUSE_MIDDLE: Key = "MouseMiddle";
export const MOUSE_RIGHT: Key = "MouseRight";

export const DEFAULT_BINDINGS: Record<Action, Key> = {
  up: "KeyW",
  down: "KeyS",
  left: "KeyA",
  right: "KeyD",
  reload: "KeyR",
  vacuum: "KeyE",
  throw_bomb: "KeyF",
  pause: "Escape",
  weapon1: "Digit1",
  weapon2: "Digit2",
  weapon3: "Digit3",
  weapon4: "Digit4",
  weapon5: "Digit5",
  weapon6: "Digit6",
  weapon7: "Digit7",
  weapon8: "Digit8",
  next_weapon: MOUSE_MIDDLE,
  debug: "F3",
  fullscreen: "F11",
};

export class InputManager {
  bindings: Record<Action, Key>;
  keysDown: Set<Key> = new Set();
  keysPressed: Set<Key> = new Set();
  mouseDown: Set<number> = new Set();
  mousePressed: Set<number> = new Set();
  mouseX = 0;
  mouseY = 0;
  /** True if pointer is currently locked (aim from screen center). */
  pointerLocked = false;

  // ── Mobile / touch layer ────────────────────────────────────────────
  // Written by React touch HUD components. The game core reads them
  // through getAimWorld() and the existing mouseHeld path (fireHeld
  // mirrors mouseHeld into the same input surface).
  moveVec: Vec = { x: 0, y: 0 };
  fireHeld = false;
  weaponPressed: Set<WeaponSlot> = new Set();
  pausePressed = false;
  /** Touch bomb button — one-shot, cleared in endFrame() like keysPressed. */
  bombPressed = false;
  /** World-space aim override (auto-aim) or null to fall back to mouse. */
  aimOverride: Vec | null = null;

  constructor(bindings?: Partial<Record<Action, Key>>) {
    this.bindings = { ...DEFAULT_BINDINGS, ...bindings };
  }

  loadBindings(bindings: SaveData["settings"]["bindings"]) {
    for (const k of Object.keys(DEFAULT_BINDINGS) as Action[]) {
      const v = bindings[k as keyof typeof bindings];
      if (typeof v === "string" && v.length > 0) {
        this.bindings[k] = v;
      }
    }
  }

  private eventToKey(e: KeyboardEvent): Key {
    return e.code;
  }

  private buttonToKey(b: number): Key {
    if (b === 0) return MOUSE_LEFT;
    if (b === 1) return MOUSE_MIDDLE;
    if (b === 2) return MOUSE_RIGHT;
    return `Mouse${b}`;
  }

  handleEvent(e: Event) {
    if (e.type === "keydown") {
      const k = this.eventToKey(e as KeyboardEvent);
      this.keysDown.add(k);
      this.keysPressed.add(k);
    } else if (e.type === "keyup") {
      this.keysDown.delete(this.eventToKey(e as KeyboardEvent));
    } else if (e.type === "mousemove") {
      const m = e as MouseEvent;
      if (this.pointerLocked) {
        this.mouseX = Math.max(0, Math.min(window.innerWidth, this.mouseX + m.movementX));
        this.mouseY = Math.max(0, Math.min(window.innerHeight, this.mouseY + m.movementY));
      } else {
        this.mouseX = m.clientX;
        this.mouseY = m.clientY;
      }
    } else if (e.type === "mousedown") {
      const m = e as MouseEvent;
      const k = this.buttonToKey(m.button);
      this.mouseDown.add(m.button);
      this.mousePressed.add(m.button);
      this.keysDown.add(k);
      this.keysPressed.add(k);
    } else if (e.type === "mouseup") {
      const m = e as MouseEvent;
      this.mouseDown.delete(m.button);
      this.keysDown.delete(this.buttonToKey(m.button));
    } else if (e.type === "pointerlockchange") {
      this.pointerLocked = document.pointerLockElement !== null;
    }
  }

  endFrame() {
    this.keysPressed.clear();
    this.mousePressed.clear();
    this.weaponPressed.clear();
    this.pausePressed = false;
    this.bombPressed = false;
  }

  isDown(action: Action): boolean {
    const k = this.bindings[action];
    return k != null && this.keysDown.has(k);
  }

  isPressed(action: Action): boolean {
    const k = this.bindings[action];
    return k != null && this.keysPressed.has(k);
  }

  /** True if left mouse is currently held. */
  get mouseHeld(): boolean {
    return this.mouseDown.has(0);
  }

  set mouseHeld(val: boolean) {
    if (val) {
      this.mouseDown.add(0);
    } else {
      this.mouseDown.delete(0);
    }
  }

  /** True if left mouse was just clicked this frame. */
  get mouseClicked(): boolean {
    return this.mousePressed.has(0);
  }

  /**
   * Resolve the current aim point in WORLD coordinates.
   *
   * On mobile, the touch layer writes `aimOverride` (auto-aim toward
   * the nearest threat). On desktop, falls back to mouse position
   * translated by the camera. Game core should call this instead of
   * computing aim from mouseX/mouseY directly.
   */
  getAimWorld(camera: Camera): Vec {
    if (this.aimOverride) return this.aimOverride;
    return camera.screenToWorld({ x: this.mouseX, y: this.mouseY });
  }
}
