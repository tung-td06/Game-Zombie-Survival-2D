import { NextRequest, NextResponse } from "next/server";
import {
  verifySessionToken,
  getGameSave,
  saveGameSave,
  deleteGameSave,
} from "@/lib/db";


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

    const save = await getGameSave(session.playerId);
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

    if (!savePayload) {
      return NextResponse.json(
        { success: false, error: "Save payload is required" },
        { status: 400 }
      );
    }

    await saveGameSave(session.playerId, savePayload);

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

    await deleteGameSave(session.playerId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Game save DELETE error:", err);
    return NextResponse.json(
      { success: false, error: "Unable to delete save game" },
      { status: 500 }
    );
  }
}
