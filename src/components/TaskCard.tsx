"use client";

import type { TaskStatus, TaskWithAssignee } from "@/lib/repo";
import { STATUS_META, TASK_STATUSES } from "@/lib/statusMeta";
import { formatDueDate, isOverdue } from "@/lib/date";

interface TaskCardProps {
  task: TaskWithAssignee;
  onStatusChange: (id: number, status: TaskStatus) => void;
  onOpenDetail: (task: TaskWithAssignee) => void;
  onDelete: (task: TaskWithAssignee) => void;
}

export default function TaskCard({ task, onStatusChange, onOpenDetail, onDelete }: TaskCardProps) {
  const overdue = isOverdue(task.due_date, task.status);
  const stepPercent = task.steps_total > 0 ? Math.round((task.steps_done / task.steps_total) * 100) : 0;

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => onOpenDetail(task)}
          className="text-left text-sm font-semibold text-slate-900 break-words hover:text-indigo-700 hover:underline"
        >
          {task.title}
        </button>
      </div>

      {task.description ? (
        <p className="line-clamp-3 text-xs text-slate-600 whitespace-pre-wrap">
          {task.description}
        </p>
      ) : null}

      {task.steps_total > 0 ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              工程 {task.steps_done}/{task.steps_total}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`「${task.title}」の工程進捗`}
            aria-valuenow={stepPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
          >
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${stepPercent}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {task.assignees.length === 0 ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-500">
            未割当
          </span>
        ) : (
          <>
            {task.assignees.slice(0, 2).map((a) => (
              <span
                key={a.id}
                className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700"
              >
                {a.name}
              </span>
            ))}
            {task.assignees.length > 2 ? (
              <span
                className="rounded-full border border-indigo-200 bg-indigo-100 px-2 py-0.5 font-medium text-indigo-700"
                title={task.assignees.slice(2).map((a) => a.name).join("、")}
              >
                +{task.assignees.length - 2}
              </span>
            ) : null}
          </>
        )}
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
            onClick={() => onOpenDetail(task)}
            aria-label={`「${task.title}」の詳細を開く`}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            詳細
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
