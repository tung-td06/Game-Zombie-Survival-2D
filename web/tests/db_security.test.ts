import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  validateScoreInput,
  createPlayer,
  getPlayerByUsername,
} from "../src/lib/db";

// Minimal stand-in for the D1 API surface used by the auth paths, so we can
// assert how db-core behaves when a database statement fails. This is a test
// double only — production always talks to the real D1 binding.
function failingDb(): D1Database {
  const fail = async () => {
    throw new Error("no such table: players");
  };
  return {
    prepare: () => ({ bind: () => ({ run: fail, first: fail }) }),
  } as unknown as D1Database;
}

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

  it("createPlayer throws when the D1 INSERT fails (no fake success)", async () => {
    // Regression guard: register must never report success when the row
    // could not be written to D1 (this was the production bug — the SQL
    // error was swallowed and the API returned success while no account
    // existed, so login always failed afterwards).
    await expect(
      createPlayer(failingDb(), "ghostuser", "$pbkdf2$salt$hash")
    ).rejects.toThrow("Failed to persist player in D1");
  });

  it("getPlayerByUsername surfaces D1 read errors instead of returning null", async () => {
    // A broken/missing table must surface as an error (route returns 500),
    // never be misreported as "user not found" (route returns 401).
    await expect(
      getPlayerByUsername(failingDb(), "ghostuser")
    ).rejects.toThrow("no such table: players");
  });

  it("registers account and retrieves player with fallback DB", async () => {
    const username = "NewPlayerTest";
    const password = "Password123!";
    const displayName = "Pro Survivor";

    const hash = await hashPassword(password);
    const player = await createPlayer(null, username, hash, displayName);
    expect(player.id).toBeDefined();
    expect(player.username).toBe("newplayertest");
    expect(player.display_name).toBe(displayName);

    const fetched = await getPlayerByUsername(null, "NewPlayerTest");
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(player.id);

    const passwordValid = await verifyPassword(password, fetched!.password_hash);
    expect(passwordValid).toBe(true);
  });
});
