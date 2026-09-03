import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, getGameSave } from "@/lib/db";


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
    console.error("Game load GET error:", err);
    return NextResponse.json(
      { success: false, error: "Unable to load game save" },
      { status: 500 }
    );
  }
}
