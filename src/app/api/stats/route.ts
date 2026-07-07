import { NextRequest, NextResponse } from "next/server";
import { projectStats } from "@/lib/repo";
import { handleApiError } from "@/lib/apiError";
import { ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectIdRaw = searchParams.get("projectId");

    let projectId: number | undefined;
    if (projectIdRaw !== null) {
      projectId = Number(projectIdRaw);
      if (!Number.isInteger(projectId) || projectId <= 0) {
        throw new ValidationError("projectId must be a positive integer");
      }
    }

    // projectId is optional: when omitted, stats are aggregated across every
    // project (this keeps the pre-v2 dashboard, which calls /api/stats with
    // no query params, working unchanged).
    const stats = await projectStats(projectId);
    return NextResponse.json(stats);
  } catch (err) {
    return handleApiError(err);
  }
}
