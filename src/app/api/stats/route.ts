import { NextResponse } from "next/server";
import { memberStats } from "@/lib/repo";
import { handleApiError } from "@/lib/apiError";

export const runtime = "nodejs";

export async function GET() {
  try {
    const stats = memberStats();
    return NextResponse.json(stats);
  } catch (err) {
    return handleApiError(err);
  }
}
