import { NextRequest, NextResponse } from "next/server";
import {
  getD1Database,
  verifySessionToken,
  syncSkillState,
} from "@/lib/db";

export const runtime = "edge";

/**
 * Sync the player's Skill Tree state (level / xp / skill_points / skills)
 * to the database. Identity comes from the authenticated session, never from
 * the body; every value is normalized and clamped server-side
 * (normalizeSkillState), so the client cannot store invalid levels, negative
 * points, skills above their cap, or more points than level-ups granted.
 */
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

    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const state = await syncSkillState(getD1Database(), session.playerId, {
      level: body.level,
      xp: body.xp,
      skill_points: body.skill_points,
      skills: body.skills,
    });

    return NextResponse.json({ success: true, state });
  } catch (err) {
    console.error("Skill state sync error:", err);
    return NextResponse.json(
      { success: false, error: "Unable to sync skill state" },
      { status: 500 }
    );
  }
}