"use client";

import type { TaskStatus, TaskWithAssignee } from "@/lib/repo";
import { STATUS_META, TASK_STATUSES } from "@/lib/statusMeta";
import { formatDueDate, isOverdue } from "@/lib/date";

interface TaskCardProps {
  task: TaskWithAssignee;
  onStatusChange: (id: number, status: TaskStatus) => void;
  onEdit: (task: TaskWithAssignee) => void;
  onDelete: (task: TaskWithAssignee) => void;
}

export default function TaskCard({ task, onStatusChange, onEdit, onDelete }: TaskCardProps) {
  const overdue = isOverdue(task.due_date, task.status);

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 break-words">{task.title}</h3>
      </div>

      {task.description ? (
        <p className="line-clamp-3 text-xs text-slate-600 whitespace-pre-wrap">
          {task.description}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
          {task.assignee_name ?? "未割当"}
        </span>
        <span
          className={
            overdue
              ? "rounded-full border border-red-300 bg-red-50 px-2 py-0.5 font-medium text-red-700"
              : "rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600"
          }
        >
          {overdue ? "期限切れ: " : "期限: "}
          {formatDueDate(task.due_date)}
        </span>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <label className="sr-only" htmlFor={`status-${task.id}`}>
          {`「${task.title}」のステータスを変更`}
        </label>
        <select
          id={`status-${task.id}`}
          value={task.status}
          onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
          className={`rounded-md px-2 py-1 text-xs font-medium ${STATUS_META[task.status].badgeClass}`}
        >
          {TASK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_META[status].label}
            </option>
          ))}
        </select>

        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onEdit(task)}
            aria-label={`「${task.title}」を編集`}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            編集
          </button>
          <button
            type="button"
            onClick={() => onDelete(task)}
            aria-label={`「${task.title}」を削除`}
            className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            削除
          </button>
        </div>
      </div>
    </li>
  );
}
