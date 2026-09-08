// newgame-modal-check.cjs
// Verifies that CHƠI MỚI (NEW GAME) opens an in-game confirmation modal and
// never a native browser confirm() dialog:
//   A. click NEW GAME -> custom modal appears (no native dialog)
//   B. HỦY / ESC / overlay click close the modal, save untouched
//   C. CHƠI MỚI starts the fresh run
//   D. reload -> no native dialog
//
// Usage: PORT=3210 node scripts/newgame-modal-check.cjs

const { chromium } = require("playwright");

const BASE = `http://localhost:${process.env.PORT || 3210}`;
const USER = `ngmodal${Date.now() % 100000}`;
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

  let nativeDialogs = 0;
  page.on("dialog", async (d) => {
    nativeDialogs++;
    console.log(`  !! native dialog fired: ${d.type()} — ${d.message()}`);
    await d.dismiss().catch(() => {});
  });

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

  const hasSave = () =>
    page.evaluate(async () => {
      const res = await fetch("/api/game/save");
      const data = await res.json();
      return !!data.save;
    });

  const modalVisible = () =>
    page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"][aria-label="XÁC NHẬN GAME MỚI"]');
      if (!dlg) return false;
      const t = dlg.textContent || "";
      return t.includes("BẮT ĐẦU GAME MỚI") && t.includes("HỦY") && t.includes("CHƠI MỚI");
    });

  const clickWhenAvailable = async (nameRe, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const clicked = await page.evaluate((re) => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) =>
          re.test((b.textContent || "").replace(/\s+/g, " "))
        );
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }, nameRe);
      if (clicked) return;
      await page.waitForTimeout(250);
    }
    throw new Error(`button ${nameRe} did not appear`);
  };

  // ---------------------------------------------------------------- setup --
  console.log(`user: ${USER}`);
  await page.goto(BASE + "/");
  const reg = await api("/api/player/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  check("register ok", reg.status === 200 && reg.body?.success === true, reg.body);
  await api("/api/player/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });

  // Create a save so the lobby shows CONTINUE + CHƠI MỚI (NEW GAME).
  await page.goto(BASE + "/play?mode=single&name=SeedSave");
  for (let i = 0; i < 120; i++) {
    if (await page.evaluate(() => window.__game?.state === "PLAYING")) break;
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => window.__game.performSaveGame());
  await page.waitForTimeout(600);
  check("save created (Continue should appear in lobby)", await hasSave());
  await page.evaluate(() => window.__game.doAction("leave_to_lobby"));
  await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 });
  await page.waitForTimeout(1200);

  // A. click NEW GAME -> custom modal, no native dialog
  console.log("\n== A. NEW GAME opens custom modal (no native dialog) ==");
  await clickWhenAvailable(/CHƠI MỚI/);
  await page.waitForTimeout(400);
  check("custom modal visible", await modalVisible());
  check("no native dialog fired", nativeDialogs === 0, { nativeDialogs });

  // B1. HỦY closes the modal, save untouched
  console.log("\n== B. cancel paths leave the save untouched ==");
  await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"][aria-label="XÁC NHẬN GAME MỚI"]');
    const btn = Array.from(dlg.querySelectorAll("button")).find((b) =>
      (b.textContent || "").trim() === "HỦY"
    );
    btn.click();
  });
  await page.waitForTimeout(300);
  check("HỦY closes modal", !(await modalVisible()));
  check("save still exists after HỦY", await hasSave());

  // B2. ESC closes the modal
  await clickWhenAvailable(/CHƠI MỚI/);
  await page.waitForTimeout(300);
  check("modal reopened", await modalVisible());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("ESC closes modal", !(await modalVisible()));
  check("save still exists after ESC", await hasSave());

  // B3. click on the overlay closes the modal
  await clickWhenAvailable(/CHƠI MỚI/);
  await page.waitForTimeout(300);
  const overlay = page.locator("div[role=presentation]").first();
  await overlay.click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(300);
  check("overlay click closes modal", !(await modalVisible()));
  check("save still exists after overlay click", await hasSave());

  // C. CHƠI MỚI starts the fresh run
  console.log("\n== C. confirm starts the new game ==");
  await clickWhenAvailable(/CHƠI MỚI/);
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"][aria-label="XÁC NHẬN GAME MỚI"]');
    const btn = Array.from(dlg.querySelectorAll("button")).find((b) =>
      (b.textContent || "").trim() === "CHƠI MỚI"
    );
    btn.click();
  });
  await page.waitForURL(/\/play/, { timeout: 15000 });
  let fresh = null;
  for (let i = 0; i < 120; i++) {
    fresh = await page.evaluate(() => {
      const g = window.__game;
      if (!g?.player || g.state !== "PLAYING") return null;
      return {
        level: g.player.level,
        coins: g.player.coins,
        weapons: Object.keys(g.player.weapons.weapons),
        drone: g.player.hasDrone,
        skillPoints: g.player.skillPoints,
      };
    });
    if (fresh) break;
    await page.waitForTimeout(250);
  }
  check(
    "run started fresh (level 1, $0, pistol only, no drone, no skill points)",
    fresh && fresh.level === 1 && fresh.coins === 0 &&
      fresh.weapons.length === 1 && fresh.weapons[0] === "pistol" &&
      fresh.drone === false && fresh.skillPoints === 0,
    fresh
  );
  check("old save preserved (Continue can still restore it)", await hasSave());
  check("no native dialog fired in the whole flow", nativeDialogs === 0, { nativeDialogs });

  // D. reload lobby -> still no native dialog
  console.log("\n== D. reload does not fire native dialog ==");
  await page.evaluate(() => window.__game.doAction("leave_to_lobby"));
  await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 });
  await page.waitForTimeout(1200);
  check("lobby reloaded without native dialog", nativeDialogs === 0, { nativeDialogs });

  await browser.close();

  console.log("\n" + (failures === 0 ? "ALL NEW-GAME MODAL CHECKS PASSED ✅" : `${failures} FAILURES ❌`));
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error("SCRIPT ERROR:", err.message);
  process.exit(1);
});