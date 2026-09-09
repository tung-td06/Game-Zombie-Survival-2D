// Live proof that the canvas HUD (game.hudRects, drawn from ./hudLayout) and
// the React touch controls (DOM, positioned from the same ./hudLayout zones)
// never overlap, on real phone landscape viewports, with the game actually
// PLAYING. Catches the exact regression the user reported (bomb over minimap,
// fire over score, etc.).
const { chromium, devices } = require("playwright");

const BASE = `http://localhost:${process.env.PORT || 3217}`;

(async () => {
  const browser = await chromium.launch();
  let failures = 0;
  const must = (name, cond, extra) => {
    if (cond) console.log(`  ok: ${name}`);
    else { failures++; console.log(`  FAIL: ${name}${extra ? "  -> " + JSON.stringify(extra) : ""}`); }
  };
  const overlaps = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  for (const [label, w, h] of [
    ["iPhone 13 landscape", 844, 390],
    ["Pro Max landscape", 932, 430],
    ["small phone landscape", 568, 320],
  ]) {
    const context = await browser.newContext({
      ...devices["iPhone 13"],
      viewport: { width: w, height: h },
    });
    const page = await context.newPage();
    const user = "ov" + Date.now() + w;
    await page.goto(BASE + "/");
    await page.evaluate(async (u) => {
      const r = await fetch("/api/player/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: "TestPass123", display_name: "Ov" }),
      });
      return r.ok;
    }, user);
    await page.goto(BASE + "/play?mode=single&name=" + user);
    await page.waitForSelector('[data-testid="game-canvas"]', { timeout: 10000 });
    // Wait for PLAYING + at least a few rendered frames of the touch HUD.
    await page.waitForFunction(
      () => window.__game?.state === "PLAYING",
      null,
      { timeout: 10000 },
    );
    await page.waitForTimeout(800);

    const probe = await page.evaluate(() => {
      const hudRects = window.__game?.hudRects ?? [];
      const selectors = {
        joystick: '[data-testid="virtual-joystick"]',
        weapon: '[data-testid="weapon-switch"]',
        reload: '[data-testid="reload-button"]',
        aim: '[data-testid="right-joystick"]',
        fire: '[data-testid="fire-button"]',
        bomb: '[data-testid="bomb-button"]',
        pause: '[data-testid="pause-button"]',
      };
      const dom = {};
      for (const [name, sel] of Object.entries(selectors)) {
        const el = document.querySelector(sel);
        if (el && el.getClientRects().length > 0) {
          const r = el.getBoundingClientRect();
          dom[name] = { x: r.left, y: r.top, w: r.width, h: r.height };
        }
      }
      return {
        hudRects,
        dom,
        vw: window.innerWidth,
        vh: window.innerHeight,
        state: window.__game?.state,
        isTouch: window.__game?.isTouchMode,
      };
    });

    console.log(`${label} (${w}x${h}) -> hudRects:`, JSON.stringify(probe.hudRects));
    must(`${label}: touch mode active`, probe.isTouch === true, probe);
    must(`${label}: game playing`, probe.state === "PLAYING", probe);

    // Every visible control must be inside the viewport.
    for (const [name, r] of Object.entries(probe.dom)) {
      must(
        `${label}: ${name} inside viewport`,
        r.x >= 0 && r.y >= 0 && r.x + r.w <= probe.vw && r.y + r.h <= probe.vh,
        r,
      );
    }

    // The canvas HUD must actually have drawn its zones in touch mode.
    must(
      `${label}: canvas HUD zones recorded`,
      probe.hudRects.length >= 3,
      probe.hudRects,
    );

    // No DOM control may intersect any canvas HUD zone.
    let collisions = 0;
    for (const [cname, cr] of Object.entries(probe.dom)) {
      for (const hz of probe.hudRects) {
        if (overlaps(cr, hz)) {
          collisions++;
          console.log(
            `  FAIL: ${label}: ${cname} ${JSON.stringify(cr)} overlaps canvas zone ${hz.zone} ${JSON.stringify(hz)}`,
          );
        }
      }
    }
    must(`${label}: no control/HUD overlap`, collisions === 0);

    // The compact bottom ammo strip must sit between the control rows.
    const strip = probe.hudRects.find((r) => r.zone === "bottomStrip");
    if (strip) {
      let stripCol = 0;
      for (const [cname, cr] of Object.entries(probe.dom)) {
        if (overlaps(cr, strip)) {
          stripCol++;
          console.log(`  FAIL: ${label}: ${cname} overlaps bottomStrip`);
        }
      }
      must(`${label}: bottom strip clear of controls`, stripCol === 0, strip);
    }

    await context.close();
  }

  await browser.close();
  console.log(failures === 0 ? "ALL OVERLAP CHECKS PASSED" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });