"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Member, TaskStatus, TaskWithAssignee } from "@/lib/repo";
import type { TaskInput } from "@/lib/api";
import { STATUS_META, TASK_STATUSES } from "@/lib/statusMeta";
import AssigneePicker from "@/components/AssigneePicker";

interface TaskFormProps {
  open: boolean;
  members: Member[];
  initialTask: TaskWithAssignee | null;
  onCancel: () => void;
  onSubmit: (input: TaskInput) => Promise<void>;
  submitting: boolean;
  error: string | null;
}

export default function TaskForm({
  open,
  members,
  initialTask,
  onCancel,
  onSubmit,
  submitting,
  error,
}: TaskFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [titleError, setTitleError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(initialTask?.title ?? "");
    setDescription(initialTask?.description ?? "");
    setAssigneeIds(initialTask?.assignees.map((a) => a.id) ?? []);
    setDueDate(initialTask?.due_date ?? "");
    setStatus(initialTask?.status ?? "todo");
    setTitleError(null);
  }, [open, initialTask]);

  if (!open) return null;

  const isEdit = initialTask !== null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      setTitleError("タイトルを入力してください");
      return;
    }
    setTitleError(null);

    await onSubmit({
      title: trimmedTitle,
      description,
      assignee_ids: assigneeIds,
      due_date: dueDate === "" ? null : dueDate,
      status,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-form-title"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
        <h2 id="task-form-title" className="text-lg font-semibold text-slate-900">
          {isEdit ? "タスクを編集" : "タスクを追加"}
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="task-title" className="text-sm font-medium text-slate-700">
              タイトル <span className="text-red-600">*</span>
            </label>
            <input
              id="task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {titleError ? <p className="text-xs text-red-600">{titleError}</p> : null}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="task-description" className="text-sm font-medium text-slate-700">
              説明
            </label>
            <textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <AssigneePicker
            members={members}
            selectedIds={assigneeIds}
            onChange={setAssigneeIds}
            idPrefix="task-form"
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="task-due-date" className="text-sm font-medium text-slate-700">
                期限
              </label>
              <input
                id="task-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="task-status" className="text-sm font-medium text-slate-700">
                ステータス
              </label>
              <select
                id="task-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "保存中..." : isEdit ? "更新する" : "追加する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
