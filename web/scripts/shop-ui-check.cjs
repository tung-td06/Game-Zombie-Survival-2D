// shop-ui-check.cjs
// Verifies the BLACK MARKET (in-run pause shop) layout in a real browser:
//   - every button label fits inside its button (no text spills onto cards)
//   - no shop button overlaps the BACK footer (grid fits above it)
//   - works at desktop (1280x720) and short mobile-landscape (844x390)
//   - a real click under the responsive scale still buys the item
//
// Usage: PORT=3210 node scripts/shop-ui-check.cjs

const { chromium } = require("playwright");

const BASE = `http://localhost:${process.env.PORT || 3210}`;
const USER = `shopcheck${Date.now() % 100000}`;
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

async function measureBtnText(page, b) {
  // Buttons are drawn in logical space and scaled by K, then returned with
  // screen-space rects — so compare the scaled label against the rect.
  return page.evaluate(
    ({ text, size }) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const K = Math.max(0.5, Math.min(1, (vw - 48) / 660, (vh - 48) / 540));
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.font = `bold ${size}px ui-monospace, monospace`;
      return ctx.measureText(text).width * K;
    },
    { text: b.text, size: b.fontSize }
  );
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.goto(BASE + "/");
  await page.evaluate(async ({ u, p }) => {
    await fetch("/api/player/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: p }),
    });
    await fetch("/api/player/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: p }),
    });
  }, { u: USER, p: PASS });
  await page.goto(BASE + "/play?mode=single&name=ShopTester");

  for (let i = 0; i < 120; i++) {
    const s = await page.evaluate(() => window.__game?.state === "PLAYING");
    if (s) break;
    await page.waitForTimeout(250);
  }

  const openShop = async () => {
    await page.evaluate(() => {
      window.__game.state = "PAUSED";
      window.__game.doAction("pause_shop");
    });
    await page.waitForTimeout(150);
  };

  const setTab = async (tab) => {
    await page.evaluate((t) => window.__game.doAction(`shop_tab:${t}`), tab);
    await page.waitForTimeout(150);
  };

  const snapButtons = () =>
    page.evaluate(() => {
      const btns = window.__game?.currentButtons ?? [];
      return btns.map((b) => ({
        text: b.text,
        action: b.action,
        x: Math.round(b.x),
        y: Math.round(b.y),
        w: Math.round(b.w),
        h: Math.round(b.h),
        fontSize: b.fontSize,
      }));
    });

  const intersects = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  const audit = async (tab) => {
    await setTab(tab);
    const btns = await snapButtons();
    const back = btns.find((b) => b.action === "pause_back");
    const others = btns.filter((b) => b.action !== "pause_back");
    let textFails = [];
    let overlapFails = [];
    for (const b of others) {
      if (!b.text) continue;
      const tw = await measureBtnText(page, b);
      // Auto-fit guarantees the label fits the button width.
      if (tw > b.w - 2) textFails.push({ t: b.text, w: Math.round(tw), bw: b.w });
      if (back && intersects(b, back)) {
        overlapFails.push({ t: b.text, card: { x: b.x, y: b.y, w: b.w, h: b.h }, back: { x: back.x, y: back.y } });
      }
      // Inside the canvas.
      if (b.x < 0 || b.y < 0) overlapFails.push({ t: b.text, offscreen: true, x: b.x, y: b.y });
    }
    check(`${tab}: every label fits its button`, textFails.length === 0, textFails);
    check(`${tab}: no card button overlaps BACK / goes offscreen`, overlapFails.length === 0, overlapFails);
    return { btns, back };
  };

  // ---------------------------------------------------------------- poor cash
  console.log("== desktop 1280x720, poor cash (NOT ENOUGH CASH everywhere) ==");
  await openShop();
  await page.evaluate(() => {
    window.__game.player.coins = 0;
  });
  await audit("weapons");
  await audit("supplies");
  await audit("upgrades");
  await audit("mods");

  // ---------------------------------------------------------------- rich cash
  console.log("\n== desktop 1280x720, rich cash ==");
  await page.evaluate(() => {
    window.__game.player.coins = 99999;
  });
  await audit("weapons");
  await audit("supplies");

  // ------------------------------------------- mobile landscape (scaled UI)
  console.log("\n== 844x390 mobile landscape (responsive scale active) ==");
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(200);
  await openShop();
  await audit("weapons");
  await audit("supplies");

  // A real click under the scaled UI must buy the item (hit-test mapping).
  const before = await page.evaluate(() => window.__game.player.coins);
  await page.evaluate(() => {
    window.__game.player.hp = 1; // ensure MEDKIT is buyable (needs hp < max)
    window.__game.player.coins = 99999;
  });
  await page.waitForTimeout(250); // let a frame rebuild the buttons
  await setTab("supplies");
  const btns = await snapButtons();
  const medkit = btns.find((b) => b.action === "ps_buy:medkit");
  if (medkit) {
    await page.mouse.click(medkit.x + medkit.w / 2, medkit.y + medkit.h / 2);
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => window.__game.player.coins);
    check("real click on MEDKIT under scale bought it (coins decreased)", after < 99999, { before: 99999, after });
    check("MEDKIT restored HP", (await page.evaluate(() => window.__game.player.hp)) > 1);
  } else {
    check("MEDKIT buy button found under scale", false, btns.map((b) => b.action));
  }

  await browser.close();

  console.log("\n" + (failures === 0 ? "ALL SHOP UI CHECKS PASSED ✅" : `${failures} FAILURES ❌`));
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error("SCRIPT ERROR:", err.message);
  process.exit(1);
});