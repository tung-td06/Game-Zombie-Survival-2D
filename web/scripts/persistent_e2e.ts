// Manual simulation: prove that after a "restart" (process exit + relaunch),
// the same registered user can still log in. This script is intentionally
// NOT a vitest test — it's invoked directly via tsx/node so the persistent
// storage module is forced to re-load from disk after a fresh process.

import {
  hashPassword,
  verifyPassword,
  createPlayer,
  getPlayerByUsername,
} from "../src/lib/db";

async function main() {
  const mode = process.argv[2];
  if (mode !== "register" && mode !== "login") {
    console.error("usage: tsx tests/persistent_e2e.test.ts <register|login>");
    process.exit(2);
  }

  const username = "hoho";
  const password = "Pwd123!";

  if (mode === "register") {
    // Idempotency: if user already exists, just succeed.
    const existing = await getPlayerByUsername(null, username);
    if (existing) {
      console.log(`[register] user ${username} already exists, id=${existing.id}`);
      return;
    }
    const hash = await hashPassword(password);
    const created = await createPlayer(null, username, hash, "HOHO");
    console.log(`[register] created id=${created.id} username=${created.username}`);
  } else {
    const player = await getPlayerByUsername(null, username);
    if (!player) {
      console.log(`[login] FAIL: user ${username} not found`);
      process.exit(1);
    }
    const ok = await verifyPassword(password, player.password_hash);
    if (!ok) {
      console.log(`[login] FAIL: bad password for ${username}`);
      process.exit(1);
    }
    console.log(`[login] OK: ${username} id=${player.id}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
