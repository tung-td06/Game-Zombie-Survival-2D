import { NextRequest, NextResponse } from "next/server";
import { getD1Database, verifySessionToken, getPlayerById } from "@/lib/db";

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
        user: { id: session.playerId, username: session.username, display_name: session.username },
      });
    }

    const player = await getPlayerById(db, session.playerId);
    if (!player) {
      return NextResponse.json(
        { success: false, error: "Player not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: player.id,
        username: player.username,
        display_name: player.display_name,
      },
    });
  } catch (err) {
    console.error("Get me error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
