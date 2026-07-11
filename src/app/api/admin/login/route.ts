import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/apiError";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminToken,
  getAdminPassword,
  verifyPassword,
} from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const adminPassword = getAdminPassword();
    if (!adminPassword) {
      return NextResponse.json(
        { error: "ADMIN_PASSWORD is not configured" },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    if (!verifyPassword(body?.password, adminPassword)) {
      return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
    }

    const token = createAdminToken(adminPassword);
    const res = NextResponse.json({ admin: true });
    res.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    });
    return res;
  } catch (err) {
    return handleApiError(err);
  }
}
