import { NextRequest, NextResponse } from "next/server";
import { listTasks, createTask, TaskStatus } from "@/lib/repo";
import { handleApiError } from "@/lib/apiError";
import { ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

const STATUSES: TaskStatus[] = ["todo", "doing", "review", "done"];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectIdRaw = searchParams.get("projectId");
    const assigneeIdRaw = searchParams.get("assigneeId");
    const statusRaw = searchParams.get("status");

    const filter: { projectId?: number; assigneeId?: number; status?: TaskStatus } = {};

    if (projectIdRaw !== null) {
      const projectId = Number(projectIdRaw);
      if (!Number.isInteger(projectId) || projectId <= 0) {
        throw new ValidationError("projectId must be a positive integer");
      }
      filter.projectId = projectId;
    }

    if (assigneeIdRaw !== null) {
      const assigneeId = Number(assigneeIdRaw);
      if (!Number.isInteger(assigneeId) || assigneeId <= 0) {
        throw new ValidationError("assigneeId must be a positive integer");
      }
      filter.assigneeId = assigneeId;
    }

    if (statusRaw !== null) {
      if (!STATUSES.includes(statusRaw as TaskStatus)) {
        throw new ValidationError(`status must be one of: ${STATUSES.join(", ")}`);
      }
      filter.status = statusRaw as TaskStatus;
    }

    const tasks = await listTasks(filter);
    return NextResponse.json(tasks);
  } catch (err) {
    return handleApiError(err);
  }
}

// Intentionally NOT admin-gated: anyone can create a task (including with an
// initial assignee/due date via body.assignee_ids/due_date). Only *editing*
// or *deleting* existing tasks (PATCH/DELETE /api/tasks/[id]) requires admin.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const task = await createTask(body ?? {}, {
      actor_id: body?.actor_id,
      actor_name: body?.actor_name,
    });
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
