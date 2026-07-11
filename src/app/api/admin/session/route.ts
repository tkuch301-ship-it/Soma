import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return NextResponse.json({ admin: isAdminRequest(req) });
}
