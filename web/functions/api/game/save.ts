interface Env {
  DB?: D1Database;
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const { searchParams } = new URL(context.request.url);
  const usernameRaw = searchParams.get("username");

  if (!usernameRaw) {
    return new Response(JSON.stringify({ error: "Username is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const username = usernameRaw.toLowerCase();
  const db = context.env.DB;
  let saveData: any = null;

  if (db) {
    try {
      const row = await db
        .prepare("SELECT * FROM game_saves WHERE username = ?")
        .bind(username)
        .first<Record<string, any>>();

      if (row) {
        saveData = {
          username: row.username,
          save_version: row.save_version,
          level: row.level,
          wave: row.wave,
          score: row.score,
          money: row.money,
          player_data: JSON.parse(row.player_data as string),
          weapon_data: row.weapon_data ? JSON.parse(row.weapon_data as string) : null,
          inventory_data: JSON.parse((row.inventory_data as string) || "{}"),
          progression_data: JSON.parse((row.progression_data as string) || "{}"),
          world_data: JSON.parse((row.world_data as string) || "{}"),
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      }
    } catch (err) {
      console.error("Game Save GET DB error:", err);
    }
  }

  return new Response(JSON.stringify({ save: saveData }), {
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const body = (await context.request.json()) as { username?: string; savePayload?: any };
    const { username: usernameRaw, savePayload } = body;

    if (!usernameRaw || !savePayload) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const username = usernameRaw.toLowerCase();
    const db = context.env.DB;
    const now = new Date().toISOString();

    if (db) {
      let existingCreatedAt = now;
      try {
        const existing = await db
          .prepare("SELECT created_at FROM game_saves WHERE username = ?")
          .bind(username)
          .first<{ created_at: string }>();
        if (existing?.created_at) existingCreatedAt = existing.created_at;
      } catch {}

      await db
        .prepare(
          `INSERT INTO game_saves
             (username, save_version, level, wave, score, money,
              player_data, weapon_data, inventory_data, progression_data,
              world_data, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(username) DO UPDATE SET
             save_version     = excluded.save_version,
             level            = excluded.level,
             wave             = excluded.wave,
             score            = excluded.score,
             money            = excluded.money,
             player_data      = excluded.player_data,
             weapon_data      = excluded.weapon_data,
             inventory_data   = excluded.inventory_data,
             progression_data = excluded.progression_data,
             world_data       = excluded.world_data,
             updated_at       = excluded.updated_at`
        )
        .bind(
          username,
          savePayload.save_version ?? 1,
          savePayload.level ?? 1,
          savePayload.wave ?? 1,
          savePayload.score ?? 0,
          savePayload.money ?? 0,
          JSON.stringify(savePayload.player ?? {}),
          savePayload.weapons ? JSON.stringify(savePayload.weapons) : null,
          JSON.stringify(savePayload.inventory ?? {}),
          JSON.stringify(savePayload.progression ?? {}),
          JSON.stringify(savePayload.world ?? {}),
          existingCreatedAt,
          now
        )
        .run();
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Invalid payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
