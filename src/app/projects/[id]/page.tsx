"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Activity, Member, MemberStat, ProjectWithStats, TaskStatus, TaskWithAssignee } from "@/lib/repo";
import { api, ApiError, type TaskInput } from "@/lib/api";
import Board from "@/components/Board";
import TaskForm from "@/components/TaskForm";
import TaskDetailPanel from "@/components/TaskDetailPanel";
import StatsPanel from "@/components/StatsPanel";
import FilterBar from "@/components/FilterBar";
import ActivityFeed from "@/components/ActivityFeed";
import ProgressBar from "@/components/ProgressBar";
import DeadlinePanel from "@/components/DeadlinePanel";
import Toast from "@/components/Toast";
import { useActor } from "@/lib/actor";
import { buildDiscordSummary } from "@/lib/discordSummary";
import { todayIsoDate } from "@/lib/date";
import { useAutoRefresh } from "@/lib/useAutoRefresh";

const AUTO_REFRESH_INTERVAL_MS = 15000;

export default function ProjectBoardPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const [actor] = useActor();

  const [project, setProject] = useState<ProjectWithStats | null>(null);
  // Unfiltered project tasks. The board's assignee filter is applied
  // client-side (see `tasks` below) so we only ever fetch this one list —
  // it also feeds the deadline panel and the Discord summary generator,
  // both of which need the whole project regardless of the current filter.
  const [allTasks, setAllTasks] = useState<TaskWithAssignee[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [stats, setStats] = useState<MemberStat[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Non-blocking error shown alongside the board (e.g. a failed optimistic
  // status update) without hiding the already-rendered content like
  // `loadError` does.
  const [actionError, setActionError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [filterAssigneeId, setFilterAssigneeId] = useState<"all" | number>("all");

  // Number of status-change PATCH requests currently in flight. While this
  // is non-zero, background polling is paused so a slower poll response
  // can't clobber the optimistic update it raced with.
  const [pendingPatches, setPendingPatches] = useState(0);

  const tasks = useMemo(() => {
    if (filterAssigneeId === "all") return allTasks;
    return allTasks.filter((t) => t.assignees.some((a) => a.id === filterAssigneeId));
  }, [allTasks, filterAssigneeId]);

  const [formOpen, setFormOpen] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [detailTask, setDetailTask] = useState<TaskWithAssignee | null>(null);

  const refresh = useCallback(
    async (options?: { silent?: boolean }): Promise<TaskWithAssignee[] | undefined> => {
      const silent = options?.silent ?? false;
      if (!Number.isInteger(projectId) || projectId <= 0) {
        setNotFound(true);
        setLoading(false);
        return undefined;
      }
      if (!silent) setLoading(true);
      setLoadError(null);
      try {
        const [projects, tasksRes, membersRes, statsRes, activitiesRes] = await Promise.all([
          api.listProjects(),
          // Single unfiltered fetch — the assignee filter is applied
          // client-side, so we no longer need a second (filtered) request.
          api.listTasks({ projectId }),
          api.listMembers(),
          api.memberStats(projectId),
          api.listProjectActivities(projectId),
        ]);
        const found = projects.find((p) => p.id === projectId) ?? null;
        if (!found) {
          setNotFound(true);
        } else {
          setNotFound(false);
        }
        setProject(found);
        setAllTasks(tasksRes);
        setMembers(membersRes);
        setStats(statsRes);
        setActivities(activitiesRes);
        return tasksRes;
      } catch (err) {
        // Silent (background poll) failures don't surface an error banner;
        // the next successful poll recovers automatically.
        if (!silent) {
          setLoadError(err instanceof ApiError ? err.message : "データの取得に失敗しました");
        }
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  // タスク作成フォームやタスク詳細パネルが開いている間、または楽観更新した
  // ステータス変更のPATCHが処理中の間は、編集内容や表示が巻き戻らないよう
  // 自動更新を止める。それ以外は15秒ごとにサイレント更新。
  useAutoRefresh(() => refresh({ silent: true }), {
    intervalMs: AUTO_REFRESH_INTERVAL_MS,
    enabled: !formOpen && !detailTask && pendingPatches === 0,
  });

  async function handleDeleteActivity(activity: Activity) {
    const label = activity.type === "comment" ? "このコメント" : "この履歴";
    if (!window.confirm(`${label}を削除しますか？`)) return;
    try {
      await api.deleteActivity(activity.id);
      await refresh();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "履歴の削除に失敗しました");
    }
  }

  async function handleStatusChange(id: number, status: TaskStatus) {
    setActionError(null);
    const previousTasks = allTasks;
    // Optimistic update: move the card to its new column immediately.
    setAllTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    setPendingPatches((n) => n + 1);
    try {
      await api.updateTask(id, { status });
      // Silent full refresh so stats/activities stay consistent; no
      // loading spinner since the card already reflects the new status.
      await refresh({ silent: true });
    } catch (err) {
      setAllTasks(previousTasks);
      setActionError(err instanceof ApiError ? err.message : "ステータスの更新に失敗しました");
    } finally {
      setPendingPatches((n) => n - 1);
    }
  }

  async function handleDeleteTask(task: TaskWithAssignee) {
    if (!window.confirm(`「${task.title}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }
    try {
      await api.deleteTask(task.id);
      await refresh();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "タスクの削除に失敗しました");
    }
  }

  function handleOpenCreateForm() {
    setFormError(null);
    setFormOpen(true);
  }

  function handleCloseForm() {
    setFormOpen(false);
    setFormError(null);
  }

  async function handleSubmitForm(input: TaskInput) {
    setFormSubmitting(true);
    setFormError(null);
    try {
      await api.createTask({ ...input, project_id: projectId });
      await refresh();
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "タスクの保存に失敗しました");
    } finally {
      setFormSubmitting(false);
    }
  }

  function handleOpenDetail(task: TaskWithAssignee) {
    setDetailTask(task);
  }

  function handleCloseDetail() {
    setDetailTask(null);
  }

  async function handleDetailUpdated() {
    const refreshedTasks = await refresh();
    if (refreshedTasks && detailTask) {
      const updated = refreshedTasks.find((t) => t.id === detailTask.id);
      if (updated) setDetailTask(updated);
    }
  }

  async function handleDetailDeleted() {
    setDetailTask(null);
    await refresh();
  }

  async function handleCopyDiscordSummary() {
    if (!project) return;
    const summary = buildDiscordSummary(project.name, allTasks, todayIsoDate());
    try {
      await navigator.clipboard.writeText(summary);
      setToast("Discord用まとめをコピーしました");
    } catch {
      setToast("コピーに失敗しました。ブラウザの権限を確認してください");
    }
    setTimeout(() => setToast(null), 3000);
  }

  if (notFound && !loading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <Link href="/" className="text-sm font-medium text-indigo-600 hover:underline">
          ← プロジェクト一覧
        </Link>
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-6 text-sm text-red-700">
          プロジェクトが見つかりませんでした。削除された可能性があります。
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="text-sm font-medium text-indigo-600 hover:underline">
            ← プロジェクト一覧
          </Link>
          <button
            type="button"
            onClick={() => refresh()}
            aria-label="今すぐ更新"
            title="今すぐ更新"
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            ↻ 更新
          </button>
        </div>
        {project ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
              {actor ? (
                <span className="text-xs text-slate-500">操作者: {actor.name}</span>
              ) : (
                <span className="text-xs text-slate-400">
                  操作者が未選択です（
                  <Link href="/" className="underline">
                    プロジェクト一覧
                  </Link>
                  から選択できます）
                </span>
              )}
            </div>
            {project.description ? (
              <p className="text-sm text-slate-500 whitespace-pre-wrap">{project.description}</p>
            ) : null}
            <div className="max-w-xs">
              <ProgressBar done={project.tasks_done} total={project.tasks_total} label="タスク進捗" />
            </div>
          </div>
        ) : null}
      </div>

      {loading ? (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          読み込み中です...
        </p>
      ) : loadError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700"
        >
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => refresh()}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            再読み込み
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            {actionError ? (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700"
              >
                <p>{actionError}</p>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  aria-label="このエラーを閉じる"
                  className="rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                >
                  ✕
                </button>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <FilterBar members={members} value={filterAssigneeId} onChange={setFilterAssigneeId} />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyDiscordSummary}
                  disabled={!project}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  📋 Discord用まとめをコピー
                </button>
                <button
                  type="button"
                  onClick={handleOpenCreateForm}
                  aria-label="タスクを追加"
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  + タスクを追加
                </button>
              </div>
            </div>

            <Board
              tasks={tasks}
              onStatusChange={handleStatusChange}
              onOpenDetail={handleOpenDetail}
              onDelete={handleDeleteTask}
            />
          </div>

          <div className="flex flex-col gap-8">
            <DeadlinePanel tasks={allTasks} />

            <StatsPanel stats={stats} />

            <section aria-labelledby="activity-feed-title" className="flex flex-col gap-3">
              <h2 id="activity-feed-title" className="text-base font-semibold text-slate-900">
                プロジェクトの動き
              </h2>
              <ActivityFeed
                activities={activities}
                emptyTitle="このプロジェクトの動きはまだありません"
                onDelete={handleDeleteActivity}
              />
            </section>
          </div>
        </div>
      )}

      <TaskForm
        open={formOpen}
        members={members}
        initialTask={null}
        onCancel={handleCloseForm}
        onSubmit={handleSubmitForm}
        submitting={formSubmitting}
        error={formError}
      />

      <TaskDetailPanel
        task={detailTask}
        members={members}
        onClose={handleCloseDetail}
        onUpdated={handleDetailUpdated}
        onDeleted={handleDetailDeleted}
      />

      <Toast message={toast} />
    </main>
  );
}
