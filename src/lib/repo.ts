import { getDb } from "./db";
import { ValidationError, NotFoundError, ConflictError } from "./errors";

export type TaskStatus = "todo" | "doing" | "done";

export interface Member {
  id: number;
  name: string;
  created_at: string;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  assignee_id: number | null;
  status: TaskStatus;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskWithAssignee extends Task {
  assignee_name: string | null;
}

export interface MemberStat {
  id: number;
  name: string;
  total: number;
  done: number;
}

const STATUSES: TaskStatus[] = ["todo", "doing", "done"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function nowIso(): string {
  return new Date().toISOString();
}

function isSqliteUniqueError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

function assertValidName(name: unknown): string {
  if (typeof name !== "string") {
    throw new ValidationError("name is required");
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("name must not be empty");
  }
  if (trimmed.length > 50) {
    throw new ValidationError("name must be 50 characters or fewer");
  }
  return trimmed;
}

function assertValidTitle(title: unknown): string {
  if (typeof title !== "string") {
    throw new ValidationError("title is required");
  }
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("title must not be empty");
  }
  if (trimmed.length > 200) {
    throw new ValidationError("title must be 200 characters or fewer");
  }
  return trimmed;
}

function normalizeDescription(description: unknown): string {
  if (description === undefined || description === null) {
    return "";
  }
  if (typeof description !== "string") {
    throw new ValidationError("description must be a string");
  }
  return description;
}

function assertValidStatus(status: unknown): TaskStatus {
  if (typeof status !== "string" || !STATUSES.includes(status as TaskStatus)) {
    throw new ValidationError(`status must be one of: ${STATUSES.join(", ")}`);
  }
  return status as TaskStatus;
}

function assertValidDueDate(dueDate: unknown): string | null {
  if (dueDate === undefined || dueDate === null || dueDate === "") {
    return null;
  }
  if (typeof dueDate !== "string" || !DATE_RE.test(dueDate)) {
    throw new ValidationError("due_date must be in YYYY-MM-DD format or null");
  }
  const parsed = new Date(dueDate + "T00:00:00Z");
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("due_date must be a valid date");
  }
  return dueDate;
}

function assertValidAssigneeId(assigneeId: unknown): number | null {
  if (assigneeId === undefined || assigneeId === null) {
    return null;
  }
  const id = Number(assigneeId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError("assignee_id must be a positive integer or null");
  }
  const db = getDb();
  const member = db.prepare("SELECT id FROM members WHERE id = ?").get(id);
  if (!member) {
    throw new ValidationError(`assignee_id ${id} does not reference an existing member`);
  }
  return id;
}

// ---------- Members ----------

export function listMembers(): Member[] {
  const db = getDb();
  return db.prepare("SELECT * FROM members ORDER BY id ASC").all() as Member[];
}

export function createMember(name: unknown): Member {
  const validName = assertValidName(name);
  const db = getDb();
  try {
    const info = db
      .prepare("INSERT INTO members (name, created_at) VALUES (?, ?)")
      .run(validName, nowIso());
    return db
      .prepare("SELECT * FROM members WHERE id = ?")
      .get(info.lastInsertRowid) as Member;
  } catch (err) {
    if (isSqliteUniqueError(err)) {
      throw new ConflictError(`member name "${validName}" already exists`);
    }
    throw err;
  }
}

export function deleteMember(id: number): void {
  const db = getDb();
  const info = db.prepare("DELETE FROM members WHERE id = ?").run(id);
  if (info.changes === 0) {
    throw new NotFoundError(`member ${id} not found`);
  }
}

// ---------- Tasks ----------

export interface TaskFilter {
  assigneeId?: number;
  status?: TaskStatus;
}

export interface CreateTaskInput {
  title: unknown;
  description?: unknown;
  assignee_id?: unknown;
  status?: unknown;
  due_date?: unknown;
}

export interface UpdateTaskInput {
  title?: unknown;
  description?: unknown;
  assignee_id?: unknown;
  status?: unknown;
  due_date?: unknown;
}

const TASK_SELECT_WITH_ASSIGNEE = `
  SELECT
    t.id, t.title, t.description, t.assignee_id, t.status, t.due_date,
    t.created_at, t.updated_at,
    m.name AS assignee_name
  FROM tasks t
  LEFT JOIN members m ON m.id = t.assignee_id
`;

export function listTasks(filter: TaskFilter = {}): TaskWithAssignee[] {
  const db = getDb();
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filter.assigneeId !== undefined) {
    clauses.push("t.assignee_id = ?");
    params.push(filter.assigneeId);
  }
  if (filter.status !== undefined) {
    clauses.push("t.status = ?");
    params.push(filter.status);
  }

  const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  const sql = `${TASK_SELECT_WITH_ASSIGNEE}${where} ORDER BY t.id ASC`;
  return db.prepare(sql).all(...params) as TaskWithAssignee[];
}

export function getTaskById(id: number): TaskWithAssignee | undefined {
  const db = getDb();
  return db
    .prepare(`${TASK_SELECT_WITH_ASSIGNEE} WHERE t.id = ?`)
    .get(id) as TaskWithAssignee | undefined;
}

export function createTask(input: CreateTaskInput): TaskWithAssignee {
  const title = assertValidTitle(input.title);
  const description = normalizeDescription(input.description);
  const assigneeId = assertValidAssigneeId(input.assignee_id);
  const status = input.status === undefined ? "todo" : assertValidStatus(input.status);
  const dueDate = assertValidDueDate(input.due_date);
  const timestamp = nowIso();

  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO tasks (title, description, assignee_id, status, due_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(title, description, assigneeId, status, dueDate, timestamp, timestamp);

  return getTaskById(info.lastInsertRowid as number) as TaskWithAssignee;
}

export function updateTask(id: number, input: UpdateTaskInput): TaskWithAssignee {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
    | Task
    | undefined;
  if (!existing) {
    throw new NotFoundError(`task ${id} not found`);
  }

  const title = input.title === undefined ? existing.title : assertValidTitle(input.title);
  const description =
    input.description === undefined
      ? existing.description
      : normalizeDescription(input.description);
  const assigneeId =
    input.assignee_id === undefined
      ? existing.assignee_id
      : assertValidAssigneeId(input.assignee_id);
  const status =
    input.status === undefined ? existing.status : assertValidStatus(input.status);
  const dueDate =
    input.due_date === undefined ? existing.due_date : assertValidDueDate(input.due_date);

  db.prepare(
    `UPDATE tasks
     SET title = ?, description = ?, assignee_id = ?, status = ?, due_date = ?, updated_at = ?
     WHERE id = ?`
  ).run(title, description, assigneeId, status, dueDate, nowIso(), id);

  return getTaskById(id) as TaskWithAssignee;
}

export function deleteTask(id: number): void {
  const db = getDb();
  const info = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  if (info.changes === 0) {
    throw new NotFoundError(`task ${id} not found`);
  }
}

// ---------- Stats ----------

export function memberStats(): MemberStat[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT
         m.id AS id,
         m.name AS name,
         COUNT(t.id) AS total,
         SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done
       FROM members m
       LEFT JOIN tasks t ON t.assignee_id = m.id
       GROUP BY m.id, m.name
       ORDER BY m.id ASC`
    )
    .all() as MemberStat[];
}
