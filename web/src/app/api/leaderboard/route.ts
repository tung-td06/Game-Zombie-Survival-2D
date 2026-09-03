import { NextResponse } from "next/server";
import { getD1Database, getLeaderboardTop100 } from "@/lib/db";

export const runtime = "edge";

export async function GET() {
  try {
    const db = getD1Database();
    const data = await getLeaderboardTop100(db);
    return NextResponse.json({
      success: true,
      data,
      leaderboard: data, // backwards compatibility
    });
  } catch (err) {
    console.error("Leaderboard GET error:", err);
    return NextResponse.json(
      { success: false, error: "Unable to load leaderboard" },
      { status: 500 }
    );
  }
}
