import { NextRequest, NextResponse } from "next/server";
import { updateTask, deleteTask } from "@/lib/repo";
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

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const task = await updateTask(parseId(id), body ?? {}, {
      actor_id: body?.actor_id,
      actor_name: body?.actor_name,
    });
    return NextResponse.json(task);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    await deleteTask(parseId(id), {
      actor_id: body?.actor_id,
      actor_name: body?.actor_name,
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
