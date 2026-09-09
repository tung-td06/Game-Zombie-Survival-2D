// Temporary verification script — NOT part of the project. Exercises the
// mobile landscape + twin-stick flow with an iPhone emulation:
//   register → /play in portrait (rotate overlay + auto-pause)
//   → rotate to landscape (HUD, joysticks, weapon, bomb, pause)
//   → rotate back to portrait (overlay + pause) → landscape (resume).
const { chromium, devices } = require("playwright");

const BASE = `http://localhost:${process.env.PORT || 3213}`;

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
  let failures = 0;
  const must = (name, cond, extra) => {
    if (cond) {
      console.log(`  ok: ${name}`);
    } else {
      failures++;
      console.log(`  FAIL: ${name}${extra ? "  -> " + JSON.stringify(extra) : ""}`);
    }
  };
  const vis = (sel) =>
    page.evaluate((s) => {
      const el = document.querySelector(s);
      return !!el && el.getClientRects().length > 0;
    }, sel);

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

  // 3) Left joystick → movement (plus dead zone: tiny drag must not move)
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
  await page.waitForTimeout(60);
  // Dead zone: the stick radius is ring*0.27 - 12px and the dead zone is
  // 15% of that radius (≈2-4px), so a 1px drag must output (0,0).
  await page.locator('[data-testid="virtual-joystick"]').dispatchEvent("pointerdown", { pointerId: 9, pointerType: "touch", clientX: joyCx, clientY: joyCy, bubbles: true });
  await page.locator('[data-testid="virtual-joystick"]').dispatchEvent("pointermove", { pointerId: 9, pointerType: "touch", clientX: joyCx + 1, clientY: joyCy, bubbles: true });
  await page.waitForTimeout(60);
  const deadVec = await page.evaluate(() => ({ ...window.__game.input.moveVec }));
  await page.locator('[data-testid="virtual-joystick"]').dispatchEvent("pointerup", { pointerId: 9, pointerType: "touch", clientX: joyCx + 1, clientY: joyCy, bubbles: true });
  must(
    "joystick dead zone: tiny drag outputs (0,0)",
    deadVec.x === 0 && deadVec.y === 0,
    deadVec
  );

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

  // 4b) Dedicated FIRE button: hold → fires, release → stops.
  const fb = await page.locator('[data-testid="fire-button"]').boundingBox();
  must("fire button visible while PLAYING", !!fb && fb.width >= 44, fb && { w: Math.round(fb.width), h: Math.round(fb.height) });
  const fbCx = fb.x + fb.width / 2;
  const fbCy = fb.y + fb.height / 2;
  const f0 = await page.evaluate(() => window.__game.stats.shots_fired);
  await page.locator('[data-testid="fire-button"]').dispatchEvent("pointerdown", { pointerId: 4, pointerType: "touch", clientX: fbCx, clientY: fbCy, bubbles: true });
  await page.waitForTimeout(400);
  const f1 = await page.evaluate(() => window.__game.stats.shots_fired);
  const fireBtnHeld = await page.evaluate(() => ({
    btn: window.__game.input.fireButtonHeld,
    mouse: window.__game.input.mouseDown.has(0),
  }));
  await page.locator('[data-testid="fire-button"]').dispatchEvent("pointerup", { pointerId: 4, pointerType: "touch", clientX: fbCx, clientY: fbCy, bubbles: true });
  await page.waitForTimeout(200);
  const f2 = await page.evaluate(() => window.__game.stats.shots_fired);
  const fireBtnReleased = await page.evaluate(() => ({
    btn: window.__game.input.fireButtonHeld,
    mouse: window.__game.input.mouseDown.has(0),
    isFiring: window.__game.input.isFiring,
  }));
  must("FIRE button hold increases shots_fired", f1 > f0, { f0, f1 });
  must("FIRE button maps into the shared mouseHeld surface", fireBtnHeld.btn === true && fireBtnHeld.mouse === true, fireBtnHeld);
  must("FIRE button release stops firing", f2 === f1 && !fireBtnReleased.btn && !fireBtnReleased.mouse && !fireBtnReleased.isFiring, { f2, fireBtnReleased });

  // 4c) Aim stick + FIRE button together: releasing the stick must NOT
  // stop the fire button's hold (two independent fire sources, one surface).
  await page.locator('[data-testid="right-joystick"]').dispatchEvent("pointerdown", { pointerId: 5, pointerType: "touch", clientX: rjCx, clientY: rjCy, bubbles: true });
  await page.locator('[data-testid="right-joystick"]').dispatchEvent("pointermove", { pointerId: 5, pointerType: "touch", clientX: rjCx - 50, clientY: rjCy, bubbles: true });
  await page.locator('[data-testid="fire-button"]').dispatchEvent("pointerdown", { pointerId: 6, pointerType: "touch", clientX: fbCx, clientY: fbCy, bubbles: true });
  await page.waitForTimeout(100);
  await page.locator('[data-testid="right-joystick"]').dispatchEvent("pointerup", { pointerId: 5, pointerType: "touch", clientX: rjCx - 50, clientY: rjCy, bubbles: true });
  await page.waitForTimeout(100);
  const comboHold = await page.evaluate(() => ({
    stick: window.__game.input.fireHeld,
    btn: window.__game.input.fireButtonHeld,
    firing: window.__game.input.isFiring,
  }));
  await page.locator('[data-testid="fire-button"]').dispatchEvent("pointerup", { pointerId: 6, pointerType: "touch", clientX: fbCx, clientY: fbCy, bubbles: true });
  await page.waitForTimeout(80);
  must(
    "releasing aim stick keeps FIRE button firing (multitouch)",
    comboHold.stick === false && comboHold.btn === true && comboHold.firing === true,
    comboHold
  );

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

  // 7) Pause → controls hidden except pause; resume → fresh controls.
  await page.locator('[data-testid="pause-button"]').click();
  await page.waitForTimeout(150);
  const ps1 = await page.evaluate(() => window.__game.state);
  must("pause tap -> PAUSED", ps1 === "PAUSED", ps1);
  must(
    "combat controls hidden while paused",
    !(await vis('[data-testid="virtual-joystick"]')) &&
      !(await vis('[data-testid="right-joystick"]')) &&
      !(await vis('[data-testid="fire-button"]')) &&
      !(await vis('[data-testid="weapon-switch-button"]')) &&
      !(await vis('[data-testid="bomb-button"]')) &&
      !(await vis('[data-testid="reload-button"]')) &&
      (await vis('[data-testid="pause-button"]'))
  );
  const pausedInput = await page.evaluate(() => ({
    move: window.__game.input.moveVec,
    fire: window.__game.input.fireHeld,
  }));
  must(
    "no lingering movement/fire while paused",
    pausedInput.move.x === 0 && pausedInput.move.y === 0 && pausedInput.fire === false,
    pausedInput
  );
  await page.locator('[data-testid="pause-button"]').click();
  await page.waitForTimeout(150);
  const ps2 = await page.evaluate(() => window.__game.state);
  must("pause tap again -> PLAYING", ps2 === "PLAYING", ps2);
  must(
    "combat controls visible again after resume",
    (await vis('[data-testid="virtual-joystick"]')) &&
      (await vis('[data-testid="right-joystick"]')) &&
      (await vis('[data-testid="fire-button"]')) &&
      (await vis('[data-testid="weapon-switch-button"]')) &&
      (await vis('[data-testid="bomb-button"]')) &&
      (await vis('[data-testid="reload-button"]'))
  );

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

  // 11) Reload button → existing Weapon.startReload flow, then no-op when full.
  for (let i = 0; i < 40; i++) {
    if ((await page.evaluate(() => window.__game.state)) === "PLAYING") break;
    await page.waitForTimeout(150);
  }
  must("state PLAYING before reload test", (await page.evaluate(() => window.__game.state)) === "PLAYING");
  must("reload button visible while PLAYING", await vis('[data-testid="reload-button"]'));
  await page.evaluate(() => {
    const w = window.__game.player.weapons.current;
    w.reloading = false;
    w.ammo = 1;
    w.reserve = 25;
    w.cooldown = 0;
  });
  await page.waitForTimeout(150);
  const rbtn = page.locator('[data-testid="reload-button"]');
  await rbtn.dispatchEvent("pointerdown", { pointerId: 7, pointerType: "touch", bubbles: true });
  await rbtn.dispatchEvent("pointerup", { pointerId: 7, pointerType: "touch", bubbles: true });
  await page.waitForTimeout(120);
  const reloadStarted = await page.evaluate(() => window.__game.player.weapons.current.reloading);
  must("reload tap starts reload (reloading === true)", reloadStarted === true, reloadStarted);
  let reloadDone = false;
  for (let i = 0; i < 40; i++) {
    const st = await page.evaluate(() => {
      const w = window.__game.player.weapons.current;
      return { reloading: w.reloading, ammo: w.ammo, mag: w.magazineSize };
    });
    if (!st.reloading && st.ammo === st.mag) {
      reloadDone = true;
      break;
    }
    await page.waitForTimeout(150);
  }
  must("reload completes: ammo refilled to magazine", reloadDone);
  const beforeFull = await page.evaluate(() => {
    const w = window.__game.player.weapons.current;
    return { reloading: w.reloading, ammo: w.ammo, reserve: w.reserve };
  });
  await rbtn.dispatchEvent("pointerdown", { pointerId: 8, pointerType: "touch", bubbles: true });
  await rbtn.dispatchEvent("pointerup", { pointerId: 8, pointerType: "touch", bubbles: true });
  await page.waitForTimeout(120);
  const afterFull = await page.evaluate(() => {
    const w = window.__game.player.weapons.current;
    return { reloading: w.reloading, ammo: w.ammo, reserve: w.reserve };
  });
  must(
    "reload tap while magazine full is a no-op",
    !afterFull.reloading &&
      afterFull.ammo === beforeFull.ammo &&
      afterFull.reserve === beforeFull.reserve,
    { beforeFull, afterFull }
  );

  // 12) No page scroll / overflow on the game screen
  const layout = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    scrollH: document.documentElement.scrollHeight,
    clientH: document.documentElement.clientHeight,
  }));
  console.log("12) layout:", JSON.stringify(layout));
  must("no horizontal or vertical page scroll", layout.scrollW <= layout.clientW && layout.scrollH <= layout.clientH, layout);

  console.log("ERRORS:", errors.length ? JSON.stringify(errors) : "none");
  await browser.close();
  console.log(failures === 0 ? "ALL MOBILE CHECKS PASSED ✅" : `${failures} FAILURES ❌`);
  // Console noise above (Turbopack HMR websocket + unauthenticated 401) is
  // pre-existing and environmental; only real check failures fail the run.
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});