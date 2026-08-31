import { NextRequest, NextResponse } from "next/server";
import { getProfile, saveProfile } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");

  if (!username) {
    return NextResponse.json({ error: "Username is required" }, { status: 400 });
  }

  const profile = getProfile(username);
  const response = NextResponse.json({ profile });
  
  response.cookies.set("session_user", username, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 1 week
  });
  
  return response;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, profileData } = body;

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }
    if (!profileData) {
      return NextResponse.json({ error: "Profile data is required" }, { status: 400 });
    }

    saveProfile(username, profileData);
    const response = NextResponse.json({ success: true });
    
    response.cookies.set("session_user", username, {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });
    
    return response;
  } catch (err) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

