import { NextRequest, NextResponse } from "next/server";
import { listSteps, createStep } from "@/lib/repo";
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
    const steps = await listSteps(parseId(id));
    return NextResponse.json(steps);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const step = await createStep(parseId(id), body ?? {}, {
      actor_id: body?.actor_id,
      actor_name: body?.actor_name,
    });
    return NextResponse.json(step, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
