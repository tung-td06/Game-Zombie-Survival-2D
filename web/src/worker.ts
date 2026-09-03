// Standalone Cloudflare Worker Entry Point for zombie-survival-api
// Binds env.DB to Cloudflare D1 Database

import {
  getPlayerByUsername,
  createPlayer,
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  getLeaderboardTop100,
  getPlayerStats,
  submitScore,
  validateScoreInput,
  getGameSave,
  saveGameSave,
  deleteGameSave,
} from "./lib/db";

export interface Env {
  DB: D1Database;
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Helper to parse cookies
      const cookieHeader = request.headers.get("Cookie") || "";
      const cookies = Object.fromEntries(
        cookieHeader.split(";").map((c) => {
          const [k, v] = c.trim().split("=");
          return [k, v];
        })
      );
      const token = cookies["zs_session"];

      // 1. Leaderboard
      if (path === "/api/leaderboard" && method === "GET") {
        const data = await getLeaderboardTop100(env.DB);
        return Response.json(
          { success: true, data, leaderboard: data },
          { headers: corsHeaders }
        );
      }

      // 2. Register
      if (path === "/api/player/register" && method === "POST") {
        const body = (await request.json()) as any;
        const { username, password, display_name } = body;
        if (!username || !password || username.length < 3 || password.length < 6) {
          return Response.json(
            { success: false, error: "Invalid registration input" },
            { status: 400, headers: corsHeaders }
          );
        }
        const existing = await getPlayerByUsername(env.DB, username);
        if (existing) {
          return Response.json(
            { success: false, error: "Username already exists" },
            { status: 409, headers: corsHeaders }
          );
        }
        const passwordHash = await hashPassword(password);
        const player = await createPlayer(env.DB, username, passwordHash, display_name);
        const newToken = await createSessionToken(player.id, player.username);
        return new Response(
          JSON.stringify({
            success: true,
            user: { id: player.id, username: player.username, display_name: player.display_name },
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "Set-Cookie": `zs_session=${newToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
            },
          }
        );
      }

      // 3. Login
      if (path === "/api/player/login" && method === "POST") {
        const body = (await request.json()) as any;
        const { username, password } = body;
        if (!username || !password) {
          return Response.json(
            { success: false, error: "Missing credentials" },
            { status: 400, headers: corsHeaders }
          );
        }
        const player = await getPlayerByUsername(env.DB, username);
        if (!player || !(await verifyPassword(password, player.password_hash))) {
          return Response.json(
            { success: false, error: "Invalid username or password" },
            { status: 401, headers: corsHeaders }
          );
        }
        const newToken = await createSessionToken(player.id, player.username);
        return new Response(
          JSON.stringify({
            success: true,
            user: { id: player.id, username: player.username, display_name: player.display_name },
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "Set-Cookie": `zs_session=${newToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
            },
          }
        );
      }

      // 4. Logout
      if (path === "/api/player/logout" && method === "POST") {
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Set-Cookie": `zs_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
          },
        });
      }

      // Authenticated session check for remaining routes
      const session = await verifySessionToken(token);

      // 5. Me
      if (path === "/api/player/me" && method === "GET") {
        if (!session) {
          return Response.json(
            { success: false, error: "Unauthorized" },
            { status: 401, headers: corsHeaders }
          );
        }
        return Response.json(
          {
            success: true,
            user: { id: session.playerId, username: session.username, display_name: session.username },
          },
          { headers: corsHeaders }
        );
      }

      // 6. Stats
      if (path === "/api/player/stats" && method === "GET") {
        if (!session) {
          return Response.json(
            { success: false, error: "Unauthorized" },
            { status: 401, headers: corsHeaders }
          );
        }
        const stats = await getPlayerStats(env.DB, session.playerId);
        return Response.json({ success: true, data: stats }, { headers: corsHeaders });
      }

      // 7. Submit score
      if (path === "/api/game/submit-score" && method === "POST") {
        if (!session) {
          return Response.json(
            { success: false, error: "Unauthorized" },
            { status: 401, headers: corsHeaders }
          );
        }
        const body = (await request.json()) as any;
        const validation = validateScoreInput(body);
        if (!validation.valid) {
          return Response.json(
            { success: false, error: validation.error },
            { status: 400, headers: corsHeaders }
          );
        }
        await submitScore(env.DB, session.playerId, body);
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // 8. Save game
      if ((path === "/api/game/save" || path === "/api/game/load") && method === "GET") {
        if (!session) {
          return Response.json(
            { success: false, error: "Unauthorized" },
            { status: 401, headers: corsHeaders }
          );
        }
        const save = await getGameSave(env.DB, session.playerId);
        return Response.json({ success: true, save }, { headers: corsHeaders });
      }

      if (path === "/api/game/save" && method === "POST") {
        if (!session) {
          return Response.json(
            { success: false, error: "Unauthorized" },
            { status: 401, headers: corsHeaders }
          );
        }
        const body = (await request.json()) as any;
        await saveGameSave(env.DB, session.playerId, body.savePayload || body);
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path === "/api/game/save" && method === "DELETE") {
        if (!session) {
          return Response.json(
            { success: false, error: "Unauthorized" },
            { status: 401, headers: corsHeaders }
          );
        }
        await deleteGameSave(env.DB, session.playerId);
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      return Response.json(
        { success: false, error: "Route not found" },
        { status: 404, headers: corsHeaders }
      );
    } catch (err: any) {
      console.error("Worker error:", err);
      return Response.json(
        { success: false, error: err?.message || "Internal server error" },
        { status: 500, headers: corsHeaders }
      );
    }
  },
};

export default worker;
