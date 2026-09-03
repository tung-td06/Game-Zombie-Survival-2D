import { NextRequest, NextResponse } from "next/server";
import {
  getD1Database,
  getPlayerByUsername,
  createPlayer,
  hashPassword,
  createSessionToken,
} from "@/lib/db";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      username?: string;
      password?: string;
      display_name?: string;
    };
    const { username, password, display_name } = body;

    if (!username || typeof username !== "string" || username.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: "Tên đăng nhập phải có ít nhất 3 ký tự" },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { success: false, error: "Mật khẩu phải có ít nhất 6 ký tự" },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim().toLowerCase();
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      return NextResponse.json(
        { success: false, error: "Tên đăng nhập chỉ được chứa chữ cái, số và dấu gạch dưới" },
        { status: 400 }
      );
    }

    const isProd = process.env.NODE_ENV === "production";
    const db = getD1Database();

    const existing = await getPlayerByUsername(db, cleanUsername);
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Tên người chơi đã tồn tại" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const player = await createPlayer(db, cleanUsername, passwordHash, display_name);
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
    // Set session_user for backwards compatibility if needed
    res.cookies.set("session_user", player.username, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

    return res;
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json(
      { success: false, error: "Không thể tạo tài khoản" },
      { status: 500 }
    );
  }
}
