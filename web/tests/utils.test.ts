// tests/utils.test.ts
import { describe, test, expect } from "vitest";
import { clamp, lerp, formatTime, safeJson } from "@/game/utils";

describe("clamp", () => {
  test("within bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  test("below min", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });
  test("above max", () => {
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe("lerp", () => {
  test("mid", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
  test("ends", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });
});

describe("formatTime", () => {
  test("zero", () => {
    expect(formatTime(0)).toBe("00:00");
  });
  test("75s", () => {
    expect(formatTime(75)).toBe("01:15");
  });
  test("3661s", () => {
    expect(formatTime(3661)).toBe("61:01");
  });
});

describe("safeJson", () => {
  test("parses valid", () => {
    expect(safeJson('{"a":1}')).toEqual({ a: 1 });
  });
  test("falls back", () => {
    expect(safeJson("garbage", { a: 0 })).toEqual({ a: 0 });
  });
  test("falls back to empty obj when no default", () => {
    expect(safeJson("garbage")).toEqual({});
  });
});
