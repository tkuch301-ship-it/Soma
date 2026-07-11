import { NextRequest, NextResponse } from "next/server";
import { getProjectById, updateProject, deleteProject } from "@/lib/repo";
import { handleApiError } from "@/lib/apiError";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { requireAdmin } from "@/lib/adminAuth";

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
    const project = await getProjectById(parseId(id));
    if (!project) {
      throw new NotFoundError(`project ${id} not found`);
    }
    return NextResponse.json(project);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    requireAdmin(req);
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const project = await updateProject(parseId(id), body ?? {}, {
      actor_id: body?.actor_id,
      actor_name: body?.actor_name,
    });
    return NextResponse.json(project);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    requireAdmin(req);
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    await deleteProject(parseId(id), {
      actor_id: body?.actor_id,
      actor_name: body?.actor_name,
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
