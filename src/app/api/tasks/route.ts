import { NextRequest, NextResponse } from "next/server";
import { listTasks, createTask, TaskStatus } from "@/lib/repo";
import { handleApiError } from "@/lib/apiError";
import { ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

const STATUSES: TaskStatus[] = ["todo", "doing", "done"];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const assigneeIdRaw = searchParams.get("assigneeId");
    const statusRaw = searchParams.get("status");

    const filter: { assigneeId?: number; status?: TaskStatus } = {};

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

    const tasks = listTasks(filter);
    return NextResponse.json(tasks);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const task = createTask(body ?? {});
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
