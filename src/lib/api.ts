import type {
  Activity,
  Member,
  MemberStat,
  Project,
  ProjectStatus,
  ProjectWithStats,
  Step,
  TaskStatus,
  TaskWithAssignee,
} from "@/lib/repo";
import { readActor } from "@/lib/actor";

export class ApiError extends Error {}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("サーバーに接続できませんでした。ネットワークを確認してください。");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `リクエストに失敗しました (${res.status})`;
    throw new ApiError(message);
  }

  return data as T;
}

const jsonHeaders = { "Content-Type": "application/json" };

/** Attaches the currently selected "自分" (self) actor to a mutation body, when one is selected. */
function withActor<T extends Record<string, unknown>>(body: T): T & { actor_id?: number; actor_name?: string } {
  const actor = readActor();
  if (!actor) return body;
  return { ...body, actor_id: actor.id, actor_name: actor.name };
}

function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(withActor(body)),
  });
}

function patchJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  return request<T>(url, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(withActor(body)),
  });
}

function del(url: string): Promise<void> {
  return request<void>(url, {
    method: "DELETE",
    headers: jsonHeaders,
    body: JSON.stringify(withActor({})),
  });
}

export interface TaskFilter {
  projectId?: number;
  assigneeId?: number;
  status?: TaskStatus;
}

export interface TaskInput {
  project_id?: number;
  title: string;
  description?: string;
  assignee_id?: number | null;
  status?: TaskStatus;
  due_date?: string | null;
}

export interface ProjectInput {
  name: string;
  description?: string;
  status?: ProjectStatus;
  due_date?: string | null;
}

export interface StepInput {
  title: string;
  position?: number;
}

export const api = {
  // ---------- Members ----------
  listMembers(): Promise<Member[]> {
    return request<Member[]>("/api/members");
  },
  createMember(name: string): Promise<Member> {
    return postJson<Member>("/api/members", { name });
  },
  deleteMember(id: number): Promise<void> {
    return del(`/api/members/${id}`);
  },

  // ---------- Projects ----------
  listProjects(): Promise<ProjectWithStats[]> {
    return request<ProjectWithStats[]>("/api/projects");
  },
  getProject(id: number): Promise<Project> {
    return request<Project>(`/api/projects/${id}`);
  },
  createProject(input: ProjectInput): Promise<Project> {
    return postJson<Project>("/api/projects", { ...input });
  },
  updateProject(id: number, input: Partial<ProjectInput>): Promise<Project> {
    return patchJson<Project>(`/api/projects/${id}`, { ...input });
  },
  deleteProject(id: number): Promise<void> {
    return del(`/api/projects/${id}`);
  },
  listProjectActivities(id: number): Promise<Activity[]> {
    return request<Activity[]>(`/api/projects/${id}/activities`);
  },

  // ---------- Tasks ----------
  listTasks(filter: TaskFilter = {}): Promise<TaskWithAssignee[]> {
    const params = new URLSearchParams();
    if (filter.projectId !== undefined) {
      params.set("projectId", String(filter.projectId));
    }
    if (filter.assigneeId !== undefined) {
      params.set("assigneeId", String(filter.assigneeId));
    }
    if (filter.status !== undefined) {
      params.set("status", filter.status);
    }
    const qs = params.toString();
    return request<TaskWithAssignee[]>(`/api/tasks${qs ? `?${qs}` : ""}`);
  },
  createTask(input: TaskInput): Promise<TaskWithAssignee> {
    return postJson<TaskWithAssignee>("/api/tasks", { ...input });
  },
  updateTask(id: number, input: Partial<TaskInput>): Promise<TaskWithAssignee> {
    return patchJson<TaskWithAssignee>(`/api/tasks/${id}`, { ...input });
  },
  deleteTask(id: number): Promise<void> {
    return del(`/api/tasks/${id}`);
  },
  listTaskActivities(id: number): Promise<Activity[]> {
    return request<Activity[]>(`/api/tasks/${id}/activities`);
  },

  // ---------- Steps ----------
  listSteps(taskId: number): Promise<Step[]> {
    return request<Step[]>(`/api/tasks/${taskId}/steps`);
  },
  createStep(taskId: number, input: StepInput): Promise<Step> {
    return postJson<Step>(`/api/tasks/${taskId}/steps`, { ...input });
  },
  updateStep(id: number, input: { title?: string; done?: boolean }): Promise<Step> {
    return patchJson<Step>(`/api/steps/${id}`, { ...input });
  },
  deleteStep(id: number): Promise<void> {
    return del(`/api/steps/${id}`);
  },

  // ---------- Stats ----------
  memberStats(projectId?: number): Promise<MemberStat[]> {
    const qs = projectId !== undefined ? `?projectId=${projectId}` : "";
    return request<MemberStat[]>(`/api/stats${qs}`);
  },
};
