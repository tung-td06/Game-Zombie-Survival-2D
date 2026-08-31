// src/lib/rng.ts
// Mulberry32 — small, fast, deterministic 32-bit PRNG. Same interface as game.py uses.

export interface Rng {
  next(): number;
  int(n: number): number;
  range(a: number, b: number): number;
  pick<T>(arr: ReadonlyArray<T>): T;
}

export function mulberry32(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(n: number) {
      return Math.floor(next() * n);
    },
    range(a: number, b: number) {
      return a + next() * (b - a);
    },
    pick<T>(arr: ReadonlyArray<T>): T {
      return arr[Math.floor(next() * arr.length)]!;
    },
  };
}
