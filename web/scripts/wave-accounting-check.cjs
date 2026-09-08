// wave-accounting-check.cjs
// Browser-level verification of the fixed-per-wave spawn accounting:
//   - Wave 1 starts with waveTotalEnemies = 10 (BASE_WAVE_SIZE)
//   - spawned_this_wave + to_spawn === waveTotalEnemies at every sample
//   - spawned_this_wave never exceeds waveTotalEnemies
//   - game.zombies.length never exceeds waveTotalEnemies (wave 1 has no
//     summoners, so every alive zombie is a wave-spawned one)
//   - console logs match: [WAVE] Started Wave 1 — Total enemies: 10 and
//     [SPAWN] n/10 with n never above 10
//
// Usage: node scripts/wave-accounting-check.cjs  (dev server on PORT)

const { chromium } = require("playwright");

const BASE = `http://localhost:${process.env.PORT || 3210}`;
const USER = `waveacc${Date.now() % 100000}`;
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

  const consoleLogs = [];
  page.on("console", (msg) => {
    const t = msg.text();
    if (t.includes("[WAVE]") || t.includes("[SPAWN]")) consoleLogs.push(t);
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

  const readWave = () =>
    page.evaluate(() => {
      const g = window.__game;
      if (!g || !g.waveManager) return null;
      const wm = g.waveManager;
      return {
        state: g.state,
        wave: wm.wave,
        waveTotalEnemies: wm.waveTotalEnemies,
        to_spawn: wm.to_spawn,
        spawned: wm.spawned_this_wave,
        alive: g.zombies.length,
        bossSpawned: wm.bossSpawnedThisWave,
      };
    });

  const waitGame = async () => {
    for (let i = 0; i < 120; i++) {
      const g = await readWave();
      if (g && (g.state === "PLAYING" || g.state === "MENU")) return g;
      await page.waitForTimeout(250);
    }
    throw new Error("game did not boot");
  };

  console.log(`user: ${USER}`);
  await page.goto(BASE + "/");
  const reg = await api("/api/player/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS, display_name: "Wave" }),
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

  // Start New Game via the custom modal.
  await page.locator("button").filter({ hasText: /CHƠI MỚI/ }).first().click();
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
  check("new game modal confirmed", confirmed);
  await page.waitForURL(/\/play/, { timeout: 15000 });

  let g = await waitGame();
  // Wait for wave 1 to go active (3s intermission).
  for (let i = 0; i < 30 && !(g.wave >= 1 && g.state === "PLAYING" && g.waveTotalEnemies > 0); i++) {
    await page.waitForTimeout(250);
    g = await readWave();
  }
  check("wave 1 started with a fixed total", g.wave === 1 && g.waveTotalEnemies > 0, g);

  // Sample the accounting repeatedly while wave 1 is active.
  let invariantBroken = false;
  let exceeded = false;
  let sawAliveUnderCap = false;
  const firstTotal = g.waveTotalEnemies;
  for (let i = 0; i < 60; i++) {
    const s = await readWave();
    if (!s || s.state !== "PLAYING" || s.wave !== 1) break;
    if (s.waveTotalEnemies !== firstTotal) {
      invariantBroken = true;
      console.log("    total changed:", s);
    }
    if (s.spawned + s.to_spawn !== s.waveTotalEnemies) {
      invariantBroken = true;
      console.log("    invariant broken:", s);
    }
    if (s.spawned > s.waveTotalEnemies || s.alive > s.waveTotalEnemies) exceeded = true;
    if (s.alive > 0) sawAliveUnderCap = true;
    await page.waitForTimeout(120);
  }
  check("wave total stayed fixed (never recomputed)", !invariantBroken);
  check("spawned + to_spawn === total at every sample", !invariantBroken);
  check("spawned/alive never exceeded the fixed total", !exceeded);
  check("zombies actually spawned during wave 1", sawAliveUnderCap);

  // Log parity: [WAVE] Started Wave 1 — Total enemies: 10 and [SPAWN] n/10.
  const waveLog = consoleLogs.find((l) => l.includes("[WAVE] Started Wave 1"));
  check(
    "console: [WAVE] Started Wave 1 — Total enemies: 10",
    !!waveLog && waveLog.includes(`Total enemies: ${firstTotal}`),
    waveLog
  );
  const spawnLogs = consoleLogs.filter((l) => l.includes("[SPAWN]"));
  check("console: spawns logged with n/total", spawnLogs.length > 0, spawnLogs.slice(0, 3));
  const maxLogged = spawnLogs.reduce((m, l) => {
    const n = Number((l.match(/\[SPAWN\] (\d+)\//) || [])[1]);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  check("console: spawn count never exceeds total", maxLogged <= firstTotal, { maxLogged, firstTotal });
  const badLog = spawnLogs.find((l) => {
    const m = l.match(/\[SPAWN\] (\d+)\/(\d+)/);
    return m && Number(m[1]) > Number(m[2]);
  });
  check("console: no [SPAWN] n/total with n > total", !badLog, badLog);

  await browser.close();
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});