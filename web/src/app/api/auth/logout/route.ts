import { NextResponse } from "next/server";


export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("zs_session");
  response.cookies.delete("session_user");
  return response;
}
