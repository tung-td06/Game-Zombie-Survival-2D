import { NextRequest, NextResponse } from "next/server";
import {
  getD1Database,
  getPlayerByUsername,
  verifyPassword,
  createSessionToken,
} from "@/lib/db";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      username?: string;
      password?: string;
    };
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: "Vui lòng nhập tên đăng nhập và mật khẩu" },
        { status: 400 }
      );
    }

    const isProd = process.env.NODE_ENV === "production";
    const db = getD1Database();

    const player = await getPlayerByUsername(db, username);
    if (!player) {
      return NextResponse.json(
        { success: false, error: "Tên đăng nhập hoặc mật khẩu không chính xác" },
        { status: 401 }
      );
    }

    const passwordValid = await verifyPassword(password, player.password_hash);
    if (!passwordValid) {
      return NextResponse.json(
        { success: false, error: "Tên đăng nhập hoặc mật khẩu không chính xác" },
        { status: 401 }
      );
    }

    const token = await createSessionToken(player.id, player.username);

    const res = NextResponse.json({
      success: true,
      user: {
        id: player.id,
        username: player.username,
        display_name: player.display_name,
      },
    });

    res.cookies.set("zs_session", token, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    res.cookies.set("session_user", player.username, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

    return res;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { success: false, error: "Đăng nhập thất bại" },
      { status: 500 }
    );
  }
}
