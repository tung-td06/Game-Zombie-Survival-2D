import { NextRequest, NextResponse } from "next/server";
import {
  getD1Database,
  verifySessionToken,
  getGameSave,
  saveGameSave,
  deleteGameSave,
  resetGameSave,
} from "@/lib/db";

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
    const save = await getGameSave(db, session.playerId);
    return NextResponse.json({ success: true, save });
  } catch (err) {
    console.error("Game save GET error:", err);
    return NextResponse.json(
      { success: false, error: "Unable to load game save" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("zs_session")?.value;
    const session = await verifySessionToken(token);

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as { savePayload?: any; action?: string };
    const { savePayload, action } = body;

    const db = getD1Database();

    // NEW GAME: replace the player's save row with a server-generated fresh
    // progression (level 1, $0, pistol only, no drone, empty skill tree,
    // wave 1). The account itself is never touched. Identity comes from the
    // verified session, never from the body.
    if (action === "new_game") {
      await resetGameSave(db, session.playerId);
      return NextResponse.json({ success: true });
    }

    if (!savePayload) {
      return NextResponse.json(
        { success: false, error: "Save payload is required" },
        { status: 400 }
      );
    }

    await saveGameSave(db, session.playerId, savePayload);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Game save POST error:", err);
    return NextResponse.json(
      { success: false, error: "Unable to save game" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
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
    await deleteGameSave(db, session.playerId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Game save DELETE error:", err);
    return NextResponse.json(
      { success: false, error: "Unable to delete save game" },
      { status: 500 }
    );
  }
}
