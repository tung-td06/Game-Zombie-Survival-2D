import { NextRequest, NextResponse } from "next/server";
import { getD1Database, verifySessionToken, getPlayerStats } from "@/lib/db";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("zs_session")?.value;
    const session = await verifySessionToken(token);

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const db = getD1Database();
    if (!db) {
      return NextResponse.json({
        success: true,
        data: {
          player_id: session.playerId,
          total_games: 0,
          best_score: 0,
          best_wave: 0,
          total_zombies_killed: 0,
          best_survival_time: 0,
          updated_at: Date.now(),
        },
      });
    }

    const stats = await getPlayerStats(db, session.playerId);
    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error("Get player stats error:", err);
    return NextResponse.json(
      { success: false, error: "Unable to load player stats" },
      { status: 500 }
    );
  }
}
