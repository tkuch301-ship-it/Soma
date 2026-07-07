"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Activity, Member, Step, TaskStatus, TaskWithAssignee } from "@/lib/repo";
import { api, ApiError, type TaskInput } from "@/lib/api";
import { STATUS_META, TASK_STATUSES } from "@/lib/statusMeta";
import StepList from "@/components/StepList";
import ActivityFeed from "@/components/ActivityFeed";

type Tab = "info" | "steps" | "history";

interface TaskDetailPanelProps {
  task: TaskWithAssignee | null;
  members: Member[];
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}

export default function TaskDetailPanel({ task, members, onClose, onUpdated, onDeleted }: TaskDetailPanelProps) {
  const [tab, setTab] = useState<Tab>("info");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);

  const [steps, setSteps] = useState<Step[]>([]);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [stepAdding, setStepAdding] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);

  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  // Keyed on task.id (not the whole task object) so that background refreshes
  // of the same task (e.g. after toggling a step) don't reset the active tab
  // or clobber in-progress edits in the "基本情報" form.
  useEffect(() => {
    if (!task) return;
    setTab("info");
    setTitle(task.title);
    setDescription(task.description);
    setAssigneeId(task.assignee_id ? String(task.assignee_id) : "");
    setDueDate(task.due_date ?? "");
    setStatus(task.status);
    setInfoError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  const loadSteps = useCallback(async (taskId: number) => {
    setStepsLoading(true);
    setStepError(null);
    try {
      setSteps(await api.listSteps(taskId));
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : "工程の取得に失敗しました");
    } finally {
      setStepsLoading(false);
    }
  }, []);

  const loadActivities = useCallback(async (taskId: number) => {
    setActivitiesLoading(true);
    setActivitiesError(null);
    try {
      setActivities(await api.listTaskActivities(taskId));
    } catch (err) {
      setActivitiesError(err instanceof ApiError ? err.message : "履歴の取得に失敗しました");
    } finally {
      setActivitiesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!task) return;
    loadSteps(task.id);
    loadActivities(task.id);
    // Mutations (step toggle/add/delete, info save) reload steps/activities
    // explicitly themselves, so this only needs to fire when a *different*
    // task is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  if (!task) return null;

  async function handleSaveInfo(e: FormEvent) {
    e.preventDefault();
    if (!task) return;
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      setInfoError("タイトルを入力してください");
      return;
    }
    setInfoSaving(true);
    setInfoError(null);
    const input: Partial<TaskInput> = {
      title: trimmedTitle,
      description,
      assignee_id: assigneeId === "" ? null : Number(assigneeId),
      due_date: dueDate === "" ? null : dueDate,
      status,
    };
    try {
      await api.updateTask(task.id, input);
      onUpdated();
      await loadActivities(task.id);
    } catch (err) {
      setInfoError(err instanceof ApiError ? err.message : "タスクの保存に失敗しました");
    } finally {
      setInfoSaving(false);
    }
  }

  async function handleDeleteTask() {
    if (!task) return;
    if (!window.confirm(`「${task.title}」を削除しますか？この操作は取り消せません。`)) return;
    try {
      await api.deleteTask(task.id);
      onDeleted();
    } catch (err) {
      setInfoError(err instanceof ApiError ? err.message : "タスクの削除に失敗しました");
    }
  }

  async function handleToggleStep(step: Step) {
    if (!task) return;
    try {
      await api.updateStep(step.id, { done: !step.done });
      await loadSteps(task.id);
      await loadActivities(task.id);
      onUpdated();
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : "工程の更新に失敗しました");
    }
  }

  async function handleAddStep(stepTitle: string) {
    if (!task) return;
    setStepAdding(true);
    setStepError(null);
    try {
      await api.createStep(task.id, { title: stepTitle });
      await loadSteps(task.id);
      await loadActivities(task.id);
      onUpdated();
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : "工程の追加に失敗しました");
    } finally {
      setStepAdding(false);
    }
  }

  async function handleDeleteStep(step: Step) {
    if (!task) return;
    if (!window.confirm(`工程「${step.title}」を削除しますか？`)) return;
    try {
      await api.deleteStep(step.id);
      await loadSteps(task.id);
      await loadActivities(task.id);
      onUpdated();
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : "工程の削除に失敗しました");
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "info", label: "基本情報" },
    { id: "steps", label: "工程" },
    { id: "history", label: "履歴" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-detail-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white p-5 shadow-lg">
        <div className="flex items-start justify-between gap-2">
          <h2 id="task-detail-title" className="text-lg font-semibold text-slate-900">
            {task.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 flex gap-1 border-b border-slate-200">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-t-md px-3 py-2 text-sm font-medium ${
                tab === t.id
                  ? "border-b-2 border-indigo-600 text-indigo-700"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex-1">
          {tab === "info" ? (
            <form onSubmit={handleSaveInfo} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="detail-title" className="text-sm font-medium text-slate-700">
                  タイトル <span className="text-red-600">*</span>
                </label>
                <input
                  id="detail-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="detail-description" className="text-sm font-medium text-slate-700">
                  説明
                </label>
                <textarea
                  id="detail-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="detail-assignee" className="text-sm font-medium text-slate-700">
                  担当者
                </label>
                <select
                  id="detail-assignee"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">未割当</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="detail-due-date" className="text-sm font-medium text-slate-700">
                    期限
                  </label>
                  <input
                    id="detail-due-date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="detail-status" className="text-sm font-medium text-slate-700">
                    ステータス
                  </label>
                  <select
                    id="detail-status"
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

              {infoError ? (
                <p role="alert" className="text-sm text-red-600">
                  {infoError}
                </p>
              ) : null}

              <div className="mt-1 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleDeleteTask}
                  className="rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  タスクを削除
                </button>
                <button
                  type="submit"
                  disabled={infoSaving}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {infoSaving ? "保存中..." : "保存する"}
                </button>
              </div>
            </form>
          ) : null}

          {tab === "steps" ? (
            stepsLoading ? (
              <p className="text-sm text-slate-500">読み込み中です...</p>
            ) : (
              <StepList
                steps={steps}
                onToggle={handleToggleStep}
                onAdd={handleAddStep}
                onDelete={handleDeleteStep}
                adding={stepAdding}
                error={stepError}
              />
            )
          ) : null}

          {tab === "history" ? (
            activitiesLoading ? (
              <p className="text-sm text-slate-500">読み込み中です...</p>
            ) : activitiesError ? (
              <p role="alert" className="text-sm text-red-600">
                {activitiesError}
              </p>
            ) : (
              <ActivityFeed
                activities={activities}
                membersById={membersById}
                emptyTitle="このタスクの履歴はまだありません"
              />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
