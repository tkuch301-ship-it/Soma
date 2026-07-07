"use client";

import type { TaskStatus, TaskWithAssignee } from "@/lib/repo";
import { STATUS_META, TASK_STATUSES } from "@/lib/statusMeta";
import TaskCard from "@/components/TaskCard";
import EmptyState from "@/components/EmptyState";

interface BoardProps {
  tasks: TaskWithAssignee[];
  onStatusChange: (id: number, status: TaskStatus) => void;
  onOpenDetail: (task: TaskWithAssignee) => void;
  onDelete: (task: TaskWithAssignee) => void;
}

export default function Board({ tasks, onStatusChange, onOpenDetail, onDelete }: BoardProps) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        title="まだタスクがありません。最初のタスクを追加しましょう"
        description="「タスクを追加」ボタンから新しいタスクを作成できます。"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {TASK_STATUSES.map((status) => {
        const columnTasks = tasks.filter((t) => t.status === status);
        return (
          <section
            key={status}
            aria-label={`${STATUS_META[status].label}のタスク一覧`}
            className="flex flex-col gap-3 rounded-lg bg-slate-100/60 p-3"
          >
            <h2
              className={`flex items-center justify-between rounded-md border px-3 py-1.5 text-sm font-semibold ${STATUS_META[status].columnHeaderClass}`}
            >
              <span>{STATUS_META[status].label}</span>
              <span className="text-xs font-normal">{columnTasks.length}件</span>
            </h2>
            {columnTasks.length === 0 ? (
              <p className="px-1 text-xs text-slate-500">タスクなし</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={onStatusChange}
                    onOpenDetail={onOpenDetail}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
