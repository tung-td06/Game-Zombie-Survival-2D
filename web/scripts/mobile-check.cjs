// Temporary verification script — NOT part of the project. Exercises the
// mobile landscape + twin-stick flow with an iPhone emulation:
//   register → /play in portrait (rotate overlay + auto-pause)
//   → rotate to landscape (HUD, joysticks, weapon, bomb, pause)
//   → rotate back to portrait (overlay + pause) → landscape (resume).
const { chromium, devices } = require("playwright");

const BASE = "http://localhost:3213";

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: { width: 390, height: 844 }, // portrait
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  const user = "mobile" + Date.now();
  await page.goto(BASE + "/");
  await page.evaluate(async (u) => {
    const r = await fetch("/api/player/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: "TestPass123", display_name: "Mobile Tester" }),
    });
    return r.ok;
  }, user);
  console.log("registered:", user);

  await page.goto(BASE + "/play?mode=single&name=mobiletester");
  await page.waitForSelector('[data-testid="game-canvas"]', { timeout: 10000 });
  // Make the player effectively immortal for the duration of the test.
  await page.evaluate(() => {
    const g = window.__game;
    if (g?.player) { g.player.maxHp = 1e9; g.player.hp = 1e9; }
  });

  // 1) Portrait → rotate overlay + auto-pause
  await page.waitForSelector('[data-testid="rotate-overlay"]', { timeout: 6000 });
  const pausedPortrait = await page.evaluate(() => window.__game?.state);
  console.log("1) portrait overlay shown, game state:", pausedPortrait);

  // 2) Rotate to landscape → overlay hides, touch HUD appears, run resumes
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForSelector('[data-testid="rotate-overlay"]', { state: "detached", timeout: 6000 });
  await page.waitForSelector('[data-testid="touch-hud"]', { timeout: 6000 });
  await page.waitForTimeout(120);
  const resumed = await page.evaluate(() => window.__game?.state);
  console.log("2) landscape: overlay gone, HUD shown, state:", resumed);

  // 3) Left joystick → movement
  const joy = await page.locator('[data-testid="virtual-joystick"]').boundingBox();
  const joyCx = joy.x + joy.width / 2;
  const joyCy = joy.y + joy.height / 2;
  await page.locator('[data-testid="virtual-joystick"]').dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", clientX: joyCx, clientY: joyCy, bubbles: true });
  await page.locator('[data-testid="virtual-joystick"]').dispatchEvent("pointermove", { pointerId: 1, pointerType: "touch", clientX: joyCx, clientY: joyCy - 45, bubbles: true });
  await page.waitForTimeout(80);
  const moveVec = await page.evaluate(() => ({ ...window.__game.input.moveVec }));
  const p0 = await page.evaluate(() => ({ ...window.__game.player.pos }));
  await page.waitForTimeout(350);
  const p1 = await page.evaluate(() => ({ ...window.__game.player.pos }));
  const moved = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  console.log("3) moveVec:", JSON.stringify(moveVec), "| player travelled px:", moved.toFixed(1));
  await page.locator('[data-testid="virtual-joystick"]').dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", clientX: joyCx, clientY: joyCy - 45, bubbles: true });

  // 4) Right joystick → aim + fire
  const rj = await page.locator('[data-testid="right-joystick"]').boundingBox();
  const rjCx = rj.x + rj.width / 2;
  const rjCy = rj.y + rj.height / 2;
  await page.locator('[data-testid="right-joystick"]').dispatchEvent("pointerdown", { pointerId: 2, pointerType: "touch", clientX: rjCx, clientY: rjCy, bubbles: true });
  await page.locator('[data-testid="right-joystick"]').dispatchEvent("pointermove", { pointerId: 2, pointerType: "touch", clientX: rjCx + 55, clientY: rjCy, bubbles: true });
  await page.waitForTimeout(80);
  const aim = await page.evaluate(() => {
    const g = window.__game;
    return { aimOverride: g.input.aimOverride ? { x: Math.round(g.input.aimOverride.x - g.player.pos.x), y: Math.round(g.input.aimOverride.y - g.player.pos.y) } : null, fireHeld: g.input.fireHeld, mouseHeld: g.input.mouseDown.has(0) };
  });
  const s0 = await page.evaluate(() => window.__game.stats.shots_fired);
  await page.waitForTimeout(400);
  const s1 = await page.evaluate(() => window.__game.stats.shots_fired);
  console.log("4) aim offset:", JSON.stringify(aim), "| shots_fired:", s0, "->", s1);
  await page.locator('[data-testid="right-joystick"]').dispatchEvent("pointerup", { pointerId: 2, pointerType: "touch", clientX: rjCx + 55, clientY: rjCy, bubbles: true });
  await page.waitForTimeout(80);
  const fireAfterRelease = await page.evaluate(() => window.__game.input.fireHeld);
  console.log("   fireHeld after release:", fireAfterRelease);

  // 5) Bomb button → bombs decrement
  const b0 = await page.evaluate(() => window.__game.player.bombs);
  await page.locator('[data-testid="bomb-button"]').dispatchEvent("pointerdown", { pointerId: 3, pointerType: "touch", bubbles: true });
  await page.locator('[data-testid="bomb-button"]').dispatchEvent("pointerup", { pointerId: 3, pointerType: "touch", bubbles: true });
  await page.waitForTimeout(120);
  const b1 = await page.evaluate(() => window.__game.player.bombs);
  console.log("5) bombs:", b0, "->", b1);

  // 6) Weapon switch → cycles to next owned weapon
  await page.evaluate(() => { window.__game.player.weapons.give("shotgun"); });
  const w0 = await page.evaluate(() => window.__game.player.weapons.currentId);
  await page.locator('[data-testid="weapon-switch-button"]').click();
  await page.waitForTimeout(120);
  const w1 = await page.evaluate(() => window.__game.player.weapons.currentId);
  await page.locator('[data-testid="weapon-switch-button"]').click();
  await page.waitForTimeout(120);
  const w2 = await page.evaluate(() => window.__game.player.weapons.currentId);
  console.log("6) weapon cycle:", w0, "->", w1, "->", w2);

  // 7) Pause button → pause menu, tap again → resume
  await page.locator('[data-testid="pause-button"]').click();
  await page.waitForTimeout(120);
  const ps1 = await page.evaluate(() => window.__game.state);
  await page.locator('[data-testid="pause-button"]').click();
  await page.waitForTimeout(120);
  const ps2 = await page.evaluate(() => window.__game.state);
  console.log("7) pause tap:", ps1, "| resume tap:", ps2);

  // 8) Back to portrait → overlay + auto-pause; landscape → resume
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForSelector('[data-testid="rotate-overlay"]', { timeout: 6000 });
  const pAgain = await page.evaluate(() => window.__game.state);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForSelector('[data-testid="rotate-overlay"]', { state: "detached", timeout: 6000 });
  await page.waitForTimeout(150);
  const lAgain = await page.evaluate(() => window.__game.state);
  console.log("8) portrait:", pAgain, "| landscape again:", lAgain);

  // 9) Multitouch: left + right + bomb simultaneously
  await page.locator('[data-testid="virtual-joystick"]').dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", clientX: joyCx, clientY: joyCy, bubbles: true });
  await page.locator('[data-testid="virtual-joystick"]').dispatchEvent("pointermove", { pointerId: 1, pointerType: "touch", clientX: joyCx + 40, clientY: joyCy, bubbles: true });
  await page.locator('[data-testid="right-joystick"]').dispatchEvent("pointerdown", { pointerId: 2, pointerType: "touch", clientX: rjCx, clientY: rjCy, bubbles: true });
  await page.locator('[data-testid="right-joystick"]').dispatchEvent("pointermove", { pointerId: 2, pointerType: "touch", clientX: rjCx - 45, clientY: rjCy, bubbles: true });
  await page.waitForTimeout(60);
  const multi = await page.evaluate(() => ({ move: window.__game.input.moveVec, fire: window.__game.input.fireHeld }));
  const bombs2 = await page.evaluate(() => window.__game.player.bombs);
  await page.locator('[data-testid="bomb-button"]').dispatchEvent("pointerdown", { pointerId: 3, pointerType: "touch", bubbles: true });
  await page.locator('[data-testid="bomb-button"]').dispatchEvent("pointerup", { pointerId: 3, pointerType: "touch", bubbles: true });
  await page.waitForTimeout(120);
  const bombs3 = await page.evaluate(() => window.__game.player.bombs);
  console.log("9) multitouch move:", JSON.stringify(multi.move), "| fire:", multi.fire, "| bombs while moving+aiming:", bombs2, "->", bombs3);
  await page.locator('[data-testid="virtual-joystick"]').dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", clientX: joyCx + 40, clientY: joyCy, bubbles: true });
  await page.locator('[data-testid="right-joystick"]').dispatchEvent("pointerup", { pointerId: 2, pointerType: "touch", clientX: rjCx - 45, clientY: rjCy, bubbles: true });

  // 10) No page scroll / overflow on the game screen
  const layout = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    scrollH: document.documentElement.scrollHeight,
    clientH: document.documentElement.clientHeight,
  }));
  console.log("10) layout:", JSON.stringify(layout));

  console.log("ERRORS:", errors.length ? JSON.stringify(errors) : "none");
  await browser.close();
})().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});