import { NextRequest, NextResponse } from "next/server";
import {
  getD1Database,
  verifySessionToken,
  getGameSave,
  saveGameSave,
  deleteGameSave,
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

    const body = (await req.json()) as { savePayload?: any };
    const { savePayload } = body;

    const db = getD1Database();

    // A save row is ONLY ever written here — an explicit "Save Game" action
    // from the player. Starting a New Game or leaving the run never touches
    // the Continue save, so an existing save stays intact and a player with
    // no save sees no Continue until they actually save.
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
