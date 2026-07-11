import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ admin: false });
  res.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
