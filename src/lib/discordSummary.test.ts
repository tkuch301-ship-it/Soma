import { describe, it, expect } from "vitest";
import { buildDiscordSummary } from "./discordSummary";
import type { TaskStatus, TaskWithAssignee } from "@/lib/repo";

let nextId = 1;

function makeTask(overrides: Partial<TaskWithAssignee> = {}): TaskWithAssignee {
  const id = nextId++;
  return {
    id,
    project_id: 1,
    title: `タスク${id}`,
    description: "",
    status: "todo" as TaskStatus,
    due_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    assignees: [],
    steps_total: 0,
    steps_done: 0,
    ...overrides,
  };
}

describe("buildDiscordSummary", () => {
  it("matches the documented example format", () => {
    const tasks: TaskWithAssignee[] = [
      ...Array.from({ length: 3 }, () => makeTask({ status: "todo" })),
      ...Array.from({ length: 2 }, () => makeTask({ status: "doing" })),
      ...Array.from({ length: 2 }, () => makeTask({ status: "review" })),
      ...Array.from({ length: 5 }, () => makeTask({ status: "done" })),
    ];
    // Overwrite two specific tasks to exercise the deadline sections.
    tasks[0] = makeTask({
      title: "タスク名",
      status: "todo",
      due_date: "2026-07-01",
      assignees: [
        { id: 1, name: "alice" },
        { id: 2, name: "bob" },
      ],
    });
    tasks[3] = makeTask({
      title: "タスク名",
      status: "doing",
      due_date: "2026-07-10",
      assignees: [],
    });

    const summary = buildDiscordSummary("プロジェクト名", tasks, "2026-07-08");

    expect(summary).toBe(
      [
        "**【プロジェクト名】進捗report (2026/07/08)**",
        "進捗: 5/12 タスク完了 (42%)",
        "📋 未着手: 3 / 🔧 進行中: 2 / 👀 確認待ち: 2 / ✅ 完了: 5",
        "⚠️ **期限切れ**",
        "・タスク名 (担当: alice, bob) 期限 07/01",
        "📅 **今週期限**",
        "・タスク名 (担当: 未割当) 期限 07/10",
      ].join("\n")
    );
  });

  it("omits the overdue section when nothing is overdue", () => {
    const tasks = [makeTask({ status: "todo", due_date: "2026-07-10" })];
    const summary = buildDiscordSummary("P", tasks, "2026-07-08");
    expect(summary).not.toContain("期限切れ");
    expect(summary).toContain("今週期限");
  });

  it("omits the this-week section when nothing is due this week", () => {
    const tasks = [makeTask({ status: "todo", due_date: "2026-07-01" })];
    const summary = buildDiscordSummary("P", tasks, "2026-07-08");
    expect(summary).toContain("期限切れ");
    expect(summary).not.toContain("今週期限");
  });

  it("handles an empty task list without dividing by zero", () => {
    const summary = buildDiscordSummary("空プロジェクト", [], "2026-07-08");
    expect(summary).toContain("進捗: 0/0 タスク完了 (0%)");
    expect(summary).not.toContain("期限切れ");
    expect(summary).not.toContain("今週期限");
  });

  it("excludes done tasks from deadline sections even when overdue", () => {
    const tasks = [makeTask({ status: "done", due_date: "2026-01-01" })];
    const summary = buildDiscordSummary("P", tasks, "2026-07-08");
    expect(summary).not.toContain("期限切れ");
  });

  it("excludes tasks without a due date from deadline sections but still counts them", () => {
    const tasks = [makeTask({ status: "doing", due_date: null })];
    const summary = buildDiscordSummary("P", tasks, "2026-07-08");
    expect(summary).toContain("進捗: 0/1 タスク完了 (0%)");
    expect(summary).not.toContain("期限切れ");
    expect(summary).not.toContain("今週期限");
  });

  it("includes a task due exactly 7 days out in the this-week section (inclusive boundary)", () => {
    const tasks = [makeTask({ status: "todo", due_date: "2026-07-15" })];
    const summary = buildDiscordSummary("P", tasks, "2026-07-08");
    expect(summary).toContain("今週期限");
    expect(summary).toContain("07/15");
  });

  it("excludes a task due 8 days out from the this-week section", () => {
    const tasks = [makeTask({ status: "todo", due_date: "2026-07-16" })];
    const summary = buildDiscordSummary("P", tasks, "2026-07-08");
    expect(summary).not.toContain("今週期限");
  });
});
