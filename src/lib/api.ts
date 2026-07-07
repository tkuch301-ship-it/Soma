import type { Member, MemberStat, TaskStatus, TaskWithAssignee } from "@/lib/repo";

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

export interface TaskFilter {
  assigneeId?: number;
  status?: TaskStatus;
}

export interface TaskInput {
  title: string;
  description?: string;
  assignee_id?: number | null;
  status?: TaskStatus;
  due_date?: string | null;
}

export const api = {
  listMembers(): Promise<Member[]> {
    return request<Member[]>("/api/members");
  },
  createMember(name: string): Promise<Member> {
    return request<Member>("/api/members", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ name }),
    });
  },
  deleteMember(id: number): Promise<void> {
    return request<void>(`/api/members/${id}`, { method: "DELETE" });
  },

  listTasks(filter: TaskFilter = {}): Promise<TaskWithAssignee[]> {
    const params = new URLSearchParams();
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
    return request<TaskWithAssignee>("/api/tasks", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input),
    });
  },
  updateTask(id: number, input: Partial<TaskInput>): Promise<TaskWithAssignee> {
    return request<TaskWithAssignee>(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(input),
    });
  },
  deleteTask(id: number): Promise<void> {
    return request<void>(`/api/tasks/${id}`, { method: "DELETE" });
  },

  memberStats(): Promise<MemberStat[]> {
    return request<MemberStat[]>("/api/stats");
  },
};
