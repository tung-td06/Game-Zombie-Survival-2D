// xp-save-check.cjs
// End-to-end verification that SAVE GAME / CONTINUE persist the player's
// exact Level + XP progression (not just level):
//   Test 1 — Level 1, XP 0            -> Continue restores 1 / 0 / 0%
//   Test 2 — Level 3, XP 120 (40%)    -> Continue restores 3 / 120 / 40%
//   Test 3 — Level 5, XP 425 (85%)    -> Continue restores 5 / 425 / 85%
//   Test 4 — Level 4, XP 380 (95%)    -> Continue restores 4 / 380 / 95%
//   Test 5 — Level 4 @ 380 + 20 XP -> Level 5, XP 0 -> Continue restores 5 / 0
//
// XP is injected into the live game player (the exact object the HUD reads),
// then saved through the real Save Game flow and restored through Continue.
// The DB row (GET /api/game/save) is also checked for level + xp columns.
//
// Usage: node scripts/xp-save-check.cjs  (dev server on PORT)

const { chromium } = require("playwright");

const BASE = `http://localhost:${process.env.PORT || 3210}`;
const USER = `xpsave${Date.now() % 100000}`;
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
        try {
          body = await res.json();
        } catch {}
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
        coins: g.player.coins,
        wave: g.waveManager.wave,
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

  const goLobby = async () => {
    await page.evaluate(() => {
      const g = window.__game;
      if (g) g.doAction("leave_to_lobby");
    });
    await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 });
    await page.waitForSelector("button", { timeout: 15000 });
    await page.waitForTimeout(1200);
  };

  // Inject an exact level/xp state, then save through the real flow.
  const setXpAndSave = async (level, xp) => {
    await page.evaluate(
      ({ level, xp }) => {
        const g = window.__game;
        g.player.level = level;
        g.player.xp = xp;
        g.doAction("save_game");
      },
      { level, xp }
    );
    // Wait for the save POST to land.
    for (let i = 0; i < 40; i++) {
      const st = await page.evaluate(() => window.__game.saveButtonState);
      if (st === "success") break;
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(300);
  };

  const continueFromLobby = async () => {
    await clickButton(/TIẾP TỤC CHƠI/);
    await page.waitForURL(/\/play/, { timeout: 15000 });
    await waitGame();
  };

  const dbRow = async () => {
    const res = await api("/api/game/save");
    const s = res.body?.save;
    return s ? { level: s.level, xp: s.xp } : null;
  };

  console.log(`user: ${USER}`);
  await page.goto(BASE + "/");
  const reg = await api("/api/player/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS, display_name: "XP" }),
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

  // ------------------------------------------------------------------ Test 1
  console.log("\n== Test 1: Level 1, XP 0 ==");
  await setXpAndSave(1, 0);
  const row1 = await dbRow();
  check("DB row stores level=1, xp=0", row1 && row1.level === 1 && row1.xp === 0, row1);
  await goLobby();
  await continueFromLobby();
  let g = await readGame();
  check("Continue restores Level 1, XP 0, bar 0%", g.level === 1 && g.xp === 0 && g.frac === 0, g);

  // ------------------------------------------------------------------ Test 2
  console.log("\n== Test 2: Level 3, XP 120 (40% of 300) ==");
  await setXpAndSave(3, 120);
  const row2 = await dbRow();
  check("DB row stores level=3, xp=120", row2 && row2.level === 3 && row2.xp === 120, row2);
  await goLobby();
  await continueFromLobby();
  g = await readGame();
  check("Continue restores Level 3, XP 120, bar 40%", g.level === 3 && g.xp === 120 && g.xpNeeded === 300 && Math.abs(g.frac - 0.4) < 1e-9, g);

  // ------------------------------------------------------------------ Test 3
  console.log("\n== Test 3: Level 5, XP 425 (85% of 500) ==");
  await setXpAndSave(5, 425);
  const row3 = await dbRow();
  check("DB row stores level=5, xp=425", row3 && row3.level === 5 && row3.xp === 425, row3);
  await goLobby();
  await continueFromLobby();
  g = await readGame();
  check("Continue restores Level 5, XP 425, bar 85%", g.level === 5 && g.xp === 425 && g.xpNeeded === 500 && Math.abs(g.frac - 0.85) < 1e-9, g);

  // ------------------------------------------------------------------ Test 4
  console.log("\n== Test 4: Level 4, XP 380 (95%, no level-up) ==");
  await setXpAndSave(4, 380);
  const row4 = await dbRow();
  check("DB row stores level=4, xp=380", row4 && row4.level === 4 && row4.xp === 380, row4);
  await goLobby();
  await continueFromLobby();
  g = await readGame();
  check("Continue restores Level 4, XP 380, bar 95%", g.level === 4 && g.xp === 380 && Math.abs(g.frac - 0.95) < 1e-9, g);

  // ------------------------------------------------------------------ Test 5
  console.log("\n== Test 5: Level 4 @ 380 + 20 XP -> Level 5, XP 0 ==");
  await page.evaluate(() => {
    const g = window.__game;
    g.player.level = 4;
    g.player.xp = 380;
    g.player.addXp(20, g); // 380 + 20 = 400 == xpNeeded(4) -> Level 5, XP 0
  });
  const afterLevel = await readGame();
  check("addXp leveled 4->5 and consumed XP (5 / 0)", afterLevel.level === 5 && afterLevel.xp === 0, afterLevel);
  await page.evaluate(() => window.__game.doAction("save_game"));
  for (let i = 0; i < 40; i++) {
    const st = await page.evaluate(() => window.__game.saveButtonState);
    if (st === "success") break;
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(300);
  const row5 = await dbRow();
  check("DB row stores level=5, xp=0", row5 && row5.level === 5 && row5.xp === 0, row5);
  await goLobby();
  await continueFromLobby();
  g = await readGame();
  check("Continue restores Level 5, XP 0 (not Level 4 / XP 95)", g.level === 5 && g.xp === 0, g);

  await browser.close();
  console.log(failures === 0 ? "\nALL XP/LEVEL SAVE CHECKS PASSED ✅" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});