import { NextRequest, NextResponse } from "next/server";
import { getProfile, saveProfile, getD1Database } from "@/lib/db";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");

  if (!username) {
    return NextResponse.json(
      { error: "Username is required" },
      { status: 400 }
    );
  }

  const key = username.trim().toLowerCase();
  if (!key) {
    return NextResponse.json(
      { error: "Username cannot be empty" },
      { status: 400 }
    );
  }

  const db = getD1Database();

  let profile = db ? await getProfile(db, key) : null;

  // Auto-create a clean default profile for new users or local dev fallback
  if (!profile) {
    profile = {
      high_score: 0,
      total_kills: 0,
      coins: 0,
      player_level: 1,
      xp: 0,
      unlocked_weapons: ["pistol"],
      weapon_upgrades: {},
      player_upgrades: {},
      achievements: [],
      quests_claimed: [],
      settings: {},
    };
    if (db) await saveProfile(db, key, profile);
  }

  const response = NextResponse.json({ profile });

  response.cookies.set("session_user", key, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 1 week
  });

  return response;
}


export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { username?: string; profileData?: any };
    const { username, profileData } = body;

    if (!username) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      );
    }
    if (!profileData) {
      return NextResponse.json(
        { error: "Profile data is required" },
        { status: 400 }
      );
    }

    const db = getD1Database();

    const key = username.trim().toLowerCase();
    if (db) await saveProfile(db, key, profileData);
    const response = NextResponse.json({ success: true });

    response.cookies.set("session_user", key, {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });

    return response;
  } catch (_err) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
