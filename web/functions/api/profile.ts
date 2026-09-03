interface Env {
  DB?: D1Database;
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const { searchParams } = new URL(context.request.url);
  const username = searchParams.get("username");

  if (!username || !username.trim()) {
    return new Response(JSON.stringify({ error: "Username is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const key = username.trim().toLowerCase();
  const db = context.env.DB;

  let profileData: any = null;

  if (db) {
    try {
      const row = await db
        .prepare("SELECT * FROM profiles WHERE username = ?")
        .bind(key)
        .first<Record<string, any>>();

      if (row) {
        profileData = {
          high_score: row.high_score as number,
          total_kills: row.total_kills as number,
          coins: row.coins as number,
          player_level: row.player_level as number,
          xp: row.xp as number,
          unlocked_weapons: JSON.parse((row.unlocked_weapons as string) || '["pistol"]'),
          weapon_upgrades: JSON.parse((row.weapon_upgrades as string) || "{}"),
          player_upgrades: JSON.parse((row.player_upgrades as string) || "{}"),
          achievements: JSON.parse((row.achievements as string) || "[]"),
          quests_claimed: JSON.parse((row.quests_claimed as string) || "[]"),
          settings: JSON.parse((row.settings as string) || "{}"),
        };
      }
    } catch (err) {
      console.error("DB Error:", err);
    }
  }

  if (!profileData) {
    profileData = {
      high_score: 0,
      total_kills: 0,
      coins: 0,
      player_level: 1,
      xp: 0,
      unlocked_weapons: ["pistol"],
      weapon_upgrades: {},
      player_upgrades: {},
      achievements: [],
      quests_claimed: [],
      settings: {},
    };
    if (db) {
      try {
        await db
          .prepare(
            `INSERT INTO profiles
               (username, high_score, total_kills, coins, player_level, xp,
                unlocked_weapons, weapon_upgrades, player_upgrades,
                achievements, quests_claimed, settings)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(username) DO NOTHING`
          )
          .bind(
            key, 0, 0, 0, 1, 0,
            JSON.stringify(["pistol"]),
            "{}", "{}", "[]", "[]", "{}"
          )
          .run();
      } catch (err) {
        console.error("DB Insert Error:", err);
      }
    }
  }

  const headers = new Headers({
    "Content-Type": "application/json",
    "Set-Cookie": `session_user=${key}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax`,
  });

  return new Response(JSON.stringify({ profile: profileData }), { headers });
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const body = (await context.request.json()) as { username?: string; profileData?: any };
    const { username, profileData } = body;

    if (!username || !profileData) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const key = username.trim().toLowerCase();
    const db = context.env.DB;

    if (db) {
      await db
        .prepare(
          `INSERT INTO profiles
             (username, high_score, total_kills, coins, player_level, xp,
              unlocked_weapons, weapon_upgrades, player_upgrades,
              achievements, quests_claimed, settings)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(username) DO UPDATE SET
             high_score       = excluded.high_score,
             total_kills      = excluded.total_kills,
             coins            = excluded.coins,
             player_level     = excluded.player_level,
             xp               = excluded.xp,
             unlocked_weapons = excluded.unlocked_weapons,
             weapon_upgrades  = excluded.weapon_upgrades,
             player_upgrades  = excluded.player_upgrades,
             achievements     = excluded.achievements,
             quests_claimed   = excluded.quests_claimed,
             settings         = excluded.settings`
        )
        .bind(
          key,
          profileData.high_score ?? 0,
          profileData.total_kills ?? 0,
          profileData.coins ?? 0,
          profileData.player_level ?? 1,
          profileData.xp ?? 0,
          JSON.stringify(profileData.unlocked_weapons ?? ["pistol"]),
          JSON.stringify(profileData.weapon_upgrades ?? {}),
          JSON.stringify(profileData.player_upgrades ?? {}),
          JSON.stringify(profileData.achievements ?? []),
          JSON.stringify(profileData.quests_claimed ?? []),
          JSON.stringify(profileData.settings ?? {})
        )
        .run();
    }

    const headers = new Headers({
      "Content-Type": "application/json",
      "Set-Cookie": `session_user=${key}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax`,
    });

    return new Response(JSON.stringify({ success: true }), { headers });
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Invalid payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
