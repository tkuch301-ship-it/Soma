import type { TaskStatus, TaskWithAssignee } from "@/lib/repo";

const STATUS_ORDER: TaskStatus[] = ["todo", "doing", "review", "done"];

const STATUS_ICON: Record<TaskStatus, string> = {
  todo: "📋",
  doing: "🔧",
  review: "👀",
  done: "✅",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "未着手",
  doing: "進行中",
  review: "確認待ち",
  done: "完了",
};

/** Adds `days` calendar days to a "YYYY-MM-DD" string, returning another "YYYY-MM-DD" string. */
function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "2026-07-08" -> "2026/07/08" */
function formatIsoAsSlash(iso: string): string {
  return iso.replaceAll("-", "/");
}

/** "2026-07-08" -> "07/08" */
function formatMonthDay(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${month}/${day}`;
}

function assigneeLabel(task: TaskWithAssignee): string {
  return task.assignees.length > 0 ? task.assignees.map((a) => a.name).join(", ") : "未割当";
}

function formatDeadlineLine(task: TaskWithAssignee): string {
  const due = task.due_date ? formatMonthDay(task.due_date) : "期限なし";
  return `・${task.title} (担当: ${assigneeLabel(task)}) 期限 ${due}`;
}

/**
 * Builds a Discord-friendly progress summary for a project's tasks.
 *
 * Pure function so it's easy to unit test: `todayIso` (a "YYYY-MM-DD" string)
 * is supplied by the caller rather than read from `Date.now()`/the client's
 * timezone.
 */
export function buildDiscordSummary(
  projectName: string,
  tasks: TaskWithAssignee[],
  todayIso: string
): string {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  const counts: Record<TaskStatus, number> = { todo: 0, doing: 0, review: 0, done: 0 };
  for (const task of tasks) {
    counts[task.status] += 1;
  }

  const weekEnd = addDaysIso(todayIso, 7);
  const isUnfinishedWithDueDate = (t: TaskWithAssignee): t is TaskWithAssignee & { due_date: string } =>
    t.status !== "done" && !!t.due_date;

  const overdue = tasks
    .filter(isUnfinishedWithDueDate)
    .filter((t) => t.due_date < todayIso)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const thisWeek = tasks
    .filter(isUnfinishedWithDueDate)
    .filter((t) => t.due_date >= todayIso && t.due_date <= weekEnd)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const lines: string[] = [
    `**【${projectName}】進捗report (${formatIsoAsSlash(todayIso)})**`,
    `進捗: ${done}/${total} タスク完了 (${percent}%)`,
    STATUS_ORDER.map((s) => `${STATUS_ICON[s]} ${STATUS_LABEL[s]}: ${counts[s]}`).join(" / "),
  ];

  if (overdue.length > 0) {
    lines.push("⚠️ **期限切れ**");
    for (const task of overdue) lines.push(formatDeadlineLine(task));
  }

  if (thisWeek.length > 0) {
    lines.push("📅 **今週期限**");
    for (const task of thisWeek) lines.push(formatDeadlineLine(task));
  }

  return lines.join("\n");
}
