import type { TaskWithAssignee } from "@/lib/repo";

export type DeadlineBucket = "overdue" | "thisWeek";

export interface DeadlineItem {
  task: TaskWithAssignee;
  bucket: DeadlineBucket;
  /** Only set when the panel spans multiple projects (see the top-page cross-project view). */
  projectName?: string;
}

export interface MemberDeadlineGroup {
  /** "member-<id>" for a real member, or "unassigned". */
  key: string;
  name: string;
  items: DeadlineItem[];
}

/** Adds `days` calendar days to a "YYYY-MM-DD" string, returning another "YYYY-MM-DD" string. */
function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Picks out unfinished tasks that are either overdue or due within the next
 * 7 days (inclusive), tagging each with which bucket it fell into.
 */
export function collectDeadlineItems(
  tasks: TaskWithAssignee[],
  todayIso: string,
  projectNameById?: Map<number, string>
): DeadlineItem[] {
  const weekEnd = addDaysIso(todayIso, 7);
  const items: DeadlineItem[] = [];
  for (const task of tasks) {
    if (task.status === "done" || !task.due_date) continue;
    const projectName = projectNameById?.get(task.project_id);
    if (task.due_date < todayIso) {
      items.push({ task, bucket: "overdue", projectName });
    } else if (task.due_date <= weekEnd) {
      items.push({ task, bucket: "thisWeek", projectName });
    }
  }
  return items;
}

/**
 * Groups deadline items by assignee (a task with two assignees appears once
 * in each of their groups). Tasks with no assignee are collected into an
 * "unassigned" group, sorted last.
 */
export function groupDeadlineItemsByMember(items: DeadlineItem[]): MemberDeadlineGroup[] {
  const groups = new Map<string, MemberDeadlineGroup>();

  for (const item of items) {
    const assignees = item.task.assignees;
    if (assignees.length === 0) {
      const g = groups.get("unassigned") ?? { key: "unassigned", name: "未割当", items: [] };
      g.items.push(item);
      groups.set("unassigned", g);
      continue;
    }
    for (const a of assignees) {
      const key = `member-${a.id}`;
      const g = groups.get(key) ?? { key, name: a.name, items: [] };
      g.items.push(item);
      groups.set(key, g);
    }
  }

  const entries = Array.from(groups.values());
  entries.sort((a, b) => {
    if (a.key === "unassigned") return 1;
    if (b.key === "unassigned") return -1;
    return a.name.localeCompare(b.name, "ja");
  });
  for (const g of entries) {
    g.items.sort((a, b) => {
      if (a.bucket !== b.bucket) return a.bucket === "overdue" ? -1 : 1;
      return (a.task.due_date ?? "").localeCompare(b.task.due_date ?? "");
    });
  }
  return entries;
}
