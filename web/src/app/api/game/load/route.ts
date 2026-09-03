import { NextRequest, NextResponse } from "next/server";
import { getD1Database, verifySessionToken, getGameSave } from "@/lib/db";

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
    const save = db ? await getGameSave(db, session.playerId) : null;
    return NextResponse.json({ success: true, save });
  } catch (err) {
    console.error("Game load GET error:", err);
    return NextResponse.json(
      { success: false, error: "Unable to load game save" },
      { status: 500 }
    );
  }
}
