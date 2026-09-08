// continue-flow-check.cjs
// End-to-end acceptance check for the NEW GAME / SAVE GAME / CONTINUE rules:
//   Test 1 — New Game -> Return to Lobby WITHOUT Save -> Continue NOT shown
//   Test 2 — New Game -> play -> Save Game -> Return to Lobby -> Continue shown,
//            Continue restores the saved state
//   Test 3 — Old save exists -> New Game -> play -> Return to Lobby WITHOUT Save
//            -> Continue still shown and loads the OLD save (not the new run)
//   Test 4 — New Game starts fully fresh (level 1, $0, pistol only, no drone,
//            skill tree reset)
//
// Usage: node scripts/continue-flow-check.cjs  (requires a dev server on PORT)

const { chromium } = require("playwright");

const BASE = `http://localhost:${process.env.PORT || 3210}`;
const USER = `contflow${Date.now() % 100000}`;
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
        coins: g.player.coins,
        weapons: Object.keys(g.player.weapons.weapons),
        currentId: g.player.weapons.currentId,
        drone: g.player.hasDrone,
        skillPoints: g.player.skillPoints,
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
    const btn = page.locator("button").filter({ hasText: nameRe }).first();
    await btn.click();
  };

  // NEW GAME now opens an in-game modal — click CHƠI MỚI in the lobby, then
  // confirm through the modal to actually start the run.
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

  const goLobby = async (viaMenu) => {
    // Leave the run exactly like the in-game "Return to Lobby" button does.
    await page.evaluate(() => {
      const g = window.__game;
      if (g) g.doAction("leave_to_lobby");
    });
    await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 });
    await page.waitForSelector("button", { timeout: 15000 });
    // Let the lobby's checkSave() fetch resolve before reading buttons.
    await page.waitForTimeout(1200);
  };

  // ---------------------------------------------------------------- setup --
  console.log(`user: ${USER}`);
  await page.goto(BASE + "/");
  const reg = await api("/api/player/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS, display_name: "Flow" }),
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

  // -------------------------------------------- Test 1 + Test 4 (no save) --
  console.log("\n== Test 1 + 4: fresh account, New Game without Save ==");
  let lb = await lobbyButtons();
  check("lobby shows CHƠI MỚI (NEW GAME), no Continue (no save)", lb.newGameBtn && !lb.continueBtn, lb.all);
  const save0 = await api("/api/game/save");
  check("DB has no save yet", save0.body?.save == null);

  await startNewGameViaModal();
  await page.waitForURL(/\/play/, { timeout: 15000 });
  let g = await waitGame();
  // Wave 1 starts after the 3s intermission — wait for it.
  for (let i = 0; i < 24 && g.wave < 1; i++) {
    await page.waitForTimeout(250);
    g = await readGame();
  }
  check(
    "fresh run: level 1, $0, pistol only, no drone, skill reset, wave 1",
    g.level === 1 && g.coins === 0 && g.weapons.length === 1 &&
      g.weapons[0] === "pistol" && g.currentId === "pistol" &&
      g.drone === false && g.skillPoints === 0 && g.wave >= 1,
    g
  );

  await goLobby(true);
  lb = await lobbyButtons();
  check("after Return to Lobby without Save: Continue NOT shown", !lb.continueBtn, lb.all);
  const save1 = await api("/api/game/save");
  check("DB save still absent after New Game + Return", save1.body?.save == null);

  // ---------------------------------------------- Test 2 (explicit save) --
  console.log("\n== Test 2: New Game -> play -> Save Game -> Continue restores ==");
  await startNewGameViaModal();
  await page.waitForURL(/\/play/, { timeout: 15000 });
  await waitGame();

  // Make the run meaningful, then save it explicitly.
  await page.evaluate(() => {
    const g = window.__game;
    g.player.coins = 500;
    g.player.level = 7;
    g.player.xp = 300;
    g.player.skillPoints = 2;
    g.player.weapons.give("shotgun");
    g.player.hasDrone = false;
  });
  await page.evaluate(() => window.__game.performSaveGame());
  const save2 = await api("/api/game/save");
  check(
    "explicit Save Game wrote level 7, $500, shotgun",
    save2.body?.save?.level === 7 && save2.body?.save?.money === 500 &&
      (save2.body?.save?.weapon_data?.unlocked || []).includes("shotgun"),
    save2.body?.save
  );

  await goLobby(true);
  lb = await lobbyButtons();
  check("lobby shows CONTINUE after explicit Save", lb.continueBtn && lb.newGameBtn, lb.all);

  await clickButton(/TIẾP TỤC CHƠI/);
  await page.waitForURL(/continue=1/, { timeout: 15000 });
  g = await waitGame();
  check(
    "Continue restores saved state (level 7, $500, shotgun owned)",
    g.level === 7 && g.coins === 500 && g.weapons.includes("shotgun") && g.skillPoints === 2,
    g
  );

  // --------------------------------- Test 3 (old save + New Game w/o Save) --
  console.log("\n== Test 3: old save preserved across New Game without Save ==");
  await goLobby(true);
  lb = await lobbyButtons();
  check("lobby shows CONTINUE + NEW GAME (old save exists)", lb.continueBtn && lb.newGameBtn, lb.all);

  // NEW GAME now opens an in-game modal (no native confirm dialog) —
  // click its CHƠI MỚI button to confirm.
  await clickButton(/CHƠI MỚI/);
  await page.waitForTimeout(400);
  const confirmed = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"][aria-label="XÁC NHẬN GAME MỚI"]');
    if (!dlg) return false;
    const btn = Array.from(dlg.querySelectorAll("button")).find((b) =>
      (b.textContent || "").trim() === "CHƠI MỚI"
    );
    if (btn) btn.click();
    return !!btn;
  });
  if (!confirmed) throw new Error("New Game modal did not open");
  await page.waitForURL(/\/play/, { timeout: 15000 });
  g = await waitGame();
  check("New Game boots fresh despite old save (level 1, $0, pistol)", 
    g.level === 1 && g.coins === 0 && g.weapons.length === 1 && g.weapons[0] === "pistol",
    g);

  // Play the new run a bit and change state — but DO NOT save.
  await page.evaluate(() => {
    const g = window.__game;
    g.player.coins = 250;
    g.player.level = 4;
    g.player.weapons.give("sniper");
  });

  await goLobby(true);
  lb = await lobbyButtons();
  check("Continue still shown after New Game + Return without Save", lb.continueBtn, lb.all);
  const save3 = await api("/api/game/save");
  check(
    "DB save is still the OLD save (level 7, $500) — untouched",
    save3.body?.save?.level === 7 && save3.body?.save?.money === 500,
    save3.body?.save
  );

  await clickButton(/TIẾP TỤC CHƠI/);
  await page.waitForURL(/continue=1/, { timeout: 15000 });
  g = await waitGame();
  check(
    "Continue loads the OLD save, not the abandoned New Game",
    g.level === 7 && g.coins === 500 && g.weapons.includes("shotgun") &&
      !g.weapons.includes("sniper"),
    g
  );

  await browser.close();

  console.log("\n" + (failures === 0 ? "ALL ACCEPTANCE TESTS PASSED ✅" : `${failures} FAILURES ❌`));
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error("SCRIPT ERROR:", err.message);
  process.exit(1);
});