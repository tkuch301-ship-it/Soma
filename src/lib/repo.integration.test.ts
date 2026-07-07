import { describe, it, expect, afterAll } from "vitest";
import {
  createMember,
  deleteMember,
  createProject,
  deleteProject,
  getProjectById,
  listProjects,
  createTask,
  updateTask,
  deleteTask,
  getTaskById,
  listTasks,
  createStep,
  updateStep,
  deleteStep,
  listSteps,
  listActivities,
  listTaskActivities,
  projectStats,
} from "./repo";
import { NotFoundError, ValidationError } from "./errors";

/**
 * These tests hit a real Supabase project over HTTPS and are only run when
 * SUPABASE_URL (and SUPABASE_SERVICE_ROLE_KEY) are configured, e.g.:
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm test
 *
 * In CI / sandboxed environments without those env vars, this whole suite
 * is skipped (describe.skipIf) rather than failing.
 */
const hasSupabaseEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Suffix keeps test data identifiable/unique across concurrent runs and
// lets afterAll clean up precisely what this run created.
const SUFFIX = `__itest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const createdMemberIds: number[] = [];
const createdProjectIds: number[] = [];

describe.skipIf(!hasSupabaseEnv)("repo integration (Supabase)", () => {
  afterAll(async () => {
    for (const id of createdProjectIds) {
      try {
        await deleteProject(id);
      } catch {
        // already gone (e.g. deleted within a test) — fine.
      }
    }
    for (const id of createdMemberIds) {
      try {
        await deleteMember(id);
      } catch {
        // already gone — fine.
      }
    }
  });

  it("creates a member, a project, a task, and steps; aggregates and cascades correctly", async () => {
    const member = await createMember(`alice${SUFFIX}`);
    createdMemberIds.push(member.id);
    expect(member.name).toBe(`alice${SUFFIX}`);

    const project = await createProject({ name: `project${SUFFIX}` });
    createdProjectIds.push(project.id);
    expect(project.status).toBe("active");
    expect(project.description).toBe("");

    const listedProjects = await listProjects();
    const foundProject = listedProjects.find((p) => p.id === project.id);
    expect(foundProject).toMatchObject({ tasks_total: 0, tasks_done: 0 });

    const task = await createTask({
      project_id: project.id,
      title: `task${SUFFIX}`,
      assignee_id: member.id,
    });
    expect(task.status).toBe("todo");
    expect(task.assignee_name).toBe(member.name);
    expect(task.steps_total).toBe(0);
    expect(task.steps_done).toBe(0);

    const step1 = await createStep(task.id, { title: "step one" });
    const step2 = await createStep(task.id, { title: "step two" });

    const steps = await listSteps(task.id);
    expect(steps.map((s) => s.title)).toEqual(["step one", "step two"]);

    const doneStep = await updateStep(step1.id, { done: true });
    expect(doneStep.done).toBe(true);

    const reloadedTask = await getTaskById(task.id);
    expect(reloadedTask?.steps_total).toBe(2);
    expect(reloadedTask?.steps_done).toBe(1);

    await deleteStep(step2.id);
    const afterDelete = await getTaskById(task.id);
    expect(afterDelete?.steps_total).toBe(1);

    const updatedTask = await updateTask(task.id, { status: "doing" });
    expect(updatedTask.status).toBe("doing");

    const filtered = await listTasks({ projectId: project.id });
    expect(filtered.map((t) => t.id)).toContain(task.id);

    const stats = await projectStats(project.id);
    const memberStat = stats.find((s) => s.id === member.id);
    expect(memberStat).toMatchObject({ total: 1, done: 0 });

    const taskActivities = await listTaskActivities(task.id);
    const taskActivityTypes = taskActivities.map((a) => a.type);
    expect(taskActivityTypes).toEqual(
      expect.arrayContaining(["task_created", "task_updated", "task_status_changed", "step_added", "step_done", "step_deleted"])
    );

    const projectActivities = await listActivities(project.id);
    expect(projectActivities.map((a) => a.type)).toEqual(
      expect.arrayContaining(["project_created", "task_created"])
    );

    // Deleting the task cascades to its steps.
    await deleteTask(task.id);
    expect(await getTaskById(task.id)).toBeUndefined();

    // Task-scoped activities are cascaded away with the task itself; the
    // project-scoped "task_deleted" record survives (task_id is left null).
    const projectActivitiesAfterDelete = await listActivities(project.id);
    expect(projectActivitiesAfterDelete.some((a) => a.type === "task_deleted")).toBe(true);

    // Deleting the project cascades to any remaining tasks/steps.
    await deleteProject(project.id);
    expect(await getProjectById(project.id)).toBeUndefined();
    createdProjectIds.splice(createdProjectIds.indexOf(project.id), 1);

    // Deleting the member sets assignee_id to null on any surviving tasks
    // (none remain here, but the member itself should still delete cleanly).
    await deleteMember(member.id);
    createdMemberIds.splice(createdMemberIds.indexOf(member.id), 1);
  });

  it("validates inputs and reports not-found errors", async () => {
    await expect(createTask({ project_id: 99999999, title: "x" })).rejects.toThrow(
      ValidationError
    );
    await expect(updateTask(99999999, { status: "done" })).rejects.toThrow(NotFoundError);
    await expect(deleteTask(99999999)).rejects.toThrow(NotFoundError);
    await expect(listActivities(99999999)).rejects.toThrow(NotFoundError);
  });
});
