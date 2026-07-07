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
    const task = updateTask(parseId(id), body ?? {});
    return NextResponse.json(task);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    deleteTask(parseId(id));
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
