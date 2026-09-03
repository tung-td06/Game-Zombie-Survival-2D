import { NextResponse } from "next/server";

export const runtime = "edge";

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete("zs_session");
  res.cookies.delete("session_user");
  return res;
}
