import { NextRequest, NextResponse } from "next/server";
import { listTaskActivities } from "@/lib/repo";
import { handleApiError } from "@/lib/apiError";
import { ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError("id must be a positive integer");
  }
  return id;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const activities = await listTaskActivities(parseId(id), 50);
    return NextResponse.json(activities);
  } catch (err) {
    return handleApiError(err);
  }
}
