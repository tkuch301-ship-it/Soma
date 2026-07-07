import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { useTempDb } from "../testSupport/tempDb";
import { ValidationError, NotFoundError, ConflictError } from "./errors";
import { getDb, resetDbForTests } from "./db";
import {
  createMember,
  listMembers,
  deleteMember,
  createTask,
  listTasks,
  getTaskById,
  updateTask,
  deleteTask,
  memberStats,
} from "./repo";

describe("repo", () => {
  useTempDb();

  describe("members", () => {
    it("creates a member and lists it", () => {
      const created = createMember("alice");
      expect(created.name).toBe("alice");
      expect(created.id).toBeGreaterThan(0);

      const members = listMembers();
      expect(members).toHaveLength(1);
      expect(members[0]).toMatchObject({ id: created.id, name: "alice" });
    });

    it("lists members in insertion order", () => {
      createMember("bob");
      createMember("alice");
      const members = listMembers();
      expect(members.map((m) => m.name)).toEqual(["bob", "alice"]);
    });

    it("deletes a member", () => {
      const created = createMember("carol");
      deleteMember(created.id);
      expect(listMembers()).toHaveLength(0);
    });

    it("throws NotFoundError when deleting a non-existent member", () => {
      expect(() => deleteMember(999999)).toThrow(NotFoundError);
    });

    it("throws ConflictError for a duplicate member name", () => {
      createMember("dave");
      expect(() => createMember("dave")).toThrow(ConflictError);
    });

    it("throws ValidationError for an empty member name", () => {
      expect(() => createMember("")).toThrow(ValidationError);
      expect(() => createMember("   ")).toThrow(ValidationError);
    });

    it("throws ValidationError for a member name over 50 characters", () => {
      const tooLong = "a".repeat(51);
      expect(() => createMember(tooLong)).toThrow(ValidationError);
    });

    it("accepts a member name at the 50 character boundary", () => {
      const boundary = "a".repeat(50);
      const created = createMember(boundary);
      expect(created.name).toBe(boundary);
    });

    it("throws ValidationError for a non-string member name", () => {
      expect(() => createMember(undefined)).toThrow(ValidationError);
      expect(() => createMember(42)).toThrow(ValidationError);
    });
  });

  describe("tasks", () => {
    it("creates a task with defaults when optional fields are omitted", () => {
      const task = createTask({ title: "write tests" });
      expect(task.title).toBe("write tests");
      expect(task.description).toBe("");
      expect(task.assignee_id).toBeNull();
      expect(task.status).toBe("todo");
      expect(task.due_date).toBeNull();
      expect(task.assignee_name).toBeNull();
    });

    it("creates a task with all fields set", () => {
      const member = createMember("erin");
      const task = createTask({
        title: "ship feature",
        description: "details here",
        assignee_id: member.id,
        status: "doing",
        due_date: "2026-08-01",
      });
      expect(task).toMatchObject({
        title: "ship feature",
        description: "details here",
        assignee_id: member.id,
        status: "doing",
        due_date: "2026-08-01",
        assignee_name: "erin",
      });
    });

    it("partially updates a task, leaving other fields untouched", () => {
      const task = createTask({
        title: "original",
        description: "desc",
        due_date: "2026-08-01",
      });
      const updated = updateTask(task.id, { status: "done" });
      expect(updated.status).toBe("done");
      expect(updated.title).toBe("original");
      expect(updated.description).toBe("desc");
      expect(updated.due_date).toBe("2026-08-01");
      expect(updated.assignee_id).toBeNull();
    });

    it("deletes a task", () => {
      const task = createTask({ title: "to be removed" });
      deleteTask(task.id);
      expect(getTaskById(task.id)).toBeUndefined();
    });

    it("throws NotFoundError when updating a non-existent task", () => {
      expect(() => updateTask(999999, { status: "done" })).toThrow(NotFoundError);
    });

    it("throws NotFoundError when deleting a non-existent task", () => {
      expect(() => deleteTask(999999)).toThrow(NotFoundError);
    });

    it("filters tasks by assigneeId", () => {
      const alice = createMember("alice");
      const bob = createMember("bob");
      createTask({ title: "a1", assignee_id: alice.id });
      createTask({ title: "b1", assignee_id: bob.id });
      createTask({ title: "unassigned" });

      const aliceTasks = listTasks({ assigneeId: alice.id });
      expect(aliceTasks).toHaveLength(1);
      expect(aliceTasks[0].title).toBe("a1");
    });

    it("filters tasks by status", () => {
      createTask({ title: "todo-task" });
      const t2 = createTask({ title: "doing-task" });
      updateTask(t2.id, { status: "doing" });

      const doingTasks = listTasks({ status: "doing" });
      expect(doingTasks).toHaveLength(1);
      expect(doingTasks[0].title).toBe("doing-task");
    });

    it("filters tasks by both assigneeId and status", () => {
      const alice = createMember("alice");
      createTask({ title: "a-todo", assignee_id: alice.id });
      const t2 = createTask({ title: "a-done", assignee_id: alice.id });
      updateTask(t2.id, { status: "done" });
      createTask({ title: "other-done", status: "done" });

      const result = listTasks({ assigneeId: alice.id, status: "done" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(t2.id);
    });

    it("throws ValidationError for an invalid status on create", () => {
      expect(() => createTask({ title: "x", status: "bogus" })).toThrow(ValidationError);
    });

    it("throws ValidationError for an invalid status on update", () => {
      const task = createTask({ title: "x" });
      expect(() => updateTask(task.id, { status: "bogus" })).toThrow(ValidationError);
    });

    it("throws ValidationError for an empty title", () => {
      expect(() => createTask({ title: "" })).toThrow(ValidationError);
      expect(() => createTask({ title: "   " })).toThrow(ValidationError);
    });

    it("throws ValidationError for an invalid due_date format", () => {
      expect(() => createTask({ title: "x", due_date: "not-a-date" })).toThrow(ValidationError);
    });

    it("throws ValidationError for a due_date with an out-of-range month", () => {
      expect(() => createTask({ title: "x", due_date: "2024-13-40" })).toThrow(ValidationError);
    });

    it("accepts a null/omitted due_date", () => {
      const task = createTask({ title: "x", due_date: null });
      expect(task.due_date).toBeNull();
    });

    it("throws ValidationError when assignee_id does not reference an existing member", () => {
      expect(() => createTask({ title: "x", assignee_id: 999999 })).toThrow(ValidationError);
    });

    it("throws ValidationError when assignee_id is not a positive integer", () => {
      expect(() => createTask({ title: "x", assignee_id: -1 })).toThrow(ValidationError);
      expect(() => createTask({ title: "x", assignee_id: 0 })).toThrow(ValidationError);
    });
  });

  describe("member deletion cascade", () => {
    it("sets assignee_id to NULL on tasks when the assignee is deleted", () => {
      const member = createMember("frank");
      const task = createTask({ title: "orphaned soon", assignee_id: member.id });

      deleteMember(member.id);

      const reloaded = getTaskById(task.id);
      expect(reloaded).toBeDefined();
      expect(reloaded?.assignee_id).toBeNull();
      expect(reloaded?.assignee_name).toBeNull();
    });
  });

  describe("memberStats", () => {
    it("aggregates total and done counts per member", () => {
      const alice = createMember("alice");
      const bob = createMember("bob");
      createTask({ title: "a1", assignee_id: alice.id, status: "done" });
      createTask({ title: "a2", assignee_id: alice.id, status: "todo" });
      createTask({ title: "a3", assignee_id: alice.id, status: "done" });
      createTask({ title: "b1", assignee_id: bob.id, status: "doing" });

      const stats = memberStats();
      const aliceStat = stats.find((s) => s.id === alice.id);
      const bobStat = stats.find((s) => s.id === bob.id);

      expect(aliceStat).toMatchObject({ name: "alice", total: 3, done: 2 });
      expect(bobStat).toMatchObject({ name: "bob", total: 1, done: 0 });
    });

    it("reports zero total/done for a member with no tasks", () => {
      const member = createMember("lonely");
      const stats = memberStats();
      const stat = stats.find((s) => s.id === member.id);
      expect(stat).toMatchObject({ name: "lonely", total: 0, done: 0 });
    });
  });

  describe("persistence across reconnects", () => {
    it("keeps data on disk after the cached connection is closed and reopened", () => {
      const dbPath = process.env.SOMA_DB_PATH as string;
      expect(existsSync(dbPath)).toBe(false);

      const member = createMember("persisted-member");
      createTask({ title: "persisted-task", assignee_id: member.id });

      expect(existsSync(dbPath)).toBe(true);

      // Simulate the process reconnecting to the same DB file (e.g. after a
      // restart) by dropping the cached connection and letting the next
      // getDb() call open a brand new one against the same path.
      resetDbForTests();
      expect(getDb()).toBeDefined();

      const members = listMembers();
      const tasks = listTasks();
      expect(members).toHaveLength(1);
      expect(members[0].name).toBe("persisted-member");
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe("persisted-task");
      expect(tasks[0].assignee_name).toBe("persisted-member");
    });
  });
});
