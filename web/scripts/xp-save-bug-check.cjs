// xp-save-bug-check.cjs
// Deep XP save/load bug regression suite. Reproduces the reported symptom —
// "pressing SAVE GAME makes XP increase" — by exercising the real flow:
//
//   Test 1 — User's exact case: Level 14 / XP 1238 -> save x3 -> still 1238
//   Test 2 — Real addXp level-up + IMMEDIATE save (skill-state sync in flight)
//   Test 3 — Multi-level addXp + IMMEDIATE save (the DB-corruption race)
//   Test 4 — Continue restores the exact snapshot (level + xp + bar)
//   Test 5 — adoptSkillState (skill spend response) must NOT clobber live XP
//   Test 6 — Spam Save x5 -> DB stays exact, no duplicate rows
//
// Usage: node scripts/xp-save-bug-check.cjs  (dev server on PORT)

const { chromium } = require("playwright");

const BASE = `http://localhost:${process.env.PORT || 3210}`;
const USER = `xpbug${Date.now() % 100000}`;
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

  const api = (path, opts) =>
    page.evaluate(
      async ({ path, opts }) => {
        const res = await fetch(path, opts);
        let body = null;
        try { body = await res.json(); } catch {}
        return { status: res.status, body };
      },
      { path, opts }
    );

  const readGame = () =>
    page.evaluate(() => {
      const g = window.__game;
      if (!g || !g.player) return null;
      return {
        state: g.state,
        level: g.player.level,
        xp: g.player.xp,
        xpNeeded: g.player.xpNeeded,
        frac: g.player.xp / g.player.xpNeeded,
        saveXp: g.save?.data?.xp,
        saveLevel: g.save?.data?.player_level,
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
    await page.locator("button").filter({ hasText: nameRe }).first().click();
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

  const saveNow = async () => {
    await page.evaluate(() => {
      const g = window.__game;
      g.doAction("save_game");
    });
    for (let i = 0; i < 60; i++) {
      const st = await page.evaluate(() => window.__game.saveButtonState);
      if (st === "success" || st === "error") break;
      await page.waitForTimeout(100);
    }
    // Let any fire-and-forget skill-state sync land before we compare.
    await page.waitForTimeout(600);
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

  const continueFromLobby = async () => {
    await clickButton(/TIẾP TỤC CHƠI/);
    await page.waitForURL(/\/play/, { timeout: 15000 });
    await waitGame();
  };

  const dbRow = async () => {
    const res = await api("/api/game/save");
    const s = res.body?.save;
    return s ? { level: s.level, xp: s.xp, wave: s.wave } : null;
  };

  console.log(`user: ${USER}`);
  await page.goto(BASE + "/");
  const reg = await api("/api/player/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS, display_name: "XPBug" }),
  });
  check("register ok", reg.status === 200 && reg.body?.success === true, reg.body);
  await api("/api/player/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  await page.goto(BASE + "/");
  await page.waitForSelector("button", { timeout: 15000 });
  await page.waitForTimeout(800);

  await startNewGameViaModal();
  await waitGame();

  // ----------------------------------------------------------- Test 1
  console.log("\n== Test 1: LV 14 / XP 1238 — save x3 must never change XP ==");
  await page.evaluate(() => {
    const g = window.__game;
    g.player.level = 14;
    g.player.xp = 1238;
    g.doAction("save_game");
  });
  for (let i = 0; i < 60; i++) {
    const st = await page.evaluate(() => window.__game.saveButtonState);
    if (st === "success" || st === "error") break;
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(600);
  let g = await readGame();
  check("live XP unchanged after save #1 (still 1238)", g.xp === 1238 && g.level === 14, g);
  let row = await dbRow();
  check("DB row xp=1238 level=14 after save #1", row && row.xp === 1238 && row.level === 14, row);

  await saveNow();
  g = await readGame();
  check("live XP unchanged after save #2", g.xp === 1238 && g.level === 14, g);
  row = await dbRow();
  check("DB row still 1238/14 after save #2", row && row.xp === 1238 && row.level === 14, row);

  await saveNow();
  g = await readGame();
  check("live XP unchanged after save #3", g.xp === 1238 && g.level === 14, g);
  row = await dbRow();
  check("DB row still 1238/14 after save #3 (no creep)", row && row.xp === 1238 && row.level === 14, row);

  // ----------------------------------------------------------- Test 6 (spam)
  console.log("\n== Test 6: spam SAVE 5x rapidly ==");
  for (let i = 0; i < 5; i++) await saveNow();
  g = await readGame();
  check("live XP still 1238 after spam", g.xp === 1238 && g.level === 14, g);
  row = await dbRow();
  check("DB still 1238/14 after spam (no increment, no dupes)", row && row.xp === 1238 && row.level === 14, row);

  // ----------------------------------------------------------- Test 4
  console.log("\n== Test 4: Continue restores the exact snapshot ==");
  await goLobby();
  await continueFromLobby();
  g = await readGame();
  check(
    "Continue restores LV 14 / XP 1238 / bar 88.4%",
    g.level === 14 && g.xp === 1238 && g.xpNeeded === 1400 && Math.abs(g.frac - 1238 / 1400) < 1e-9,
    g
  );

  // ----------------------------------------------------------- Test 2
  console.log("\n== Test 2: real addXp level-up + immediate save (sync in flight) ==");
  // Level 14, XP 1238. +500 -> 1738 - 1400 (xpNeeded@14) = XP 338, level 15.
  await page.evaluate(() => {
    const g = window.__game;
    g.player.level = 14;
    g.player.xp = 1238;
    g.player.addXp(500, g); // fires syncSkillState (fire-and-forget)
    g.doAction("save_game"); // snapshot IMMEDIATELY, while sync may be in flight
  });
  for (let i = 0; i < 60; i++) {
    const st = await page.evaluate(() => window.__game.saveButtonState);
    if (st === "success" || st === "error") break;
    await page.waitForTimeout(100);
  }
  // Wait longer so ANY late-arriving skill-state sync settles.
  await page.waitForTimeout(1500);
  g = await readGame();
  check("live XP after level-up + save = 338 (post-level-up remainder)", g.level === 15 && g.xp === 338, g);
  row = await dbRow();
  check(
    "DB row == live {15, 338} — sync did NOT overwrite the snapshot",
    row && row.level === 15 && row.xp === 338,
    row
  );

  // ----------------------------------------------------------- Test 3
  console.log("\n== Test 3: multi-level addXp + immediate save (mid-loop sync race) ==");
  // Level 2, XP 150. +500 -> 650 -> level 3 (XP 450, sync#1 body) -> level 4 (XP 150, sync#2 body).
  // Old code: sync#1 (xp 450) landing last could leave DB at {3, 450} != live {4, 150}.
  await page.evaluate(() => {
    const g = window.__game;
    g.player.level = 2;
    g.player.xp = 150;
    g.player.addXp(500, g);
    g.doAction("save_game");
  });
  for (let i = 0; i < 60; i++) {
    const st = await page.evaluate(() => window.__game.saveButtonState);
    if (st === "success" || st === "error") break;
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(1500);
  g = await readGame();
  check("live = {4, 150} after multi-level addXp", g.level === 4 && g.xp === 150, g);
  row = await dbRow();
  check(
    "DB row == live {4, 150} — no stale mid-loop XP/level persisted",
    row && row.level === 4 && row.xp === 150,
    row
  );

  // ----------------------------------------------------------- Test 5
  console.log("\n== Test 5: adoptSkillState (skill-spend response) must not clobber live XP ==");
  await page.evaluate(() => {
    const g = window.__game;
    g.player.level = 7;
    g.player.xp = 555;
    // Simulate a skill-upgrade response whose server mirror is stale/high.
    g.adoptSkillState({ level: 99, xp: 99999, skill_points: 2, skills: { damage: 3 } });
  });
  g = await readGame();
  check(
    "live level/XP untouched (7/555), only points+skills adopted",
    g.level === 7 && g.xp === 555 && g.saveXp === 555 && g.saveLevel === 7,
    g
  );
  const sp = await page.evaluate(() => ({
    sp: window.__game.player.skillPoints,
    dmg: window.__game.player.upgradeLevels.damage,
  }));
  check("skill points + tree adopted from server", sp.sp === 2 && sp.dmg === 3, sp);

  // ----------------------------------------------------------- Test 2b (Continue after level-up)
  console.log("\n== Test 2b: Continue after a level-up that was NOT saved keeps the snapshot ==");
  // Pin a known state {4, 150}, save it, then level up WITHOUT saving
  // (the skill-state sync writes the tree but must not touch the snapshot).
  await page.evaluate(() => {
    const g = window.__game;
    g.player.level = 4;
    g.player.xp = 150;
    g.doAction("save_game");
  });
  for (let i = 0; i < 60; i++) {
    const st = await page.evaluate(() => window.__game.saveButtonState);
    if (st === "success" || st === "error") break;
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const g = window.__game;
    g.player.addXp(1000, g); // 150 + 1000 = 1150 >= 400 -> level 5, XP 750 -> sync fired
  });
  await page.waitForTimeout(1000);
  await goLobby();
  await continueFromLobby();
  g = await readGame();
  check(
    "Continue restores the SAVED snapshot {4, 150} (not the unsaved level-up)",
    g.level === 4 && g.xp === 150,
    g
  );

  await browser.close();
  console.log(failures === 0 ? "\nALL XP SAVE/LOAD BUG CHECKS PASSED ✅" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});