import { NextRequest, NextResponse } from "next/server";
import { getLeaderboard, addLeaderboardEntry, LeaderboardEntry } from "@/lib/db";

export async function GET() {
  const leaderboard = getLeaderboard();
  return NextResponse.json({ leaderboard });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, score, kills, wave, level } = body;

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    const entry: LeaderboardEntry = {
      username,
      score: Number(score) || 0,
      kills: Number(kills) || 0,
      wave: Number(wave) || 1,
      level: Number(level) || 1,
      date: new Date().toISOString(),
    };

    addLeaderboardEntry(entry);
    return NextResponse.json({ success: true, leaderboard: getLeaderboard() });
  } catch (err) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
