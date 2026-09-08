// save-continue-fidelity.cjs
// End-to-end fidelity checks for SAVE GAME / CONTINUE GAME:
//
//   A) A level-up during an UNSAVED run syncs the Skill Tree to the DB row
//      (account meta) but that stub row must NOT surface a Continue button —
//      only a real run snapshot (player position/hp) is a valid Continue.
//   B) Saving mid-wave captures the exact wave + every alive zombie (kind,
//      position, wounded hp); Continue restores the same wave in the same
//      phase and re-materializes those wounded enemies.
//   C) Full state fidelity: level, xp, skill points, learned skills, money,
//      owned + equipped weapons and the drone survive the round trip.
//   D) Saving during the very first intermission (wave 0) must not advance
//      the restored wave — the next wave played is wave 1 (no skip).
//
// Usage: node scripts/save-continue-fidelity.cjs   (dev server on PORT)

const { chromium } = require("playwright");

const BASE = `http://localhost:${process.env.PORT || 3210}`;
const USER = `savfit${Date.now() % 100000}`;
const PASS = "Password123!";

let failures = 0;
function check(name, cond, extra) {
  if (cond) {
    console.log(`  ok: ${name}`);
  } else {
    failures++;
    console.log(`  FAIL: ${name}${extra ? "  -> " + JSON.stringify(extra) : ""}`);
  }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const api = (p, opts) =>
    page.evaluate(
      async ({ p, opts }) => {
        const res = await fetch(p, opts);
        let body = null;
        try {
          body = await res.json();
        } catch {}
        return { status: res.status, body };
      },
      { p, opts }
    );

  const lobbyButtons = () =>
    page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button")).map((b) =>
        (b.textContent || "").replace(/\s+/g, " ").trim()
      );
      return {
        continueBtn: btns.some((t) => t.includes("TIẾP TỤC CHƠI")),
        newGameBtn: btns.some((t) => t.includes("CHƠI MỚI")),
        all: btns,
      };
    });

  const readGame = () =>
    page.evaluate(() => {
      const g = window.__game;
      if (!g || !g.player) return null;
      return {
        state: g.state,
        level: g.player.level,
        xp: g.player.xp,
        coins: g.player.coins,
        weapons: Object.keys(g.player.weapons.weapons),
        currentId: g.player.weapons.currentId,
        drone: g.player.hasDrone,
        skillPoints: g.player.skillPoints,
        upgradeLevels: { ...g.player.upgradeLevels },
        wave: g.waveManager.wave,
        waveState: g.waveManager.state,
        toSpawn: g.waveManager.to_spawn,
        zombies: g.zombies.map((z) => ({
          kind: z.KIND,
          hp: z.hp,
          maxHp: z.maxHp,
        })),
      };
    });

  const waitGame = async () => {
    for (let i = 0; i < 120; i++) {
      const g = await readGame();
      if (g && (g.state === "PLAYING" || g.state === "MENU")) return g;
      await page.waitForTimeout(250);
    }
    throw new Error("game did not boot");
  };

  const clickButton = async (nameRe) => {
    const btn = page.locator("button").filter({ hasText: nameRe }).first();
    await btn.click();
  };

  const startNewGameViaModal = async () => {
    await clickButton(/CHƠI MỚI/);
    await page.waitForTimeout(400);
    const ok = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"][aria-label="XÁC NHẬN GAME MỚI"]');
      if (!dlg) return false;
      const btn = Array.from(dlg.querySelectorAll("button")).find((b) =>
        (b.textContent || "").trim() === "CHƠI MỚI"
      );
      if (btn) btn.click();
      return !!btn;
    });
    if (!ok) throw new Error("New Game modal did not open");
    await page.waitForURL(/\/play/, { timeout: 15000 });
  };

  const goLobby = async () => {
    await page.evaluate(() => {
      const g = window.__game;
      if (g) g.doAction("leave_to_lobby");
    });
    await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 });
    await page.waitForSelector("button", { timeout: 15000 });
    await page.waitForTimeout(1200);
  };

  // ---------------------------------------------------------------- setup --
  console.log(`user: ${USER}`);
  await page.goto(BASE + "/");
  const reg = await api("/api/player/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS, display_name: "Fidelity" }),
  });
  check("register ok", reg.status === 200 && reg.body?.success === true, reg.body);
  const login = await api("/api/player/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  check("login ok", login.status === 200 && login.body?.success === true, login.body);
  await page.goto(BASE + "/");
  await page.waitForSelector("button", { timeout: 15000 });
  await page.waitForTimeout(800);

  // ---- A) Level-up during an UNSAVED run must NOT surface Continue --------
  console.log("\n== A: skill-sync stub row does not create a Continue save ==");
  let lb = await lobbyButtons();
  check("fresh lobby: NEW GAME present, Continue absent", lb.newGameBtn && !lb.continueBtn, lb.all);

  await startNewGameViaModal();
  await page.waitForURL(/\/play/, { timeout: 15000 });
  await waitGame();

  // Level up twice (level 1 -> 3) through the real XP path so onLevelUp runs
  // and syncs the Skill Tree to the DB row immediately.
  await page.evaluate(() => {
    const g = window.__game;
    // Level 1 needs XP_BASE; level 2 needs 2*XP_BASE. Adding 3*XP_BASE (at
    // the level-1 rate) yields exactly two level-ups -> level 3, 2 points.
    g.player.addXp(g.player.xpNeeded * 3, g);
  });
  let g = await readGame();
  check("level-up happened in run (level 3)", g.level === 3, g.level);

  // Let the skill-state sync POST land (it UPSERTs the account Skill Tree
  // into the same game_saves row, creating the row when the run was never
  // saved).
  await page.waitForTimeout(1200);
  const sync = await api("/api/game/skill-state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      level: g.level,
      xp: g.xp,
      skill_points: g.skillPoints,
      skills: g.upgradeLevels,
    }),
  });
  check(
    "skill state persisted server-side (row exists, level " + g.level + ")",
    sync.status === 200 && sync.body?.state?.level === 3,
    sync.body
  );

  await goLobby();
  lb = await lobbyButtons();
  check("Continue NOT shown after unsaved run with level-ups", !lb.continueBtn, lb.all);
  const saveA = await api("/api/game/save");
  check(
    "GET /api/game/save returns null for the skill-only row (no fake Continue)",
    saveA.body?.save == null,
    saveA.body
  );

  // ---- B + C) Mid-wave save restores wave + alive zombies + full state ----
  console.log("\n== B/C: mid-wave save -> Continue restores wave, enemies, state ==");
  await startNewGameViaModal();
  await page.waitForURL(/\/play/, { timeout: 15000 });
  await waitGame();

  // Wait for wave 1 to actually start spawning zombies.
  g = await readGame();
  for (let i = 0; i < 80 && (!g || g.wave < 1 || g.waveState !== "active" || g.zombies.length < 2); i++) {
    await page.waitForTimeout(250);
    g = await readGame();
  }
  check("reached an active wave with >=2 zombies on screen", !!g && g.wave >= 1 && g.waveState === "active" && g.zombies.length >= 2, g && { wave: g.wave, n: g.zombies.length });

  const savedWave = g.wave;
  const savedEnemyCount = g.zombies.length;

  // Simulate a meaningful mid-wave moment: half-kill every zombie, and give
  // the run real progression to verify full-state fidelity.
  await page.evaluate(() => {
    const g = window.__game;
    for (const z of g.zombies) z.hp = Math.max(1, z.maxHp / 2);
    g.player.level = 8;
    g.player.xp = 340;
    g.player.coins = 750;
    g.player.skillPoints = 4;
    g.player.upgradeLevels = { damage: 3, max_hp: 2 };
    g.player.weapons.give("smg");
    g.player.weapons.give("shotgun");
    g.player.weapons.currentId = "shotgun";
    g.player.hasDrone = true;
  });

  await page.evaluate(() => window.__game.performSaveGame());
  // Wait for the POST to land (read back through the API).
  let dbSave = null;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    const s = await api("/api/game/save");
    dbSave = s.body?.save;
    if (dbSave && dbSave.wave === savedWave) break;
  }
  check(
    "DB save captured wave " + savedWave + " + " + savedEnemyCount + " enemies",
    !!dbSave && dbSave.wave === savedWave && (dbSave.world_data?.enemies || []).length === savedEnemyCount,
    dbSave && { wave: dbSave.wave, enemies: dbSave.world_data?.enemies?.length }
  );
  const dbEnemies = dbSave?.world_data?.enemies || [];
  check(
    "saved enemy hp is wounded (0.5 * maxHp) — not re-inflated",
    dbEnemies.length > 0 &&
      dbEnemies.every((e) => e.hp > 0 && Math.abs(e.hp / e.maxHp - 0.5) < 0.001),
    dbEnemies[0]
  );
  check(
    "wave manager phase/timers saved (active mid-wave)",
    dbSave?.progression_data?.waveManager?.state === "active" &&
      typeof dbSave?.progression_data?.waveManager?.to_spawn === "number",
    dbSave?.progression_data?.waveManager
  );
  check(
    "DB save has full state (level 8, $750, shotgun+smg, skills, drone)",
    dbSave?.level === 8 && dbSave?.money === 750 &&
      (dbSave?.weapon_data?.unlocked || []).includes("shotgun") &&
      (dbSave?.weapon_data?.unlocked || []).includes("smg") &&
      dbSave?.player_data?.skillPoints === 4 &&
      dbSave?.player_data?.upgradeLevels?.damage === 3 &&
      dbSave?.player_data?.hasDrone === true,
    dbSave && { level: dbSave.level, money: dbSave.money, w: dbSave.weapon_data?.unlocked }
  );

  await goLobby();
  lb = await lobbyButtons();
  check("lobby shows CONTINUE after mid-wave save", lb.continueBtn, lb.all);

  await clickButton(/TIẾP TỤC CHƠI/);
  await page.waitForURL(/continue=1/, { timeout: 15000 });
  g = await waitGame();
  check(
    "Continue restores the SAME wave " + savedWave + " (not wave 1 / not advanced)",
    g.wave === savedWave,
    g
  );
  check(
    "Continue restores wave phase (active mid-wave)",
    g.waveState === "active" && g.toSpawn >= 0,
    g
  );
  check(
    "Continue re-materializes the alive zombies (count " + savedEnemyCount + ")",
    g.zombies.length === savedEnemyCount,
    g.zombies.length
  );
  check(
    "restored zombies stay wounded (hp ~ maxHp/2)",
    g.zombies.length > 0 && g.zombies.every((z) => Math.abs(z.hp / z.maxHp - 0.5) < 0.001),
    g.zombies[0]
  );
  check(
    "Continue restores full state: level 8, $750, shotgun equipped, smg owned, skills, drone",
    g.level === 8 && g.xp === 340 && g.coins === 750 &&
      g.currentId === "shotgun" && g.weapons.includes("shotgun") &&
      g.weapons.includes("smg") && g.skillPoints === 4 &&
      g.upgradeLevels.damage === 3 && g.upgradeLevels.max_hp === 2 &&
      g.drone === true,
    { level: g.level, coins: g.coins, cur: g.currentId, weps: g.weapons, sp: g.skillPoints, sk: g.upgradeLevels }
  );

  // Leave this run — save stays (Continue keeps it).
  await goLobby();

  // ---- D) Save during first intermission must not skip wave 1 -------------
  console.log("\n== D: wave-0 save (first intermission) resumes at wave 1 ==");
  await startNewGameViaModal();
  await page.waitForURL(/\/play/, { timeout: 15000 });
  await waitGame();
  // Pause during the opening intermission, before wave 1 starts.
  g = await readGame();
  let savedAt0 = false;
  for (let i = 0; i < 10; i++) {
    g = await readGame();
    if (g && g.wave === 0 && g.waveState === "intermission") {
      savedAt0 = true;
      break;
    }
    await page.waitForTimeout(100);
  }
  check("run is in the wave-0 intermission", savedAt0, g && { wave: g.wave, st: g.waveState });
  await page.evaluate(() => window.__game.performSaveGame());
  dbSave = null;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    const s = await api("/api/game/save");
    dbSave = s.body?.save;
    if (dbSave && dbSave.wave === 0) break;
  }
  check(
    "wave-0 save stored as wave 0 (not coerced to 1)",
    !!dbSave && dbSave.wave === 0,
    dbSave && dbSave.wave
  );
  await goLobby();
  lb = await lobbyButtons();
  check("Continue shown after wave-0 save", lb.continueBtn, lb.all);
  await clickButton(/TIẾP TỤC CHƠI/);
  await page.waitForURL(/continue=1/, { timeout: 15000 });
  g = await waitGame();
  check(
    "Continue restores wave 0 intermission, next wave played is wave 1 (no skip)",
    g.wave === 0 && g.waveState === "intermission",
    g
  );
  // Let the intermission elapse and assert the first wave is 1, not 2.
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(250);
    g = await readGame();
    if (g && g.wave >= 1) break;
  }
  check("first wave after wave-0 continue is wave 1", g && g.wave === 1, g && g.wave);

  await browser.close();
  console.log("\n" + (failures === 0 ? "ALL FIDELITY CHECKS PASSED ✅" : `${failures} FAILURES ❌`));
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error("SCRIPT ERROR:", err.message);
  process.exit(1);
});
