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
  createComment,
  deleteActivity,
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
      assignee_ids: [member.id],
    });
    expect(task.status).toBe("todo");
    expect(task.assignees).toEqual([{ id: member.id, name: member.name }]);
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

    // Deleting the member cascades task_assignees rows on any surviving tasks
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

  it("supports multiple assignees per task: set, replace, filter, and stats", async () => {
    const memberA = await createMember(`memberA${SUFFIX}`);
    const memberB = await createMember(`memberB${SUFFIX}`);
    createdMemberIds.push(memberA.id, memberB.id);

    const project = await createProject({ name: `multiassign${SUFFIX}` });
    createdProjectIds.push(project.id);

    // Create with two assignees.
    const task = await createTask({
      project_id: project.id,
      title: `multiassign-task${SUFFIX}`,
      assignee_ids: [memberA.id, memberB.id],
    });
    expect(task.assignees.map((a) => a.id).sort()).toEqual([memberA.id, memberB.id].sort());

    // A task with two assignees counts toward each of their totals.
    const statsBoth = await projectStats(project.id);
    expect(statsBoth.find((s) => s.id === memberA.id)).toMatchObject({ total: 1, done: 0 });
    expect(statsBoth.find((s) => s.id === memberB.id)).toMatchObject({ total: 1, done: 0 });

    // Filtering by assigneeId returns the task for both current assignees.
    const filteredA = await listTasks({ assigneeId: memberA.id });
    expect(filteredA.map((t) => t.id)).toContain(task.id);
    const filteredB = await listTasks({ assigneeId: memberB.id });
    expect(filteredB.map((t) => t.id)).toContain(task.id);

    // PATCH with assignee_ids fully replaces the set (memberA dropped, memberB kept).
    const replaced = await updateTask(task.id, { assignee_ids: [memberB.id] });
    expect(replaced.assignees).toEqual([{ id: memberB.id, name: memberB.name }]);

    const filteredAAfter = await listTasks({ assigneeId: memberA.id });
    expect(filteredAAfter.map((t) => t.id)).not.toContain(task.id);
    const filteredBAfter = await listTasks({ assigneeId: memberB.id });
    expect(filteredBAfter.map((t) => t.id)).toContain(task.id);

    const statsAfter = await projectStats(project.id);
    expect(statsAfter.find((s) => s.id === memberA.id)).toMatchObject({ total: 0, done: 0 });
    expect(statsAfter.find((s) => s.id === memberB.id)).toMatchObject({ total: 1, done: 0 });

    // Omitting assignee_ids on PATCH leaves the assignee set unchanged.
    const unchanged = await updateTask(task.id, { title: `${task.title}-renamed` });
    expect(unchanged.assignees).toEqual([{ id: memberB.id, name: memberB.name }]);

    // An unknown member id in assignee_ids is a validation error.
    await expect(
      updateTask(task.id, { assignee_ids: [999999999] })
    ).rejects.toThrow(ValidationError);

    const taskActivities = await listTaskActivities(task.id);
    expect(taskActivities.some((a) => a.type === "task_updated")).toBe(true);

    await deleteTask(task.id);
    await deleteProject(project.id);
    createdProjectIds.splice(createdProjectIds.indexOf(project.id), 1);
    await deleteMember(memberA.id);
    await deleteMember(memberB.id);
    createdMemberIds.splice(createdMemberIds.indexOf(memberA.id), 1);
    createdMemberIds.splice(createdMemberIds.indexOf(memberB.id), 1);
  });

  it("supports the review status and comment activities", async () => {
    const project = await createProject({ name: `review${SUFFIX}` });
    createdProjectIds.push(project.id);

    const task = await createTask({ project_id: project.id, title: `review-task${SUFFIX}` });
    expect(task.status).toBe("todo");

    const toReview = await updateTask(task.id, { status: "review" });
    expect(toReview.status).toBe("review");

    const toDone = await updateTask(task.id, { status: "done" });
    expect(toDone.status).toBe("done");

    const statusHistory = await listTaskActivities(task.id);
    const statusChanges = statusHistory
      .filter((a) => a.type === "task_status_changed")
      .map((a) => a.detail);
    expect(statusChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ before: "todo", after: "review" }),
        expect.objectContaining({ before: "review", after: "done" }),
      ])
    );

    // Comments are recorded as activities with type="comment".
    const comment = await createComment(task.id, { text: "  progress note  " }, {
      actor_name: "tester",
    });
    expect(comment.type).toBe("comment");
    expect(comment.detail).toEqual({ text: "progress note" });

    const afterComment = await listTaskActivities(task.id);
    expect(afterComment.some((a) => a.id === comment.id && a.type === "comment")).toBe(true);

    // Only comment-type activities can be deleted via deleteActivity.
    const statusActivity = statusHistory.find((a) => a.type === "task_status_changed");
    if (statusActivity) {
      await expect(deleteActivity(statusActivity.id)).rejects.toThrow(ValidationError);
    }

    await deleteActivity(comment.id);
    const afterDeleteComment = await listTaskActivities(task.id);
    expect(afterDeleteComment.some((a) => a.id === comment.id)).toBe(false);

    await expect(deleteActivity(comment.id)).rejects.toThrow(NotFoundError);
    await expect(createComment(task.id, { text: "" })).rejects.toThrow(ValidationError);
    await expect(createComment(task.id, { text: "x".repeat(1001) })).rejects.toThrow(
      ValidationError
    );

    await deleteTask(task.id);
    await deleteProject(project.id);
    createdProjectIds.splice(createdProjectIds.indexOf(project.id), 1);
  });
});
