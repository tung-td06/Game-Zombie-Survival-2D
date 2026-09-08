// scripts/bestiary-check.cjs
// Browser check for the lobby BESTIARY section.
// Usage: PORT=3210 node scripts/bestiary-check.cjs
//
// Asserts:
//   1. BESTIARY card is present under HOW TO PLAY with 10 enemy rows
//   2. every row lists a name from /data/zombies.json and a WAVE badge
//   3. sprite canvases are actually drawn (non-empty pixels)
//   4. clicking a row opens the in-game detail modal (no native dialog)
//   5. ESC / close button / overlay close all dismiss the modal
//   6. detail shows stats + boss badge for NECROMANCER KING (boss row)
//   7. desktop: no horizontal overflow; mobile landscape: single column
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const PORT = process.env.PORT || 3210;
const BASE = `http://127.0.0.1:${PORT}`;

const zombiesJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../public/data/zombies.json"), "utf8"),
);

let passed = 0;
let failed = 0;
const failures = [];
function check(name, ok, extra = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function main() {
  const browser = await chromium.launch();
  const dialogs = [];
  const consoleErrors = [];

  // ---- Desktop ------------------------------------------------------------
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("dialog", async (d) => {
    dialogs.push(d.message());
    await d.dismiss();
  });
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  console.log("== 1. Desktop 1440x900 ==");
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=BESTIARY", { timeout: 20000 });
  // Data loads async (fetch of /data/zombies.json) — wait for the first row.
  await page.waitForSelector('button[aria-label^="Xem chi tiết"]', { timeout: 15000 });

  const rows = page.locator('button[aria-label^="Xem chi tiết"]');
  const count = await rows.count();
  check("BESTIARY shows all zombies.json enemies", count === Object.keys(zombiesJson).length, `(got ${count})`);

  // Rows must list every name once.
  const rowTexts = await rows.allTextContents();
  const names = Object.values(zombiesJson).map((z) => z.name.toUpperCase());
  for (const n of names) {
    check(`row present for ${n}`, rowTexts.some((t) => t.toUpperCase().includes(n)));
  }
  const hasWaveBadge = await rows.first().textContent();
  check("row shows WAVE badge", /WAVE \d+\+/.test(hasWaveBadge));

  // Sprite canvases contain actual pixels.
  const canvasStats = await page.evaluate(() => {
    const cvs = Array.from(document.querySelectorAll("canvas"));
    const counts = [];
    for (const cv of cvs.slice(0, 12)) {
      try {
        const ctx2 = cv.getContext("2d");
        const d = ctx2.getImageData(0, 0, cv.width, cv.height).data;
        let lit = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++;
        counts.push(lit / (d.length / 4));
      } catch {
        counts.push(-1);
      }
    }
    return counts;
  });
  check(
    "sprite canvases are drawn",
    canvasStats.length >= 10 && canvasStats.every((c) => c > 0.05),
    JSON.stringify(canvasStats),
  );

  // No horizontal overflow on desktop.
  const desktopOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("desktop: no horizontal overflow", desktopOverflow <= 1, `(delta ${desktopOverflow})`);

  // ---- Modal ---------------------------------------------------------------
  console.log("== 2. Detail modal ==");
  await rows.filter({ hasText: "NECROMANCER KING" }).click();
  const modal = page.locator('[role="dialog"][aria-label^="Chi tiết quái vật"]');
  await modal.waitFor({ timeout: 5000 });
  check("modal opens on row click", (await modal.count()) === 1);

  const modalText = await modal.textContent();
  check("modal shows BOSS badge", /BOSS/.test(modalText));
  check("modal shows HP stat", /MÁU|HP/.test(modalText));
  check("modal shows wave info", /WAVE 15\+/.test(modalText));
  check("modal shows strategy section", /CÁCH ĐỐI PHÓ/.test(modalText));
  check("modal threat stars", /★/.test(modalText));
  check("no native browser dialog", dialogs.length === 0, `(got ${dialogs.length})`);

  // Close via ✕
  await modal.locator('button[aria-label="Đóng"]').click();
  await page.waitForTimeout(250);
  check("modal closes via ✕", (await modal.count()) === 0);

  // Reopen and close via ESC
  await rows.filter({ hasText: "ABOMINATION" }).click();
  await modal.waitFor({ timeout: 5000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  check("modal closes via ESC", (await modal.count()) === 0);

  // Reopen and close via overlay click (top-left corner is overlay)
  await rows.filter({ hasText: "SPITTER" }).click();
  await modal.waitFor({ timeout: 5000 });
  await page.mouse.click(8, 8);
  await page.waitForTimeout(250);
  check("modal closes via overlay click", (await modal.count()) === 0);

  // ---- Mobile landscape -----------------------------------------------------
  console.log("== 3. Mobile landscape 844x390 ==");
  await page.setViewportSize({ width: 844, height: 390 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=BESTIARY", { timeout: 20000 });
  await page.waitForSelector('button[aria-label^="Xem chi tiết"]', { timeout: 15000 });

  const mRows = page.locator('button[aria-label^="Xem chi tiết"]');
  check("mobile: all rows render", (await mRows.count()) === Object.keys(zombiesJson).length);
  const mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("mobile: no horizontal overflow", mobileOverflow <= 1, `(delta ${mobileOverflow})`);

  // Rows must fit the single-column lobby (no row wider than viewport).
  const rowBoxes = await mRows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
  check("mobile: rows stay inside viewport", rowBoxes.every((r) => r <= 844 + 1), JSON.stringify(rowBoxes.slice(0, 3)));

  // Open + close modal on a narrow screen.
  await mRows.filter({ hasText: "NECROMANCER KING" }).click();
  await modal.waitFor({ timeout: 5000 });
  const box = await modal.boundingBox();
  check("mobile: modal fits viewport width", box.x >= 0 && box.x + box.width <= 844 + 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  check("mobile: modal closes", (await modal.count()) === 0);

  const realErrors = consoleErrors.filter(
    (e) => !/favicon|websocket|401|Failed to load resource|net::ERR/i.test(e),
  );
  check("no unexpected console errors", realErrors.length === 0, JSON.stringify(realErrors.slice(0, 3)));

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("FAILED:", failures.join(", "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
