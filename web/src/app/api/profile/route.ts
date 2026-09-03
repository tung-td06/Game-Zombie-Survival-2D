import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { getProfile, saveProfile } from "@/lib/db";

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

  const { env } = getRequestContext();
  const db = env.DB;

  let profile = await getProfile(db, key);

  // Auto-create a clean default profile for new users
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
    await saveProfile(db, key, profile);
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

    const { env } = getRequestContext();
    const db = env.DB;

    const key = username.trim().toLowerCase();
    await saveProfile(db, key, profileData);
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
