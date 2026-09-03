interface Env {
  DB?: D1Database;
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const db = context.env.DB;
  let leaderboard: any[] = [];

  if (db) {
    try {
      const { results } = await db
        .prepare(
          "SELECT username, score, kills, wave, level, date FROM leaderboard ORDER BY score DESC LIMIT 20"
        )
        .all();
      leaderboard = results || [];
    } catch (err) {
      console.error("Leaderboard GET DB error:", err);
    }
  }

  return new Response(JSON.stringify({ leaderboard }), {
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const body = (await context.request.json()) as {
      username?: string;
      score?: number;
      kills?: number;
      wave?: number;
      level?: number;
    };
    const { username, score, kills, wave, level } = body;

    if (!username) {
      return new Response(JSON.stringify({ error: "Username is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const key = username.trim().toLowerCase();
    const db = context.env.DB;

    if (db) {
      await db
        .prepare(
          `INSERT INTO leaderboard (username, score, kills, wave, level, date)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(username) DO UPDATE SET
             score = CASE WHEN excluded.score > leaderboard.score THEN excluded.score ELSE leaderboard.score END,
             kills = CASE WHEN excluded.score > leaderboard.score THEN excluded.kills ELSE leaderboard.kills END,
             wave  = CASE WHEN excluded.score > leaderboard.score THEN excluded.wave  ELSE leaderboard.wave  END,
             level = CASE WHEN excluded.score > leaderboard.score THEN excluded.level ELSE leaderboard.level END,
             date  = CASE WHEN excluded.score > leaderboard.score THEN excluded.date  ELSE leaderboard.date  END`
        )
        .bind(
          key,
          Number(score) || 0,
          Number(kills) || 0,
          Number(wave) || 1,
          Number(level) || 1,
          new Date().toISOString()
        )
        .run();
    }

    let leaderboard: any[] = [];
    if (db) {
      const { results } = await db
        .prepare(
          "SELECT username, score, kills, wave, level, date FROM leaderboard ORDER BY score DESC LIMIT 20"
        )
        .all();
      leaderboard = results || [];
    }

    return new Response(JSON.stringify({ success: true, leaderboard }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Invalid payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
