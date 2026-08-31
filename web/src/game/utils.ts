// src/game/utils.ts
// Utility functions mirroring utils.py.

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(r).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function safeJson<T = Record<string, unknown>>(
  text: string,
  fallback: T,
): T;
export function safeJson(text: string): Record<string, unknown>;
export function safeJson(text: string, fallback?: unknown): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return fallback ?? {};
  }
}
