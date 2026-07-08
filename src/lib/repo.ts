import { getSupabase } from "./supabase";
import { mapPostgrestError } from "./apiError";
import { ValidationError, NotFoundError, ConflictError } from "./errors";

export type TaskStatus = "todo" | "doing" | "review" | "done";
export type ProjectStatus = "active" | "archived";

export interface Member {
  id: number;
  name: string;
  created_at: string;
}

export interface TaskAssignee {
  id: number;
  name: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  status: ProjectStatus;
  due_date: string | null;
  created_at: string;
}

export interface ProjectWithStats extends Project {
  tasks_total: number;
  tasks_done: number;
}

export interface Task {
  id: number;
  project_id: number;
  title: string;
  description: string;
  status: TaskStatus;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskWithAssignee extends Task {
  assignees: TaskAssignee[];
  steps_total: number;
  steps_done: number;
}

export interface Step {
  id: number;
  task_id: number;
  title: string;
  done: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: number;
  project_id: number | null;
  task_id: number | null;
  actor_id: number | null;
  actor_name: string | null;
  type: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface MemberStat {
  id: number;
  name: string;
  total: number;
  done: number;
}

/** Optional "who did this" info accepted by mutation-style repo functions for activity logging. */
export interface ActorInput {
  actor_id?: unknown;
  actor_name?: unknown;
}

const TASK_STATUSES: TaskStatus[] = ["todo", "doing", "review", "done"];
const PROJECT_STATUSES: ProjectStatus[] = ["active", "archived"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- Generic validators ----------

function assertValidTextField(value: unknown, maxLen: number, fieldLabel: string): string {
  if (typeof value !== "string") {
    throw new ValidationError(`${fieldLabel} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${fieldLabel} must not be empty`);
  }
  if (trimmed.length > maxLen) {
    throw new ValidationError(`${fieldLabel} must be ${maxLen} characters or fewer`);
  }
  return trimmed;
}

function assertValidName(name: unknown): string {
  return assertValidTextField(name, 50, "name");
}

function assertValidTitle(title: unknown): string {
  return assertValidTextField(title, 200, "title");
}

/** Project "name" behaves like a title (it names a project, not a person), so it shares the 200-char cap. */
function assertValidProjectName(name: unknown): string {
  return assertValidTextField(name, 200, "name");
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

/** Exported (in addition to being used internally) so it can be unit tested without a Supabase connection. */
export function assertValidStatus(status: unknown): TaskStatus {
  if (typeof status !== "string" || !TASK_STATUSES.includes(status as TaskStatus)) {
    throw new ValidationError(`status must be one of: ${TASK_STATUSES.join(", ")}`);
  }
  return status as TaskStatus;
}

function assertValidProjectStatus(status: unknown): ProjectStatus {
  if (typeof status !== "string" || !PROJECT_STATUSES.includes(status as ProjectStatus)) {
    throw new ValidationError(`status must be one of: ${PROJECT_STATUSES.join(", ")}`);
  }
  return status as ProjectStatus;
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

function assertValidPositiveInt(value: unknown, fieldLabel: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError(`${fieldLabel} must be a positive integer`);
  }
  return id;
}

function assertValidPosition(position: unknown): number {
  if (position === undefined || position === null) {
    return 0;
  }
  const num = Number(position);
  if (!Number.isInteger(num)) {
    throw new ValidationError("position must be an integer");
  }
  return num;
}

async function assertValidProjectId(projectId: unknown): Promise<number> {
  const id = assertValidPositiveInt(projectId, "project_id");
  const supabase = getSupabase();
  const { data, error } = await supabase.from("projects").select("id").eq("id", id).maybeSingle();
  if (error) throw mapPostgrestError(error, "failed to validate project_id");
  if (!data) {
    throw new ValidationError(`project_id ${id} does not reference an existing project`);
  }
  return id;
}

/**
 * Validates the *shape* of the optional `assignee_ids` array accepted by
 * create/update task inputs (array of positive integers, de-duplicated).
 * Does not touch the database — split out from assertValidAssigneeIds so it
 * can be unit tested without a Supabase connection. Returns [] when the
 * field is omitted/null (callers interpret an empty array differently: "no
 * assignees" on create, "leave unchanged" on update — see createTask/updateTask).
 */
export function parseAssigneeIdsShape(assigneeIds: unknown): number[] {
  if (assigneeIds === undefined || assigneeIds === null) {
    return [];
  }
  if (!Array.isArray(assigneeIds)) {
    throw new ValidationError("assignee_ids must be an array of positive integers");
  }
  const ids = assigneeIds.map((value) => assertValidPositiveInt(value, "assignee_ids"));
  return Array.from(new Set(ids));
}

/**
 * Validates the optional `assignee_ids` array accepted by create/update task
 * inputs, then confirms every id references an existing member.
 */
async function assertValidAssigneeIds(assigneeIds: unknown): Promise<number[]> {
  const uniqueIds = parseAssigneeIdsShape(assigneeIds);
  if (uniqueIds.length === 0) {
    return [];
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.from("members").select("id").in("id", uniqueIds);
  if (error) throw mapPostgrestError(error, "failed to validate assignee_ids");
  const foundIds = new Set(((data ?? []) as { id: number }[]).map((m) => m.id));
  const missing = uniqueIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new ValidationError(`assignee_ids ${missing.join(", ")} do not reference existing members`);
  }
  return uniqueIds;
}

async function fetchMemberNames(ids: number[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const supabase = getSupabase();
  const { data, error } = await supabase.from("members").select("id, name").in("id", ids);
  if (error) throw mapPostgrestError(error, "failed to load members");
  const nameById = new Map(((data ?? []) as { id: number; name: string }[]).map((m) => [m.id, m.name]));
  return ids.map((id) => nameById.get(id) ?? `#${id}`).sort((a, b) => a.localeCompare(b));
}

/** Exported so it can be unit tested without a Supabase connection. */
export function assertValidCommentText(text: unknown): string {
  return assertValidTextField(text, 1000, "text");
}

// ---------- Actor resolution + activity logging ----------

interface ResolvedActor {
  actor_id: number | null;
  actor_name: string | null;
}

/**
 * Validates the optional actor_id/actor_name pair supplied by callers.
 * If only actor_id is given, the member's current name is looked up so it
 * can be denormalized onto the activity row (actor_name survives member
 * deletion since activities.actor_id is ON DELETE SET NULL).
 */
async function resolveActor(actorId: unknown, actorName: unknown): Promise<ResolvedActor> {
  let id: number | null = null;
  if (actorId !== undefined && actorId !== null && actorId !== "") {
    id = assertValidPositiveInt(actorId, "actor_id");
  }

  let name: string | null = null;
  if (typeof actorName === "string" && actorName.trim().length > 0) {
    name = actorName.trim();
  }

  if (id !== null && name === null) {
    const supabase = getSupabase();
    const { data } = await supabase.from("members").select("name").eq("id", id).maybeSingle();
    if (data) {
      name = (data as { name: string }).name;
    }
  }

  return { actor_id: id, actor_name: name };
}

interface LogActivityParams {
  project_id: number | null;
  task_id?: number | null;
  type: string;
  detail?: Record<string, unknown>;
  actor_id: number | null;
  actor_name: string | null;
}

async function logActivity(params: LogActivityParams): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("activities").insert({
    project_id: params.project_id,
    task_id: params.task_id ?? null,
    actor_id: params.actor_id,
    actor_name: params.actor_name,
    type: params.type,
    detail: params.detail ?? {},
  });
  if (error) {
    // A history-logging failure shouldn't take down an otherwise-successful
    // mutation; surface it in server logs instead.
    console.error(`Failed to record activity "${params.type}":`, error);
  }
}

// ---------- Members ----------

export async function listMembers(): Promise<Member[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .order("id", { ascending: true });
  if (error) throw mapPostgrestError(error, "failed to list members");
  return (data ?? []) as Member[];
}

export async function createMember(name: unknown, actor: ActorInput = {}): Promise<Member> {
  const validName = assertValidName(name);
  const resolvedActor = await resolveActor(actor.actor_id, actor.actor_name);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("members")
    .insert({ name: validName })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new ConflictError(`member name "${validName}" already exists`);
    }
    throw mapPostgrestError(error, "failed to create member");
  }
  const member = data as Member;

  await logActivity({
    project_id: null,
    type: "member_added",
    detail: { name: member.name },
    actor_id: resolvedActor.actor_id,
    actor_name: resolvedActor.actor_name,
  });

  return member;
}

export async function deleteMember(id: number, actor: ActorInput = {}): Promise<void> {
  const supabase = getSupabase();
  const { data: existingData, error: fetchError } = await supabase
    .from("members")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw mapPostgrestError(fetchError, "failed to load member");
  if (!existingData) {
    throw new NotFoundError(`member ${id} not found`);
  }
  const existing = existingData as Member;

  const resolvedActor = await resolveActor(actor.actor_id, actor.actor_name);

  const { error } = await supabase.from("members").delete().eq("id", id);
  if (error) throw mapPostgrestError(error, "failed to delete member");

  await logActivity({
    project_id: null,
    type: "member_deleted",
    detail: { name: existing.name },
    actor_id: resolvedActor.actor_id,
    actor_name: resolvedActor.actor_name,
  });
}

// ---------- Projects ----------

export interface CreateProjectInput {
  name: unknown;
  description?: unknown;
  status?: unknown;
  due_date?: unknown;
}

export interface UpdateProjectInput {
  name?: unknown;
  description?: unknown;
  status?: unknown;
  due_date?: unknown;
}

export async function listProjects(): Promise<ProjectWithStats[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("id", { ascending: true });
  if (error) throw mapPostgrestError(error, "failed to list projects");
  const projects = (data ?? []) as Project[];
  if (projects.length === 0) return [];

  const { data: taskRows, error: taskError } = await supabase
    .from("tasks")
    .select("project_id, status")
    .in(
      "project_id",
      projects.map((p) => p.id)
    );
  if (taskError) throw mapPostgrestError(taskError, "failed to load task stats");

  const counts = new Map<number, { total: number; done: number }>();
  for (const row of (taskRows ?? []) as { project_id: number; status: TaskStatus }[]) {
    const entry = counts.get(row.project_id) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (row.status === "done") entry.done += 1;
    counts.set(row.project_id, entry);
  }

  return projects.map((p) => ({
    ...p,
    tasks_total: counts.get(p.id)?.total ?? 0,
    tasks_done: counts.get(p.id)?.done ?? 0,
  }));
}

export async function getProjectById(id: number): Promise<Project | undefined> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (error) throw mapPostgrestError(error, "failed to load project");
  return (data as Project | null) ?? undefined;
}

export async function createProject(
  input: CreateProjectInput,
  actor: ActorInput = {}
): Promise<Project> {
  const name = assertValidProjectName(input.name);
  const description = normalizeDescription(input.description);
  const status = input.status === undefined ? "active" : assertValidProjectStatus(input.status);
  const dueDate = assertValidDueDate(input.due_date);
  const resolvedActor = await resolveActor(actor.actor_id, actor.actor_name);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("projects")
    .insert({ name, description, status, due_date: dueDate })
    .select("*")
    .single();
  if (error) throw mapPostgrestError(error, "failed to create project");
  const project = data as Project;

  await logActivity({
    project_id: project.id,
    type: "project_created",
    detail: { name: project.name },
    actor_id: resolvedActor.actor_id,
    actor_name: resolvedActor.actor_name,
  });

  return project;
}

export async function updateProject(
  id: number,
  input: UpdateProjectInput,
  actor: ActorInput = {}
): Promise<Project> {
  const supabase = getSupabase();
  const { data: existingData, error: fetchError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw mapPostgrestError(fetchError, "failed to load project");
  if (!existingData) {
    throw new NotFoundError(`project ${id} not found`);
  }
  const existing = existingData as Project;

  const name = input.name === undefined ? existing.name : assertValidProjectName(input.name);
  const description =
    input.description === undefined
      ? existing.description
      : normalizeDescription(input.description);
  const status =
    input.status === undefined ? existing.status : assertValidProjectStatus(input.status);
  const dueDate =
    input.due_date === undefined ? existing.due_date : assertValidDueDate(input.due_date);
  const resolvedActor = await resolveActor(actor.actor_id, actor.actor_name);

  const { data, error } = await supabase
    .from("projects")
    .update({ name, description, status, due_date: dueDate })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw mapPostgrestError(error, "failed to update project");
  const updated = data as Project;

  const changedFields: Record<string, { before: unknown; after: unknown }> = {};
  if (name !== existing.name) changedFields.name = { before: existing.name, after: name };
  if (description !== existing.description)
    changedFields.description = { before: existing.description, after: description };
  if (status !== existing.status)
    changedFields.status = { before: existing.status, after: status };
  if (dueDate !== existing.due_date)
    changedFields.due_date = { before: existing.due_date, after: dueDate };

  if (Object.keys(changedFields).length > 0) {
    await logActivity({
      project_id: updated.id,
      type: "project_updated",
      detail: changedFields,
      actor_id: resolvedActor.actor_id,
      actor_name: resolvedActor.actor_name,
    });
  }

  return updated;
}

export async function deleteProject(id: number, actor: ActorInput = {}): Promise<void> {
  const supabase = getSupabase();
  const { data: existingData, error: fetchError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw mapPostgrestError(fetchError, "failed to load project");
  if (!existingData) {
    throw new NotFoundError(`project ${id} not found`);
  }
  const existing = existingData as Project;
  const resolvedActor = await resolveActor(actor.actor_id, actor.actor_name);

  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw mapPostgrestError(error, "failed to delete project");

  // project_id is deliberately left null: activities.project_id is
  // ON DELETE CASCADE, so a row referencing the just-deleted project would
  // never be visible (and would race with the cascade in fact).
  await logActivity({
    project_id: null,
    type: "project_deleted",
    detail: { name: existing.name },
    actor_id: resolvedActor.actor_id,
    actor_name: resolvedActor.actor_name,
  });
}

export async function listActivities(projectId: number, limit = 50): Promise<Activity[]> {
  const supabase = getSupabase();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) throw mapPostgrestError(projectError, "failed to load project");
  if (!project) {
    throw new NotFoundError(`project ${projectId} not found`);
  }

  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw mapPostgrestError(error, "failed to list activities");
  return (data ?? []) as Activity[];
}

// ---------- Tasks ----------

export interface TaskFilter {
  projectId?: number;
  assigneeId?: number;
  status?: TaskStatus;
}

export interface CreateTaskInput {
  project_id: unknown;
  title: unknown;
  description?: unknown;
  assignee_ids?: unknown;
  status?: unknown;
  due_date?: unknown;
}

export interface UpdateTaskInput {
  title?: unknown;
  description?: unknown;
  assignee_ids?: unknown;
  status?: unknown;
  due_date?: unknown;
}

async function attachTaskAggregates(tasks: Task[]): Promise<TaskWithAssignee[]> {
  if (tasks.length === 0) return [];
  const supabase = getSupabase();
  const taskIds = tasks.map((t) => t.id);

  const [assigneeRowsRes, stepsRes] = await Promise.all([
    supabase.from("task_assignees").select("task_id, member_id").in("task_id", taskIds),
    supabase.from("steps").select("task_id, done").in("task_id", taskIds),
  ]);

  if (assigneeRowsRes.error)
    throw mapPostgrestError(assigneeRowsRes.error, "failed to load task assignees");
  if (stepsRes.error) throw mapPostgrestError(stepsRes.error, "failed to load steps");

  const assigneeRows = (assigneeRowsRes.data ?? []) as { task_id: number; member_id: number }[];
  const memberIds = Array.from(new Set(assigneeRows.map((r) => r.member_id)));
  const membersRes =
    memberIds.length > 0
      ? await supabase.from("members").select("id, name").in("id", memberIds)
      : { data: [] as { id: number; name: string }[], error: null };
  if (membersRes.error) throw mapPostgrestError(membersRes.error, "failed to load assignees");

  const memberNameById = new Map<number, string>();
  for (const m of (membersRes.data ?? []) as { id: number; name: string }[]) {
    memberNameById.set(m.id, m.name);
  }

  const assigneesByTaskId = new Map<number, TaskAssignee[]>();
  for (const row of assigneeRows) {
    const list = assigneesByTaskId.get(row.task_id) ?? [];
    list.push({ id: row.member_id, name: memberNameById.get(row.member_id) ?? "" });
    assigneesByTaskId.set(row.task_id, list);
  }
  for (const list of assigneesByTaskId.values()) {
    list.sort((a, b) => a.id - b.id);
  }

  const stepCounts = new Map<number, { total: number; done: number }>();
  for (const s of (stepsRes.data ?? []) as { task_id: number; done: boolean }[]) {
    const entry = stepCounts.get(s.task_id) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (s.done) entry.done += 1;
    stepCounts.set(s.task_id, entry);
  }

  return tasks.map((t) => ({
    ...t,
    assignees: assigneesByTaskId.get(t.id) ?? [],
    steps_total: stepCounts.get(t.id)?.total ?? 0,
    steps_done: stepCounts.get(t.id)?.done ?? 0,
  }));
}

export async function listTasks(filter: TaskFilter = {}): Promise<TaskWithAssignee[]> {
  const supabase = getSupabase();

  // The assigneeId filter is backed by the task_assignees join table now, so
  // resolve it to a set of matching task ids up front.
  let assigneeTaskIds: number[] | undefined;
  if (filter.assigneeId !== undefined) {
    const { data, error } = await supabase
      .from("task_assignees")
      .select("task_id")
      .eq("member_id", filter.assigneeId);
    if (error) throw mapPostgrestError(error, "failed to filter tasks by assignee");
    assigneeTaskIds = ((data ?? []) as { task_id: number }[]).map((r) => r.task_id);
    if (assigneeTaskIds.length === 0) return [];
  }

  let query = supabase.from("tasks").select("*").order("id", { ascending: true });

  if (filter.projectId !== undefined) {
    query = query.eq("project_id", filter.projectId);
  }
  if (filter.status !== undefined) {
    query = query.eq("status", filter.status);
  }
  if (assigneeTaskIds !== undefined) {
    query = query.in("id", assigneeTaskIds);
  }

  const { data, error } = await query;
  if (error) throw mapPostgrestError(error, "failed to list tasks");
  return attachTaskAggregates((data ?? []) as Task[]);
}

export async function getTaskById(id: number): Promise<TaskWithAssignee | undefined> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  if (error) throw mapPostgrestError(error, "failed to load task");
  if (!data) return undefined;
  const [withAggregates] = await attachTaskAggregates([data as Task]);
  return withAggregates;
}

export async function createTask(
  input: CreateTaskInput,
  actor: ActorInput = {}
): Promise<TaskWithAssignee> {
  const projectId = await assertValidProjectId(input.project_id);
  const title = assertValidTitle(input.title);
  const description = normalizeDescription(input.description);
  const assigneeIds = await assertValidAssigneeIds(input.assignee_ids);
  const status = input.status === undefined ? "todo" : assertValidStatus(input.status);
  const dueDate = assertValidDueDate(input.due_date);
  const resolvedActor = await resolveActor(actor.actor_id, actor.actor_name);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: projectId,
      title,
      description,
      status,
      due_date: dueDate,
    })
    .select("*")
    .single();
  if (error) throw mapPostgrestError(error, "failed to create task");
  const task = data as Task;

  if (assigneeIds.length > 0) {
    const { error: assignError } = await supabase
      .from("task_assignees")
      .insert(assigneeIds.map((member_id) => ({ task_id: task.id, member_id })));
    if (assignError) throw mapPostgrestError(assignError, "failed to assign members to task");
  }

  await logActivity({
    project_id: task.project_id,
    task_id: task.id,
    type: "task_created",
    detail: { title: task.title, status: task.status },
    actor_id: resolvedActor.actor_id,
    actor_name: resolvedActor.actor_name,
  });

  return (await getTaskById(task.id)) as TaskWithAssignee;
}

export async function updateTask(
  id: number,
  input: UpdateTaskInput,
  actor: ActorInput = {}
): Promise<TaskWithAssignee> {
  const supabase = getSupabase();
  const { data: existingData, error: fetchError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw mapPostgrestError(fetchError, "failed to load task");
  if (!existingData) {
    throw new NotFoundError(`task ${id} not found`);
  }
  const existing = existingData as Task;

  const { data: existingAssigneeRows, error: existingAssigneeError } = await supabase
    .from("task_assignees")
    .select("member_id")
    .eq("task_id", id);
  if (existingAssigneeError)
    throw mapPostgrestError(existingAssigneeError, "failed to load task assignees");
  const existingAssigneeIds = ((existingAssigneeRows ?? []) as { member_id: number }[]).map(
    (r) => r.member_id
  );

  const title = input.title === undefined ? existing.title : assertValidTitle(input.title);
  const description =
    input.description === undefined
      ? existing.description
      : normalizeDescription(input.description);
  const assigneeIdsProvided = input.assignee_ids !== undefined;
  const newAssigneeIds = assigneeIdsProvided
    ? await assertValidAssigneeIds(input.assignee_ids)
    : existingAssigneeIds;
  const status = input.status === undefined ? existing.status : assertValidStatus(input.status);
  const dueDate =
    input.due_date === undefined ? existing.due_date : assertValidDueDate(input.due_date);
  const resolvedActor = await resolveActor(actor.actor_id, actor.actor_name);

  const { data, error } = await supabase
    .from("tasks")
    .update({
      title,
      description,
      status,
      due_date: dueDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw mapPostgrestError(error, "failed to update task");
  const updated = data as Task;

  if (assigneeIdsProvided) {
    const { error: deleteError } = await supabase
      .from("task_assignees")
      .delete()
      .eq("task_id", id);
    if (deleteError) throw mapPostgrestError(deleteError, "failed to update task assignees");
    if (newAssigneeIds.length > 0) {
      const { error: insertError } = await supabase
        .from("task_assignees")
        .insert(newAssigneeIds.map((member_id) => ({ task_id: id, member_id })));
      if (insertError) throw mapPostgrestError(insertError, "failed to update task assignees");
    }
  }

  const changedFields: Record<string, { before: unknown; after: unknown }> = {};
  if (title !== existing.title) changedFields.title = { before: existing.title, after: title };
  if (description !== existing.description)
    changedFields.description = { before: existing.description, after: description };
  if (dueDate !== existing.due_date)
    changedFields.due_date = { before: existing.due_date, after: dueDate };
  const statusChanged = status !== existing.status;
  if (statusChanged) changedFields.status = { before: existing.status, after: status };

  const beforeIdSet = new Set(existingAssigneeIds);
  const afterIdSet = new Set(newAssigneeIds);
  const assigneesChanged =
    assigneeIdsProvided &&
    (beforeIdSet.size !== afterIdSet.size ||
      [...beforeIdSet].some((memberId) => !afterIdSet.has(memberId)));
  if (assigneesChanged) {
    const [beforeNames, afterNames] = await Promise.all([
      fetchMemberNames(existingAssigneeIds),
      fetchMemberNames(newAssigneeIds),
    ]);
    changedFields.assignees = { before: beforeNames, after: afterNames };
  }

  if (Object.keys(changedFields).length > 0) {
    await logActivity({
      project_id: updated.project_id,
      task_id: updated.id,
      type: "task_updated",
      detail: changedFields,
      actor_id: resolvedActor.actor_id,
      actor_name: resolvedActor.actor_name,
    });
  }
  if (statusChanged) {
    await logActivity({
      project_id: updated.project_id,
      task_id: updated.id,
      type: "task_status_changed",
      detail: { before: existing.status, after: status },
      actor_id: resolvedActor.actor_id,
      actor_name: resolvedActor.actor_name,
    });
  }

  return (await getTaskById(id)) as TaskWithAssignee;
}

export async function deleteTask(id: number, actor: ActorInput = {}): Promise<void> {
  const supabase = getSupabase();
  const { data: existingData, error: fetchError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw mapPostgrestError(fetchError, "failed to load task");
  if (!existingData) {
    throw new NotFoundError(`task ${id} not found`);
  }
  const existing = existingData as Task;
  const resolvedActor = await resolveActor(actor.actor_id, actor.actor_name);

  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw mapPostgrestError(error, "failed to delete task");

  // task_id is left null: activities.task_id is ON DELETE CASCADE, so a row
  // pointing at the just-deleted task would either fail the FK check or be
  // wiped out immediately by the cascade.
  await logActivity({
    project_id: existing.project_id,
    task_id: null,
    type: "task_deleted",
    detail: { title: existing.title },
    actor_id: resolvedActor.actor_id,
    actor_name: resolvedActor.actor_name,
  });
}

export async function listTaskActivities(taskId: number, limit = 100): Promise<Activity[]> {
  const supabase = getSupabase();
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id")
    .eq("id", taskId)
    .maybeSingle();
  if (taskError) throw mapPostgrestError(taskError, "failed to load task");
  if (!task) {
    throw new NotFoundError(`task ${taskId} not found`);
  }

  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw mapPostgrestError(error, "failed to list activities");
  return (data ?? []) as Activity[];
}

// ---------- Comments ----------

export interface CreateCommentInput {
  text: unknown;
}

/** Comments/progress notes are stored as activities with type "comment" (no dedicated table). */
export async function createComment(
  taskId: number,
  input: CreateCommentInput,
  actor: ActorInput = {}
): Promise<Activity> {
  const projectId = await getTaskProjectId(taskId);
  const text = assertValidCommentText(input.text);
  const resolvedActor = await resolveActor(actor.actor_id, actor.actor_name);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("activities")
    .insert({
      project_id: projectId,
      task_id: taskId,
      actor_id: resolvedActor.actor_id,
      actor_name: resolvedActor.actor_name,
      type: "comment",
      detail: { text },
    })
    .select("*")
    .single();
  if (error) throw mapPostgrestError(error, "failed to create comment");
  return data as Activity;
}

/** Only type="comment" activity rows may be deleted through this path; any other type is a 400. */
export async function deleteActivity(id: number): Promise<void> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("activities").select("*").eq("id", id).maybeSingle();
  if (error) throw mapPostgrestError(error, "failed to load activity");
  if (!data) {
    throw new NotFoundError(`activity ${id} not found`);
  }
  const activity = data as Activity;
  if (activity.type !== "comment") {
    throw new ValidationError("only comment activities can be deleted");
  }

  const { error: deleteError } = await supabase.from("activities").delete().eq("id", id);
  if (deleteError) throw mapPostgrestError(deleteError, "failed to delete activity");
}

// ---------- Steps ----------

export interface CreateStepInput {
  title: unknown;
  position?: unknown;
}

export interface UpdateStepInput {
  title?: unknown;
  done?: unknown;
  position?: unknown;
}

async function getTaskProjectId(taskId: number): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .select("id, project_id")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw mapPostgrestError(error, "failed to load task");
  if (!data) {
    throw new NotFoundError(`task ${taskId} not found`);
  }
  return (data as { project_id: number }).project_id;
}

export async function listSteps(taskId: number): Promise<Step[]> {
  await getTaskProjectId(taskId); // 404s if the task doesn't exist
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("steps")
    .select("*")
    .eq("task_id", taskId)
    .order("position", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw mapPostgrestError(error, "failed to list steps");
  return (data ?? []) as Step[];
}

export async function createStep(
  taskId: number,
  input: CreateStepInput,
  actor: ActorInput = {}
): Promise<Step> {
  const projectId = await getTaskProjectId(taskId);
  const title = assertValidTitle(input.title);
  const position = assertValidPosition(input.position);
  const resolvedActor = await resolveActor(actor.actor_id, actor.actor_name);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("steps")
    .insert({ task_id: taskId, title, position })
    .select("*")
    .single();
  if (error) throw mapPostgrestError(error, "failed to create step");
  const step = data as Step;

  await logActivity({
    project_id: projectId,
    task_id: taskId,
    type: "step_added",
    detail: { title: step.title },
    actor_id: resolvedActor.actor_id,
    actor_name: resolvedActor.actor_name,
  });

  return step;
}

export async function updateStep(
  id: number,
  input: UpdateStepInput,
  actor: ActorInput = {}
): Promise<Step> {
  const supabase = getSupabase();
  const { data: existingData, error: fetchError } = await supabase
    .from("steps")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw mapPostgrestError(fetchError, "failed to load step");
  if (!existingData) {
    throw new NotFoundError(`step ${id} not found`);
  }
  const existing = existingData as Step;

  const title = input.title === undefined ? existing.title : assertValidTitle(input.title);
  const position =
    input.position === undefined ? existing.position : assertValidPosition(input.position);
  let done = existing.done;
  if (input.done !== undefined) {
    if (typeof input.done !== "boolean") {
      throw new ValidationError("done must be a boolean");
    }
    done = input.done;
  }
  const resolvedActor = await resolveActor(actor.actor_id, actor.actor_name);

  const { data, error } = await supabase
    .from("steps")
    .update({ title, position, done, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw mapPostgrestError(error, "failed to update step");
  const updated = data as Step;

  const projectId = await getTaskProjectId(existing.task_id);
  if (done !== existing.done) {
    await logActivity({
      project_id: projectId,
      task_id: existing.task_id,
      type: done ? "step_done" : "step_undone",
      detail: { title: updated.title },
      actor_id: resolvedActor.actor_id,
      actor_name: resolvedActor.actor_name,
    });
  }

  return updated;
}

export async function deleteStep(id: number, actor: ActorInput = {}): Promise<void> {
  const supabase = getSupabase();
  const { data: existingData, error: fetchError } = await supabase
    .from("steps")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw mapPostgrestError(fetchError, "failed to load step");
  if (!existingData) {
    throw new NotFoundError(`step ${id} not found`);
  }
  const existing = existingData as Step;
  const resolvedActor = await resolveActor(actor.actor_id, actor.actor_name);

  const { error } = await supabase.from("steps").delete().eq("id", id);
  if (error) throw mapPostgrestError(error, "failed to delete step");

  const projectId = await getTaskProjectId(existing.task_id);
  await logActivity({
    project_id: projectId,
    task_id: existing.task_id,
    type: "step_deleted",
    detail: { title: existing.title },
    actor_id: resolvedActor.actor_id,
    actor_name: resolvedActor.actor_name,
  });
}

// ---------- Stats ----------

/**
 * Per-member task totals/done counts. When projectId is omitted, aggregates
 * across every task in every project (preserves the pre-v2 /api/stats shape
 * used by the existing dashboard UI).
 */
export async function projectStats(projectId?: number): Promise<MemberStat[]> {
  const supabase = getSupabase();

  if (projectId !== undefined) {
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    if (projectError) throw mapPostgrestError(projectError, "failed to load project");
    if (!project) {
      throw new NotFoundError(`project ${projectId} not found`);
    }
  }

  let taskQuery = supabase.from("tasks").select("id, status");
  if (projectId !== undefined) {
    taskQuery = taskQuery.eq("project_id", projectId);
  }
  const { data: taskRows, error: taskError } = await taskQuery;
  if (taskError) throw mapPostgrestError(taskError, "failed to load tasks for stats");

  const tasks = (taskRows ?? []) as { id: number; status: TaskStatus }[];
  const statusById = new Map(tasks.map((t) => [t.id, t.status]));

  // A task counts toward *every* member assigned to it (a task with two
  // assignees counts once in each of their totals).
  let assigneeRows: { task_id: number; member_id: number }[] = [];
  if (tasks.length > 0) {
    const { data, error } = await supabase
      .from("task_assignees")
      .select("task_id, member_id")
      .in(
        "task_id",
        tasks.map((t) => t.id)
      );
    if (error) throw mapPostgrestError(error, "failed to load task assignees for stats");
    assigneeRows = (data ?? []) as { task_id: number; member_id: number }[];
  }

  const { data: memberRows, error: memberError } = await supabase
    .from("members")
    .select("id, name")
    .order("id", { ascending: true });
  if (memberError) throw mapPostgrestError(memberError, "failed to load members for stats");

  const counts = new Map<number, { total: number; done: number }>();
  for (const row of assigneeRows) {
    const status = statusById.get(row.task_id);
    if (status === undefined) continue;
    const entry = counts.get(row.member_id) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (status === "done") entry.done += 1;
    counts.set(row.member_id, entry);
  }

  return ((memberRows ?? []) as { id: number; name: string }[]).map((m) => ({
    id: m.id,
    name: m.name,
    total: counts.get(m.id)?.total ?? 0,
    done: counts.get(m.id)?.done ?? 0,
  }));
}
