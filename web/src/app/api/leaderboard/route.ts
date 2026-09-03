import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import {
  getLeaderboard,
  addLeaderboardEntry,
  LeaderboardEntry,
} from "@/lib/db";

export const runtime = "edge";

export async function GET() {
  const { env } = getRequestContext();
  const db = env.DB;
  const leaderboard = await getLeaderboard(db);
  return NextResponse.json({ leaderboard });
}

export async function POST(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = env.DB;

    const body = await req.json() as { username?: string; score?: number; kills?: number; wave?: number; level?: number };
    const { username, score, kills, wave, level } = body;

    if (!username) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      );
    }

    // Session verification — only allow submitting scores for your own account
    const sessionUser = req.cookies.get("session_user")?.value;
    if (!sessionUser || sessionUser !== username.toLowerCase()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const entry: LeaderboardEntry = {
      username,
      score: Number(score) || 0,
      kills: Number(kills) || 0,
      wave: Number(wave) || 1,
      level: Number(level) || 1,
      date: new Date().toISOString(),
    };

    await addLeaderboardEntry(db, entry);
    const leaderboard = await getLeaderboard(db);
    return NextResponse.json({ success: true, leaderboard });
  } catch (_err) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
