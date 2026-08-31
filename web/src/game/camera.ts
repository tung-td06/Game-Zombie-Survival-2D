// src/game/camera.ts
// Smooth-follow camera with screen-shake support.
// Mirrors camera.py.

import { WORLD_HEIGHT, WORLD_WIDTH } from "./settings";
import { clamp } from "./utils";
import type { Vec } from "./vec";

export class Camera {
  viewW: number;
  viewH: number;
  offset: Vec = { x: 0, y: 0 };
  shakeMag = 0;
  jitter: Vec = { x: 0, y: 0 };

  constructor(viewW: number, viewH: number) {
    this.viewW = viewW;
    this.viewH = viewH;
  }

  update(target: Vec, dt: number): void {
    const maxX = Math.max(0, WORLD_WIDTH - this.viewW);
    const maxY = Math.max(0, WORLD_HEIGHT - this.viewH);
    const desiredX = clamp(target.x - this.viewW / 2, 0, maxX);
    const desiredY = clamp(target.y - this.viewH / 2, 0, maxY);
    const k = Math.min(1, dt * 8);
    this.offset.x += (desiredX - this.offset.x) * k;
    this.offset.y += (desiredY - this.offset.y) * k;
    this.shakeMag = Math.max(0, this.shakeMag - dt * 30);
    if (this.shakeMag > 0.1) {
      this.jitter = {
        x: (Math.random() * 2 - 1) * this.shakeMag,
        y: (Math.random() * 2 - 1) * this.shakeMag,
      };
    } else {
      this.jitter = { x: 0, y: 0 };
    }
  }

  shake(magnitude: number): void {
    this.shakeMag = Math.min(24, Math.max(this.shakeMag, magnitude));
  }

  apply(worldPos: Vec): Vec {
    return {
      x: worldPos.x - this.offset.x + this.jitter.x,
      y: worldPos.y - this.offset.y + this.jitter.y,
    };
  }

  screenToWorld(screenPos: { x: number; y: number }): Vec {
    return {
      x: screenPos.x + this.offset.x - this.jitter.x,
      y: screenPos.y + this.offset.y - this.jitter.y,
    };
  }

  /** Visible region in world coordinates (with margin for culling). */
  viewRect(): { x: number; y: number; w: number; h: number } {
    return {
      x: this.offset.x - 64,
      y: this.offset.y - 64,
      w: this.viewW + 128,
      h: this.viewH + 128,
    };
  }
}
