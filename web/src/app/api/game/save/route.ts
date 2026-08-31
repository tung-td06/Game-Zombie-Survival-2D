import { NextRequest, NextResponse } from "next/server";
import { getGameSave, saveGameSave, deleteGameSave } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");

  if (!username) {
    return NextResponse.json({ error: "Username is required" }, { status: 400 });
  }

  // Session verification
  const sessionUser = req.cookies.get("session_user")?.value;
  if (!sessionUser || sessionUser !== username) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const save = getGameSave(username);
  return NextResponse.json({ save });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, savePayload } = body;

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }
    if (!savePayload) {
      return NextResponse.json({ error: "Save payload is required" }, { status: 400 });
    }

    // Session verification
    const sessionUser = req.cookies.get("session_user")?.value;
    if (!sessionUser || sessionUser !== username) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validation checks
    if (typeof savePayload.save_version !== "number" ||
        typeof savePayload.level !== "number" ||
        typeof savePayload.wave !== "number" ||
        typeof savePayload.score !== "number" ||
        typeof savePayload.money !== "number") {
      return NextResponse.json({ error: "Invalid save payload format" }, { status: 400 });
    }

    if (!savePayload.player || typeof savePayload.player !== "object" ||
        typeof savePayload.player.x !== "number" ||
        typeof savePayload.player.y !== "number" ||
        typeof savePayload.player.hp !== "number" ||
        typeof savePayload.player.maxHp !== "number" ||
        typeof savePayload.player.armor !== "number") {
      return NextResponse.json({ error: "Invalid player data in save payload" }, { status: 400 });
    }

    // UPSERT
    const dbSave = {
      username,
      save_version: savePayload.save_version,
      level: savePayload.level,
      wave: savePayload.wave,
      score: savePayload.score,
      money: savePayload.money,
      player_data: savePayload.player,
      weapon_data: savePayload.weapons,
      inventory_data: savePayload.inventory || {},
      progression_data: savePayload.progression || {},
      world_data: savePayload.world || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    saveGameSave(username, dbSave);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    // Session verification
    const sessionUser = req.cookies.get("session_user")?.value;
    if (!sessionUser || sessionUser !== username) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    deleteGameSave(username);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
