"use client";

import type { TaskWithAssignee } from "@/lib/repo";
import { formatDueDate, todayIsoDate } from "@/lib/date";
import { collectDeadlineItems, groupDeadlineItemsByMember } from "@/lib/deadlines";
import EmptyState from "@/components/EmptyState";

interface DeadlinePanelProps {
  tasks: TaskWithAssignee[];
  /** When set, each task line is prefixed with its project name (cross-project view). */
  projectNameById?: Map<number, string>;
  /** ISO "YYYY-MM-DD" override, for tests; defaults to the client's current date. */
  today?: string;
  title?: string;
}

/**
 * Groups unfinished tasks with an overdue or this-week due date by assignee
 * (an "未割当" group covers tasks with nobody assigned).
 */
export default function DeadlinePanel({
  tasks,
  projectNameById,
  today,
  title = "期限アラート",
}: DeadlinePanelProps) {
  const todayIso = today ?? todayIsoDate();
  const items = collectDeadlineItems(tasks, todayIso, projectNameById);
  const groups = groupDeadlineItemsByMember(items);

  return (
    <section aria-labelledby="deadline-panel-title" className="flex flex-col gap-3">
      <h2 id="deadline-panel-title" className="text-base font-semibold text-slate-900">
        {title}
      </h2>

      {groups.length === 0 ? (
        <EmptyState title="期限が近いタスクはありません" />
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => (
            <li key={group.key} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="mb-2 text-sm font-semibold text-slate-800">{group.name}</p>
              <ul className="flex flex-col gap-1.5">
                {group.items.map((item, index) => (
                  <li
                    key={`${item.task.id}-${index}`}
                    className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-md border px-2 py-1.5 text-xs ${
                      item.bucket === "overdue"
                        ? "border-red-300 bg-red-50 text-red-700"
                        : "border-amber-300 bg-amber-50 text-amber-800"
                    }`}
                  >
                    <span className="font-medium">
                      {item.projectName ? `${item.projectName} / ` : ""}
                      {item.task.title}
                    </span>
                    <span className="shrink-0 font-semibold">
                      {item.bucket === "overdue" ? "期限切れ" : "今週期限"}: {formatDueDate(item.task.due_date)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
