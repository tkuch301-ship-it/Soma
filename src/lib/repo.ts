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

/**
 * Inserts one or more activity rows in a single round trip. Used instead of
 * N calls to logActivity() when a single mutation produces multiple history
 * entries (e.g. updateTask can emit both "task_updated" and
 * "task_status_changed" for one PATCH request).
 */
async function logActivities(paramsList: LogActivityParams[]): Promise<void> {
  if (paramsList.length === 0) return;
  const supabase = getSupabase();
  const { error } = await supabase.from("activities").insert(
    paramsList.map((params) => ({
      project_id: params.project_id,
      task_id: params.task_id ?? null,
      actor_id: params.actor_id,
      actor_name: params.actor_name,
      type: params.type,
      detail: params.detail ?? {},
    }))
  );
  if (error) {
    // A history-logging failure shouldn't take down an otherwise-successful
    // mutation; surface it in server logs instead.
    console.error(
      `Failed to record activit${paramsList.length === 1 ? "y" : "ies"} (${paramsList
        .map((p) => p.type)
        .join(", ")}):`,
      error
    );
  }
}

async function logActivity(params: LogActivityParams): Promise<void> {
  await logActivities([params]);
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
  const resolvedActor = await resolveActor(actor.actor_id, actor.actor_name);

  // delete().select() returns the deleted row (or none) in the same round
  // trip, so a separate existence pre-check is unnecessary.
  const { data, error } = await supabase
    .from("members")
    .delete()
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw mapPostgrestError(error, "failed to delete member");
  if (!data) {
    throw new NotFoundError(`member ${id} not found`);
  }
  const existing = data as Member;

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

interface ProjectWithTasksRow extends Project {
  tasks: { status: TaskStatus }[] | null;
}

export async function listProjects(): Promise<ProjectWithStats[]> {
  const supabase = getSupabase();
  // Resource embedding (select=*,tasks(status)) pulls each project's task
  // statuses in the same round trip instead of a second query afterward.
  const { data, error } = await supabase
    .from("projects")
    .select("*, tasks(status)")
    .order("id", { ascending: true });
  if (error) throw mapPostgrestError(error, "failed to list projects");

  return ((data ?? []) as ProjectWithTasksRow[]).map((row) => {
    const { tasks, ...project } = row;
    const list = tasks ?? [];
    return {
      ...(project as Project),
      tasks_total: list.length,
      tasks_done: list.filter((t) => t.status === "done").length,
    };
  });
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
  // This fetch isn't just an existence check: PATCH is partial, so we need
  // the current values to fill in any omitted fields and to diff for the
  // activity log. It can't be folded into the update() call below.
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
  const resolvedActor = await resolveActor(actor.actor_id, actor.actor_name);

  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw mapPostgrestError(error, "failed to delete project");
  if (!data) {
    throw new NotFoundError(`project ${id} not found`);
  }
  const existing = data as Project;

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
  // Embed activities under their parent project so the existence check and
  // the activity list come back in a single round trip.
  const { data, error } = await supabase
    .from("projects")
    .select("id, activities(*)")
    .eq("id", projectId)
    .order("created_at", { ascending: false, referencedTable: "activities" })
    .limit(limit, { referencedTable: "activities" })
    .maybeSingle();
  if (error) throw mapPostgrestError(error, "failed to load project");
  if (!data) {
    throw new NotFoundError(`project ${projectId} not found`);
  }
  return ((data as { activities: Activity[] | null }).activities ?? []) as Activity[];
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

/** Shared "select" fragment used to fetch a task with its assignees + step aggregates embedded in one round trip. */
const TASK_WITH_AGGREGATES_SELECT =
  "*, task_assignees(member:members(id,name)), steps(done)";

interface TaskAggregateEmbeds {
  task_assignees?: { member: TaskAssignee | null }[] | null;
  steps?: { done: boolean }[] | null;
}

function extractAssignees(embeds: TaskAggregateEmbeds): TaskAssignee[] {
  return ((embeds.task_assignees ?? []) as { member: TaskAssignee | null }[])
    .map((row) => row.member)
    .filter((m): m is TaskAssignee => m !== null)
    .sort((a, b) => a.id - b.id);
}

function extractStepCounts(embeds: TaskAggregateEmbeds): { steps_total: number; steps_done: number } {
  const steps = (embeds.steps ?? []) as { done: boolean }[];
  return {
    steps_total: steps.length,
    steps_done: steps.filter((s) => s.done).length,
  };
}

/** Maps a `tasks` row fetched with TASK_WITH_AGGREGATES_SELECT into the public TaskWithAssignee shape. */
function mapTaskRowWithEmbeds(row: Task & TaskAggregateEmbeds): TaskWithAssignee {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to omit these keys from `task`
  const { task_assignees: _taskAssignees, steps: _steps, ...task } = row;
  return {
    ...(task as Task),
    assignees: extractAssignees(row),
    ...extractStepCounts(row),
  };
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

  // Resource embedding pulls assignees + step done-counts in the same
  // request as the task rows themselves (was a separate 2-3 query fan-out).
  let query = supabase
    .from("tasks")
    .select(TASK_WITH_AGGREGATES_SELECT)
    .order("id", { ascending: true });

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
  return ((data ?? []) as (Task & TaskAggregateEmbeds)[]).map(mapTaskRowWithEmbeds);
}

export async function getTaskById(id: number): Promise<TaskWithAssignee | undefined> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_WITH_AGGREGATES_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw mapPostgrestError(error, "failed to load task");
  if (!data) return undefined;
  return mapTaskRowWithEmbeds(data as Task & TaskAggregateEmbeds);
}

export async function createTask(
  input: CreateTaskInput,
  actor: ActorInput = {}
): Promise<TaskWithAssignee> {
  // project_id existence is validated via the insert's FK error below rather
  // than with a dedicated pre-check query (tasks has exactly one FK column,
  // so any 23503 here can only mean an unknown project_id).
  const projectId = assertValidPositiveInt(input.project_id, "project_id");
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
  if (error) {
    if (error.code === "23503") {
      throw new ValidationError(`project_id ${projectId} does not reference an existing project`);
    }
    throw mapPostgrestError(error, "failed to create task");
  }
  const task = data as Task;

  let assignees: TaskAssignee[] = [];
  if (assigneeIds.length > 0) {
    // Embedding members(id,name) on the insert's select returns the
    // assignee names in the same round trip, avoiding a follow-up lookup.
    const { data: assigneeData, error: assignError } = await supabase
      .from("task_assignees")
      .insert(assigneeIds.map((member_id) => ({ task_id: task.id, member_id })))
      .select("member:members(id,name)");
    if (assignError) throw mapPostgrestError(assignError, "failed to assign members to task");
    assignees = ((assigneeData ?? []) as unknown as { member: TaskAssignee }[])
      .map((r) => r.member)
      .sort((a, b) => a.id - b.id);
  }

  await logActivity({
    project_id: task.project_id,
    task_id: task.id,
    type: "task_created",
    detail: { title: task.title, status: task.status },
    actor_id: resolvedActor.actor_id,
    actor_name: resolvedActor.actor_name,
  });

  // A brand new task never has steps yet, so steps_total/steps_done are
  // always 0 — no need to re-fetch the task to build the response.
  return {
    ...task,
    assignees,
    steps_total: 0,
    steps_done: 0,
  };
}

export async function updateTask(
  id: number,
  input: UpdateTaskInput,
  actor: ActorInput = {}
): Promise<TaskWithAssignee> {
  const supabase = getSupabase();

  // Single round trip: fetch the task plus its current assignees (with
  // names) and step done-counts. Steps aren't touched by this function, so
  // this "before" snapshot doubles as the step aggregates for the response.
  const { data: existingData, error: fetchError } = await supabase
    .from("tasks")
    .select(TASK_WITH_AGGREGATES_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw mapPostgrestError(fetchError, "failed to load task");
  if (!existingData) {
    throw new NotFoundError(`task ${id} not found`);
  }
  const existingRow = existingData as Task & TaskAggregateEmbeds;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to omit these keys from `existingFields`
  const { task_assignees: _existingTaskAssignees, steps: _existingSteps, ...existingFields } =
    existingRow;
  const existing = existingFields as Task;
  const existingAssignees = extractAssignees(existingRow);
  const existingAssigneeIds = existingAssignees.map((a) => a.id);
  const stepCounts = extractStepCounts(existingRow);

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

  let finalAssignees = existingAssignees;
  if (assigneeIdsProvided) {
    const { error: deleteError } = await supabase
      .from("task_assignees")
      .delete()
      .eq("task_id", id);
    if (deleteError) throw mapPostgrestError(deleteError, "failed to update task assignees");
    if (newAssigneeIds.length > 0) {
      const { data: insertedData, error: insertError } = await supabase
        .from("task_assignees")
        .insert(newAssigneeIds.map((member_id) => ({ task_id: id, member_id })))
        .select("member:members(id,name)");
      if (insertError) throw mapPostgrestError(insertError, "failed to update task assignees");
      finalAssignees = ((insertedData ?? []) as unknown as { member: TaskAssignee }[])
        .map((r) => r.member)
        .sort((a, b) => a.id - b.id);
    } else {
      finalAssignees = [];
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
    // Names are already in hand from the embedded before/after assignee
    // fetches above, so no extra member lookups are needed here.
    const beforeNames = existingAssignees.map((a) => a.name).sort((a, b) => a.localeCompare(b));
    const afterNames = finalAssignees.map((a) => a.name).sort((a, b) => a.localeCompare(b));
    changedFields.assignees = { before: beforeNames, after: afterNames };
  }

  // Both possible activity rows (if applicable) are inserted together in a
  // single bulk insert instead of two separate round trips.
  const activityRows: LogActivityParams[] = [];
  if (Object.keys(changedFields).length > 0) {
    activityRows.push({
      project_id: updated.project_id,
      task_id: updated.id,
      type: "task_updated",
      detail: changedFields,
      actor_id: resolvedActor.actor_id,
      actor_name: resolvedActor.actor_name,
    });
  }
  if (statusChanged) {
    activityRows.push({
      project_id: updated.project_id,
      task_id: updated.id,
      type: "task_status_changed",
      detail: { before: existing.status, after: status },
      actor_id: resolvedActor.actor_id,
      actor_name: resolvedActor.actor_name,
    });
  }
  await logActivities(activityRows);

  return {
    ...updated,
    assignees: finalAssignees,
    ...stepCounts,
  };
}

export async function deleteTask(id: number, actor: ActorInput = {}): Promise<void> {
  const supabase = getSupabase();
  const resolvedActor = await resolveActor(actor.actor_id, actor.actor_name);

  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw mapPostgrestError(error, "failed to delete task");
  if (!data) {
    throw new NotFoundError(`task ${id} not found`);
  }
  const existing = data as Task;

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
  // Embed activities under their parent task so the existence check and the
  // activity list come back in a single round trip.
  const { data, error } = await supabase
    .from("tasks")
    .select("id, activities(*)")
    .eq("id", taskId)
    .order("created_at", { ascending: false, referencedTable: "activities" })
    .limit(limit, { referencedTable: "activities" })
    .maybeSingle();
  if (error) throw mapPostgrestError(error, "failed to load task");
  if (!data) {
    throw new NotFoundError(`task ${taskId} not found`);
  }
  return ((data as { activities: Activity[] | null }).activities ?? []) as Activity[];
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
  // This lookup both 404s on an unknown task and supplies the project_id
  // value the activities row itself needs, so it can't be dropped in favor
  // of an FK-error translation the way pure existence checks can.
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

export async function deleteActivity(id: number): Promise<void> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("activities")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw mapPostgrestError(error, "failed to delete activity");
  if (!data) {
    throw new NotFoundError(`activity ${id} not found`);
  }
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
  const supabase = getSupabase();
  // Embedding steps under their parent task folds the "does the task exist"
  // check and the steps list into a single round trip.
  const { data, error } = await supabase
    .from("tasks")
    .select("id, steps(*)")
    .eq("id", taskId)
    .order("position", { referencedTable: "steps", ascending: true })
    .order("id", { referencedTable: "steps", ascending: true })
    .maybeSingle();
  if (error) throw mapPostgrestError(error, "failed to list steps");
  if (!data) {
    throw new NotFoundError(`task ${taskId} not found`);
  }
  return ((data as { steps: Step[] | null }).steps ?? []) as Step[];
}

interface StepWithTaskEmbed extends Step {
  tasks: { project_id: number } | null;
}

export async function createStep(
  taskId: number,
  input: CreateStepInput,
  actor: ActorInput = {}
): Promise<Step> {
  const title = assertValidTitle(input.title);
  const position = assertValidPosition(input.position);
  const resolvedActor = await resolveActor(actor.actor_id, actor.actor_name);

  const supabase = getSupabase();
  // steps has exactly one FK column (task_id), so a 23503 here can only mean
  // the task doesn't exist — no separate existence pre-check is needed.
  // Embedding tasks(project_id) on the select also supplies the project_id
  // the activity log needs, in the same round trip as the insert.
  const { data, error } = await supabase
    .from("steps")
    .insert({ task_id: taskId, title, position })
    .select("*, tasks(project_id)")
    .single();
  if (error) {
    if (error.code === "23503") {
      throw new NotFoundError(`task ${taskId} not found`);
    }
    throw mapPostgrestError(error, "failed to create step");
  }
  const { tasks, ...stepFields } = data as StepWithTaskEmbed;
  const step = stepFields as Step;
  const projectId = (tasks as { project_id: number }).project_id;

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
  // Embedding tasks(project_id) here supplies the project_id the activity
  // log needs later, avoiding a separate getTaskProjectId() round trip.
  const { data: existingData, error: fetchError } = await supabase
    .from("steps")
    .select("*, tasks(project_id)")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw mapPostgrestError(fetchError, "failed to load step");
  if (!existingData) {
    throw new NotFoundError(`step ${id} not found`);
  }
  const { tasks, ...existingFields } = existingData as StepWithTaskEmbed;
  const existing = existingFields as Step;
  const projectId = (tasks as { project_id: number }).project_id;

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
  const resolvedActor = await resolveActor(actor.actor_id, actor.actor_name);

  // delete().select() returns the deleted row (with its parent task's
  // project_id embedded) in one round trip, replacing both the previous
  // existence pre-check and the separate getTaskProjectId() lookup.
  const { data, error } = await supabase
    .from("steps")
    .delete()
    .eq("id", id)
    .select("*, tasks(project_id)")
    .maybeSingle();
  if (error) throw mapPostgrestError(error, "failed to delete step");
  if (!data) {
    throw new NotFoundError(`step ${id} not found`);
  }
  const { tasks, ...existingFields } = data as StepWithTaskEmbed;
  const existing = existingFields as Step;
  const projectId = (tasks as { project_id: number }).project_id;

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

interface TaskStatRow {
  status: TaskStatus;
  task_assignees: { member_id: number }[] | null;
}

/** Resolves the task rows (with their assignee ids) that projectStats() aggregates over. */
async function fetchStatsTasks(projectId: number | undefined): Promise<TaskStatRow[]> {
  const supabase = getSupabase();

  if (projectId !== undefined) {
    // Rooting the query at "projects" folds the project-existence check and
    // the task/assignee data into a single round trip.
    const { data, error } = await supabase
      .from("projects")
      .select("id, tasks(status, task_assignees(member_id))")
      .eq("id", projectId)
      .maybeSingle();
    if (error) throw mapPostgrestError(error, "failed to load project");
    if (!data) {
      throw new NotFoundError(`project ${projectId} not found`);
    }
    return ((data as { tasks: TaskStatRow[] | null }).tasks ?? []) as TaskStatRow[];
  }

  const { data, error } = await supabase.from("tasks").select("status, task_assignees(member_id)");
  if (error) throw mapPostgrestError(error, "failed to load tasks for stats");
  return (data ?? []) as TaskStatRow[];
}

/**
 * Per-member task totals/done counts. When projectId is omitted, aggregates
 * across every task in every project (preserves the pre-v2 /api/stats shape
 * used by the existing dashboard UI).
 */
export async function projectStats(projectId?: number): Promise<MemberStat[]> {
  // The task/assignee fetch and the member list are independent of each
  // other, so they're issued concurrently instead of back-to-back.
  const supabase = getSupabase();
  const [tasks, membersRes] = await Promise.all([
    fetchStatsTasks(projectId),
    supabase.from("members").select("id, name").order("id", { ascending: true }),
  ]);
  if (membersRes.error) throw mapPostgrestError(membersRes.error, "failed to load members for stats");

  const counts = new Map<number, { total: number; done: number }>();
  for (const task of tasks) {
    for (const a of task.task_assignees ?? []) {
      const entry = counts.get(a.member_id) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (task.status === "done") entry.done += 1;
      counts.set(a.member_id, entry);
    }
  }

  return ((membersRes.data ?? []) as { id: number; name: string }[]).map((m) => ({
    id: m.id,
    name: m.name,
    total: counts.get(m.id)?.total ?? 0,
    done: counts.get(m.id)?.done ?? 0,
  }));
}
