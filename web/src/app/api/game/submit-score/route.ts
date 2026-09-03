import { NextRequest, NextResponse } from "next/server";
import {
  verifySessionToken,
  validateScoreInput,
  submitScore,
  SubmitScoreInput,
} from "@/lib/db";


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

    const body = (await req.json()) as SubmitScoreInput;
    const validation = validateScoreInput(body);

    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error || "Invalid score data" },
        { status: 400 }
      );
    }

    await submitScore(session.playerId, {
      score: Number(body.score) || 0,
      wave: Number(body.wave) || 0,
      zombies_killed: Number(body.zombies_killed) || 0,
      survival_time: Number(body.survival_time) || 0,
      shots_fired: Number(body.shots_fired) || 0,
      shots_hit: Number(body.shots_hit) || 0,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Submit score error:", err);
    return NextResponse.json(
      { success: false, error: "Unable to submit score" },
      { status: 500 }
    );
  }
}
