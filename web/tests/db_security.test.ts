import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  validateScoreInput,
} from "../src/lib/db";

describe("Cloudflare D1 Security & Anti-Cheat Utilities", () => {
  it("hashes and verifies password using Web Crypto PBKDF2", async () => {
    const password = "SuperSecretPassword123!";
    const hash = await hashPassword(password);
    expect(hash).toContain("$pbkdf2$");

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);

    const isWrongValid = await verifyPassword("WrongPassword", hash);
    expect(isWrongValid).toBe(false);
  });

  it("creates and verifies signed session tokens", async () => {
    const playerId = "p-12345";
    const username = "ZombieHunter";

    const token = await createSessionToken(playerId, username);
    expect(token).toContain(".");

    const session = await verifySessionToken(token);
    expect(session).not.toBeNull();
    expect(session?.playerId).toBe(playerId);
    expect(session?.username).toBe(username);

    const invalidSession = await verifySessionToken("tampered.token");
    expect(invalidSession).toBeNull();
  });

  it("validates score submission inputs against anti-cheat rules", () => {
    const validRun = {
      score: 25000,
      wave: 15,
      zombies_killed: 320,
      survival_time: 600,
      shots_fired: 500,
      shots_hit: 400,
    };
    expect(validateScoreInput(validRun).valid).toBe(true);

    // Negative score
    expect(
      validateScoreInput({ ...validRun, score: -100 }).valid
    ).toBe(false);

    // Shots hit > shots fired
    expect(
      validateScoreInput({ ...validRun, shots_hit: 600, shots_fired: 500 }).valid
    ).toBe(false);

    // Implausible score bound check
    expect(
      validateScoreInput({ ...validRun, score: 99999999, wave: 2 }).valid
    ).toBe(false);

    // Exceed max wave threshold
    expect(
      validateScoreInput({ ...validRun, wave: 300 }).valid
    ).toBe(false);
  });
});
