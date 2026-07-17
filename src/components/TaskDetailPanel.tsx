"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Activity, Member, Step, TaskStatus, TaskWithAssignee } from "@/lib/repo";
import { api, ApiError, type TaskInput } from "@/lib/api";
import { STATUS_META, TASK_STATUSES } from "@/lib/statusMeta";
import StepList from "@/components/StepList";
import ActivityFeed from "@/components/ActivityFeed";
import AssigneePicker from "@/components/AssigneePicker";
import { useAutoRefresh } from "@/lib/useAutoRefresh";

const COMMENT_MAX_LENGTH = 1000;
const ACTIVITIES_AUTO_REFRESH_INTERVAL_MS = 15000;

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
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
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

  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  // Keyed on task.id (not the whole task object) so that background refreshes
  // of the same task (e.g. after toggling a step) don't reset the active tab
  // or clobber in-progress edits in the "基本情報" form.
  useEffect(() => {
    if (!task) return;
    setTab("info");
    setTitle(task.title);
    setDescription(task.description);
    setAssigneeIds(task.assignees.map((a) => a.id));
    setDueDate(task.due_date ?? "");
    setStatus(task.status);
    setInfoError(null);
    setCommentText("");
    setCommentError(null);
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

  const loadActivities = useCallback(async (taskId: number, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setActivitiesLoading(true);
    setActivitiesError(null);
    try {
      // Note: this only replaces the `activities` list, never `commentText`,
      // so an in-progress comment draft is never clobbered by a background poll.
      setActivities(await api.listTaskActivities(taskId));
    } catch (err) {
      if (!silent) {
        setActivitiesError(err instanceof ApiError ? err.message : "履歴の取得に失敗しました");
      }
    } finally {
      if (!silent) setActivitiesLoading(false);
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

  // While the panel is open, silently refresh only the activities/comments
  // feed every 15s so a teammate's new comment shows up without a reload.
  // This never touches the comment textarea draft or the steps/info tabs.
  useAutoRefresh(
    () => {
      if (task) loadActivities(task.id, { silent: true });
    },
    { intervalMs: ACTIVITIES_AUTO_REFRESH_INTERVAL_MS, enabled: task !== null }
  );

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
      assignee_ids: assigneeIds,
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
    setStepError(null);
    const previousSteps = steps;
    const optimisticDone = !step.done;
    // Optimistic update: flip the checkbox immediately, roll back on failure.
    setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, done: optimisticDone } : s)));
    try {
      const updated = await api.updateStep(step.id, { done: optimisticDone });
      setSteps((prev) => prev.map((s) => (s.id === step.id ? updated : s)));
      await loadActivities(task.id);
      onUpdated();
    } catch (err) {
      setSteps(previousSteps);
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

  async function handleSubmitComment(e: FormEvent) {
    e.preventDefault();
    if (!task) return;
    const trimmed = commentText.trim();
    if (trimmed.length === 0) return;
    if (trimmed.length > COMMENT_MAX_LENGTH) {
      setCommentError(`コメントは${COMMENT_MAX_LENGTH}文字以内で入力してください`);
      return;
    }
    setCommentSubmitting(true);
    setCommentError(null);
    try {
      await api.createComment(task.id, trimmed);
      setCommentText("");
      await loadActivities(task.id);
    } catch (err) {
      setCommentError(err instanceof ApiError ? err.message : "コメントの投稿に失敗しました");
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function handleDeleteActivity(activity: Activity) {
    if (!task) return;
    const label = activity.type === "comment" ? "このコメント" : "この履歴";
    if (!window.confirm(`${label}を削除しますか？`)) return;
    try {
      await api.deleteActivity(activity.id);
      await loadActivities(task.id);
    } catch (err) {
      setCommentError(err instanceof ApiError ? err.message : "削除に失敗しました");
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "info", label: "基本情報" },
    { id: "steps", label: "工程" },
    { id: "history", label: "履歴・コメント" },
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

              <AssigneePicker
                members={members}
                selectedIds={assigneeIds}
                onChange={setAssigneeIds}
                idPrefix="task-detail"
              />

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
            <div className="flex flex-col gap-4">
              <form
                onSubmit={handleSubmitComment}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <label htmlFor="detail-comment" className="text-sm font-medium text-slate-700">
                  メモ・コメントを追加
                </label>
                <textarea
                  id="detail-comment"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  rows={3}
                  maxLength={COMMENT_MAX_LENGTH}
                  placeholder="進捗メモや連絡事項を残せます"
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400">
                    {commentText.length}/{COMMENT_MAX_LENGTH}
                  </span>
                  <button
                    type="submit"
                    disabled={commentSubmitting || commentText.trim().length === 0}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {commentSubmitting ? "投稿中..." : "コメントを投稿"}
                  </button>
                </div>
                {commentError ? (
                  <p role="alert" className="text-sm text-red-600">
                    {commentError}
                  </p>
                ) : null}
              </form>

              {activitiesLoading ? (
                <p className="text-sm text-slate-500">読み込み中です...</p>
              ) : activitiesError ? (
                <p role="alert" className="text-sm text-red-600">
                  {activitiesError}
                </p>
              ) : (
                <ActivityFeed
                  activities={activities}
                  emptyTitle="このタスクの履歴・コメントはまだありません"
                  onDelete={handleDeleteActivity}
                />
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
