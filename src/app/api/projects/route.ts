import { NextRequest, NextResponse } from "next/server";
import { listProjects, createProject } from "@/lib/repo";
import { handleApiError } from "@/lib/apiError";

export const runtime = "nodejs";

export async function GET() {
  try {
    const projects = await listProjects();
    return NextResponse.json(projects);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const project = await createProject(body ?? {}, {
      actor_id: body?.actor_id,
      actor_name: body?.actor_name,
    });
    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
