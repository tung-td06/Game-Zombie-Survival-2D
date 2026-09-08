import { NextRequest, NextResponse } from "next/server";
import {
  getD1Database,
  verifySessionToken,
  upgradeSkill,
} from "@/lib/db";

export const runtime = "edge";

/**
 * Spend one skill point on a skill. The spend is executed as a single atomic
 * UPDATE on the database (WHERE skill_points > 0 AND skill_<uid> < max), so
 * a client can never double-spend one point or exceed a skill's cap, even
 * with racing requests. The client only sends the skill id; identity,
 * available points and the max level are all resolved server-side.
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

    const body = (await req.json().catch(() => ({}))) as { skill?: string };
    const uid = typeof body.skill === "string" ? body.skill : "";

    if (!uid) {
      return NextResponse.json(
        { success: false, error: "Skill id is required" },
        { status: 400 }
      );
    }

    const result = await upgradeSkill(getD1Database(), session.playerId, uid);

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error, state: result.state ?? null },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, state: result.state });
  } catch (err) {
    console.error("Skill upgrade error:", err);
    return NextResponse.json(
      { success: false, error: "Unable to upgrade skill" },
      { status: 500 }
    );
  }
}