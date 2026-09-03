import { NextResponse } from "next/server";
import { getLeaderboardTop100 } from "@/lib/db";


export async function GET() {
  try {
    const data = await getLeaderboardTop100();
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
