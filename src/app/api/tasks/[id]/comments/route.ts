import { NextRequest, NextResponse } from "next/server";
import { createComment } from "@/lib/repo";
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

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const comment = await createComment(parseId(id), body ?? {}, {
      actor_id: body?.actor_id,
      actor_name: body?.actor_name,
    });
    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
