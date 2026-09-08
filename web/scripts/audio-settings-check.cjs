// audio-settings-check.cjs
// End-to-end verification of the AUDIO / SETTINGS chain:
//   Settings (localStorage zs.save.v1) -> AudioManager state -> GainNode graph
// Checks master/music/sfx volume, mute ON/OFF, clamping 0-100%, realtime gain
// updates, persistence across reload, and the lobby settings modal UI.
//
// NOTE: the headless audio thread applies GainNode setValueAtTime events one
// render quantum late, so we settle (~120ms) after each change before reading
// .gain.value — on a real device the update is effectively instant.
//
// Usage: PORT=3210 node scripts/audio-settings-check.cjs

const { chromium } = require("playwright");

const BASE = `http://localhost:${process.env.PORT || 3210}`;
const USER = `audiocheck${Date.now() % 100000}`;
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

  const audioState = () =>
    page.evaluate(() => {
      const a = window.__game?.audio;
      if (!a) return null;
      return {
        state: window.__game?.state,
        master: a.master,
        musicVolume: a.musicVolume,
        sfxVolume: a.sfxVolume,
        sfxMuted: a.sfxMuted,
        paused: a.paused,
        masterGain: a.masterGainNode?.gain?.value ?? null,
        musicGain: a.musicGainNode?.gain?.value ?? null,
        sfxGain: a.sfxGainNode?.gain?.value ?? null,
        ctxState: a.ctx?.state ?? null,
        settings: window.__game?.save?.settings
          ? {
              master_volume: window.__game.save.settings.master_volume,
              music_volume: window.__game.save.settings.music_volume,
              sfx_volume: window.__game.save.settings.sfx_volume,
              muted: window.__game.save.settings.muted,
            }
          : null,
      };
    });

  const storedSettings = () =>
    page.evaluate(() => {
      try {
        const raw = localStorage.getItem("zs.save.v1");
        if (!raw) return null;
        return JSON.parse(raw).settings ?? null;
      } catch {
        return null;
      }
    });

  const waitGame = async () => {
    for (let i = 0; i < 120; i++) {
      const s = await page.evaluate(() => window.__game?.state === "PLAYING");
      if (s) return;
      await page.waitForTimeout(250);
    }
    throw new Error("game did not reach PLAYING");
  };

  // Settle so the headless audio thread applies scheduled gain events.
  const settle = () => page.waitForTimeout(120);

  const clickWhenAvailable = async (nameRe, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const clicked = await page.evaluate((re) => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) =>
          re.test(b.textContent || "")
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

  const lsVal = async (key) =>
    page.evaluate((k) => {
      try {
        return JSON.parse(localStorage.getItem("zs.save.v1") || "{}")?.settings?.[k];
      } catch {
        return undefined;
      }
    }, key);

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
  // Reload so the lobby re-runs /api/player/me with the fresh session.
  await page.goto(BASE + "/");

  console.log("\n== 1. Defaults (no saved settings yet) ==");
  // CHƠI MỚI (NEW GAME) opens an in-game confirmation modal (no native
  // dialog) — confirm through the modal to start the fresh run.
  await clickWhenAvailable(/CHƠI MỚI/);
  await page.waitForSelector('[role="dialog"][aria-label="XÁC NHẬN GAME MỚI"]', {
    timeout: 10000,
  });
  await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"][aria-label="XÁC NHẬN GAME MỚI"]');
    const btn =
      dlg &&
      Array.from(dlg.querySelectorAll("button")).find(
        (b) => (b.textContent || "").trim() === "CHƠI MỚI"
      );
    if (btn) btn.click();
  });
  await page.waitForURL(/\/play/, { timeout: 15000 });
  await waitGame();
  await settle();

  let a = await audioState();
  check(
    "defaults applied: master=1, music=1, sfx=1, unmuted, not paused",
    a.master === 1 && a.musicVolume === 1 && a.sfxVolume === 1 &&
      a.sfxMuted === false && a.paused === false,
    a
  );
  check(
    "gain nodes match defaults (master=1, music=1, sfx=1)",
    Math.abs(a.masterGain - 1) < 1e-6 &&
      Math.abs(a.musicGain - 1) < 1e-6 &&
      Math.abs(a.sfxGain - 1) < 1e-6,
    a
  );

  console.log("\n== 2. Master volume: -/+ , realtime gain, clamp ==");
  await page.evaluate(() => window.__game.doAction("dec:master_volume"));
  await settle();
  a = await audioState();
  check(
    "master -5% -> 0.95 (setting + gain + persisted)",
    a.master === 0.95 && Math.abs(a.masterGain - 0.95) < 1e-6 && (await lsVal("master_volume")) === 0.95,
    a
  );
  await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 30; i++) g.doAction("dec:master_volume");
  });
  await settle();
  a = await audioState();
  check("master clamped at 0 (never negative)", a.master === 0 && a.masterGain === 0, a);
  await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 30; i++) g.doAction("inc:master_volume");
  });
  await settle();
  a = await audioState();
  check("master clamped at 1 (never above 100%)", a.master === 1 && Math.abs(a.masterGain - 1) < 1e-6, a);

  console.log("\n== 3. Music volume realtime ==");
  await page.evaluate(() => window.__game.doAction("dec:music_volume"));
  await settle();
  a = await audioState();
  check(
    "music -5% -> 0.95, gain updates realtime",
    a.musicVolume === 0.95 && Math.abs(a.musicGain - 0.95) < 1e-6 && (await lsVal("music_volume")) === 0.95,
    a
  );
  await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 25; i++) g.doAction("dec:music_volume");
  });
  await settle();
  a = await audioState();
  check("music volume = 0 -> music gain = 0 (silent)", a.musicVolume === 0 && a.musicGain === 0, a);
  await page.evaluate(() => window.__game.doAction("inc:music_volume"));
  await settle();
  a = await audioState();
  check("music back up -> gain follows", a.musicVolume === 0.05 && Math.abs(a.musicGain - 0.05) < 1e-6, a);

  console.log("\n== 4. SFX volume realtime ==");
  await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 20; i++) g.doAction("inc:music_volume"); // restore music to 1
    for (let i = 0; i < 16; i++) g.doAction("dec:sfx_volume");
  });
  await settle();
  a = await audioState();
  check(
    "sfx -80% -> 0.20, sfx gain follows",
    a.sfxVolume === 0.2 && Math.abs(a.sfxGain - 0.2) < 1e-6 && (await lsVal("sfx_volume")) === 0.2,
    a
  );
  await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 30; i++) g.doAction("dec:sfx_volume");
  });
  await settle();
  a = await audioState();
  check("sfx clamped at 0", a.sfxVolume === 0 && a.sfxGain === 0, a);

  console.log("\n== 5. Mute ALL ==");
  await page.evaluate(() => window.__game.doAction("toggle_mute"));
  await settle();
  a = await audioState();
  check(
    "mute ON: masterGain=0 (silence), volumes preserved, persisted",
    a.sfxMuted === true && a.masterGain === 0 &&
      a.master === 1 && a.musicVolume === 1 && a.sfxVolume === 0 &&
      (await lsVal("muted")) === true,
    a
  );

  // Change volume while muted: values update, still silent.
  await page.evaluate(() => {
    const g = window.__game;
    g.doAction("inc:sfx_volume");
    g.doAction("dec:master_volume");
  });
  await settle();
  a = await audioState();
  check(
    "volume changes while MUTED update stored values but stay silent",
    a.sfxVolume === 0.05 && a.master === 0.95 && a.masterGain === 0 && a.sfxMuted === true,
    a
  );

  await page.evaluate(() => window.__game.doAction("toggle_mute"));
  await settle();
  a = await audioState();
  check(
    "mute OFF: gain restored to stored volumes (not reset to 100%)",
    a.sfxMuted === false && Math.abs(a.masterGain - 0.95) < 1e-6 &&
      Math.abs(a.musicGain - 1) < 1e-6 && Math.abs(a.sfxGain - 0.05) < 1e-6,
    a
  );

  // Set a known state for the reload test: master 0.7, music 0.4, sfx 0.6, muted false.
  await page.evaluate(() => {
    const g = window.__game;
    g.audio.setVolumes(0.7, 0.4, 0.6);
    const st = g.save.settings;
    st.master_volume = 0.7;
    st.music_volume = 0.4;
    st.sfx_volume = 0.6;
    st.muted = false;
    g.save.save();
  });

  console.log("\n== 6. Persistence across reload ==");
  await page.goto(BASE + "/play?mode=single&name=ReloadTest");
  await waitGame();
  await settle();
  a = await audioState();
  check(
    "reload: master=0.7, music=0.4, sfx=0.6 restored",
    a.master === 0.7 && a.musicVolume === 0.4 && a.sfxVolume === 0.6 && a.sfxMuted === false,
    a
  );
  check(
    "reload: gain nodes match restored settings",
    Math.abs(a.masterGain - 0.7) < 1e-6 &&
      Math.abs(a.musicGain - 0.4) < 1e-6 &&
      Math.abs(a.sfxGain - 0.6) < 1e-6,
    a
  );

  // Persist muted=true and reload to check mute survives.
  await page.evaluate(() => {
    const g = window.__game;
    g.save.settings.muted = true;
    g.save.save();
    g.audio.setSfxMuted(true);
  });
  await page.goto(BASE + "/play?mode=single&name=ReloadMuted");
  await waitGame();
  await settle();
  a = await audioState();
  check(
    "reload with mute ON: silent (masterGain=0), volumes kept",
    a.sfxMuted === true && a.masterGain === 0 && a.master === 0.7,
    a
  );

  // Reset to a known unmuted state for the modal test (the ReloadMuted
  // check above left muted=true in storage).
  await page.evaluate(() => {
    const g = window.__game;
    g.save.settings.muted = false;
    g.save.save();
    g.audio.setSfxMuted(false);
  });

  console.log("\n== 7. Lobby SETTINGS modal UI ==");
  await page.goto(BASE + "/");
  await clickWhenAvailable(/SETTINGS/);
  await page.waitForTimeout(400);

  const modal = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".zs-settings-row"));
    const pick = (label) => {
      const row = rows.find((r) => r.textContent.includes(label));
      return row ? row.textContent.replace(/\s+/g, " ").trim() : null;
    };
    return {
      master: pick("MASTER VOLUME"),
      music: pick("MUSIC VOLUME"),
      sfx: pick("SFX VOLUME"),
      mute: pick("MUTE ALL"),
    };
  });
  check("modal shows stored volumes (70%, 40%, 60%)", 
    modal.master?.includes("70%") && modal.music?.includes("40%") && modal.sfx?.includes("60%"),
    modal);

  // Click + on MASTER VOLUME in the modal: 70 -> 75%.
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".zs-settings-row"));
    const row = rows.find((r) => r.textContent.includes("MASTER VOLUME"));
    const plus = row?.querySelector('button[aria-label*="Tăng"]');
    if (plus) plus.click();
  });
  await page.waitForTimeout(300);
  let st2 = await storedSettings();
  check("modal + updates persisted master to 75%", st2?.master_volume === 0.75, st2);

  // Mute in modal: volumes preserved. Use a real click so the React
  // synthetic handler definitely fires after the previous re-render.
  const muteBtn = page
    .locator(".zs-settings-row", { hasText: "MUTE ALL" })
    .locator("button")
    .first();
  await muteBtn.click();
  await page.waitForTimeout(300);
  st2 = await storedSettings();
  check(
    "modal MUTE ON: muted=true, volumes preserved (75/40/60)",
    st2?.muted === true && st2?.master_volume === 0.75 && st2?.music_volume === 0.4 && st2?.sfx_volume === 0.6,
    st2
  );
  await muteBtn.click();
  await page.waitForTimeout(300);
  st2 = await storedSettings();
  check(
    "modal MUTE OFF: muted=false, volumes NOT reset to 100%",
    st2?.muted === false && st2?.master_volume === 0.75 && st2?.music_volume === 0.4 && st2?.sfx_volume === 0.6,
    st2
  );

  await browser.close();

  console.log("\n" + (failures === 0 ? "ALL AUDIO CHECKS PASSED ✅" : `${failures} FAILURES ❌`));
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error("SCRIPT ERROR:", err.message);
  process.exit(1);
});