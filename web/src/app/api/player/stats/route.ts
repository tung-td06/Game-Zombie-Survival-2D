import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, getPlayerStats } from "@/lib/db";


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

    const stats = await getPlayerStats(session.playerId);
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
