// Repro: do mobile controls appear on initial load WITHOUT any resize/zoom?
// Tests both a 844px (iPhone 13) and a 932px (Pro Max) landscape viewport.
const { chromium, devices } = require("playwright");

const BASE = `http://localhost:${process.env.PORT || 3215}`;

(async () => {
  const browser = await chromium.launch();
  let failures = 0;
  const must = (name, cond, extra) => {
    if (cond) console.log(`  ok: ${name}`);
    else { failures++; console.log(`  FAIL: ${name}${extra ? "  -> " + JSON.stringify(extra) : ""}`); }
  };

  for (const [label, w, h] of [
    ["iPhone 13 landscape", 844, 390],
    ["Pro Max landscape (932px)", 932, 430],
    ["Galaxy-ish landscape (915px)", 915, 412],
    ["small phone landscape", 667, 375],
  ]) {
    const context = await browser.newContext({
      ...devices["iPhone 13"],
      viewport: { width: w, height: h },
    });
    const page = await context.newPage();
    const user = "repro" + Date.now() + w;
    await page.goto(BASE + "/");
    await page.evaluate(async (u) => {
      const r = await fetch("/api/player/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: "TestPass123", display_name: "Repro" }),
      });
      return r.ok;
    }, user);
    await page.goto(BASE + "/play?mode=single&name=" + user);
    await page.waitForSelector('[data-testid="game-canvas"]', { timeout: 10000 });
    await page.waitForTimeout(1500);
    const before = await page.evaluate(() => {
      const mq = window.matchMedia("(pointer: coarse) and (max-width: 900px)");
      const hud = document.querySelector('[data-testid="touch-hud"]');
      const joy = document.querySelector('[data-testid="virtual-joystick"]');
      const fire = document.querySelector('[data-testid="fire-button"]');
      const vis = (el) => !!el && el.getClientRects().length > 0;
      return {
        innerW: window.innerWidth,
        coarse: matchMedia("(pointer: coarse)").matches,
        hoverNone: matchMedia("(hover: none)").matches,
        oldQuery: mq.matches,
        hud: vis(hud),
        joy: vis(joy),
        fire: vis(fire),
        state: window.__game?.state,
      };
    });
    console.log(`${label} (${w}x${h}) ->`, JSON.stringify(before));
    must(`${label}: joystick visible on load`, before.joy === true, before);
    must(`${label}: fire visible on load`, before.fire === true, before);
    await context.close();
  }

  // Tablet (iPad landscape, 1194px — touch-primary, must show controls).
  {
    const ctx = await browser.newContext({
      ...devices["iPad Pro 11"],
      viewport: { width: 1194, height: 834 },
    });
    const page = await ctx.newPage();
    const user = "reprotab" + Date.now();
    await page.goto(BASE + "/");
    await page.evaluate(async (u) => {
      const r = await fetch("/api/player/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: "TestPass123", display_name: "ReproTab" }),
      });
      return r.ok;
    }, user);
    await page.goto(BASE + "/play?mode=single&name=" + user);
    await page.waitForSelector('[data-testid="game-canvas"]', { timeout: 10000 });
    await page.waitForTimeout(1500);
    const tab = await page.evaluate(() => {
      const vis = (s) => { const el = document.querySelector(s); return !!el && el.getClientRects().length > 0; };
      return { coarse: matchMedia("(pointer: coarse)").matches, joy: vis('[data-testid="virtual-joystick"]'), fire: vis('[data-testid="fire-button"]') };
    });
    console.log(`iPad Pro 11 landscape (1194x834) ->`, JSON.stringify(tab));
    must("tablet: joystick + fire visible on load", tab.joy === true && tab.fire === true, tab);
    await ctx.close();
  }

  // Portrait → rotate to landscape on a big phone: controls appear/reposition.
  {
    const ctx = await browser.newContext({
      ...devices["iPhone 13"],
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    const user = "reproport" + Date.now();
    await page.goto(BASE + "/");
    await page.evaluate(async (u) => {
      const r = await fetch("/api/player/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: "TestPass123", display_name: "ReproPort" }),
      });
      return r.ok;
    }, user);
    await page.goto(BASE + "/play?mode=single&name=" + user);
    await page.waitForSelector('[data-testid="rotate-overlay"]', { timeout: 8000 });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForSelector('[data-testid="rotate-overlay"]', { state: "detached", timeout: 8000 });
    await page.waitForSelector('[data-testid="fire-button"]', { timeout: 8000 });
    const rot = await page.evaluate(() => {
      const vis = (s) => { const el = document.querySelector(s); return !!el && el.getClientRects().length > 0; };
      return { joy: vis('[data-testid="virtual-joystick"]'), fire: vis('[data-testid="fire-button"]'), state: window.__game?.state };
    });
    console.log(`portrait→landscape 844x390 ->`, JSON.stringify(rot));
    must("rotate: controls appear right after rotation (no reload)", rot.joy === true && rot.fire === true, rot);
    await ctx.close();
  }

  // Desktop: NO mobile controls; keyboard/mouse path intact.
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      hasTouch: false,
    });
    const page = await ctx.newPage();
    const user = "reprodesk" + Date.now();
    await page.goto(BASE + "/");
    await page.evaluate(async (u) => {
      const r = await fetch("/api/player/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: "TestPass123", display_name: "ReproDesk" }),
      });
      return r.ok;
    }, user);
    await page.goto(BASE + "/play?mode=single&name=" + user);
    await page.waitForSelector('[data-testid="game-canvas"]', { timeout: 10000 });
    await page.waitForTimeout(1200);
    const desk = await page.evaluate(() => {
      const vis = (s) => { const el = document.querySelector(s); return !!el && el.getClientRects().length > 0; };
      return { hud: vis('[data-testid="touch-hud"]'), joy: vis('[data-testid="virtual-joystick"]'), fire: vis('[data-testid="fire-button"]'), state: window.__game?.state };
    });
    console.log(`Desktop 1280x720 ->`, JSON.stringify(desk));
    must("desktop: no touch HUD / joystick / fire button", !desk.hud && !desk.joy && !desk.fire, desk);
    await ctx.close();
  }

  await browser.close();
  console.log(failures === 0 ? "ALL REPRO CHECKS PASSED" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });