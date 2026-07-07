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
import { useActor } from "@/lib/actor";

export default function ProjectBoardPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const [actor] = useActor();

  const [project, setProject] = useState<ProjectWithStats | null>(null);
  const [tasks, setTasks] = useState<TaskWithAssignee[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [stats, setStats] = useState<MemberStat[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [filterAssigneeId, setFilterAssigneeId] = useState<"all" | number>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [detailTask, setDetailTask] = useState<TaskWithAssignee | null>(null);

  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  const refresh = useCallback(
    async (assigneeFilter: "all" | number): Promise<TaskWithAssignee[] | undefined> => {
      if (!Number.isInteger(projectId) || projectId <= 0) {
        setNotFound(true);
        setLoading(false);
        return undefined;
      }
      setLoadError(null);
      try {
        const [projects, tasksRes, membersRes, statsRes, activitiesRes] = await Promise.all([
          api.listProjects(),
          api.listTasks(assigneeFilter === "all" ? { projectId } : { projectId, assigneeId: assigneeFilter }),
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
        setTasks(tasksRes);
        setMembers(membersRes);
        setStats(statsRes);
        setActivities(activitiesRes);
        return tasksRes;
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : "データの取得に失敗しました");
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    refresh(filterAssigneeId);
    // refresh identity depends on projectId; only filterAssigneeId changes here matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAssigneeId, projectId]);

  async function handleStatusChange(id: number, status: TaskStatus) {
    try {
      await api.updateTask(id, { status });
      await refresh(filterAssigneeId);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "ステータスの更新に失敗しました");
    }
  }

  async function handleDeleteTask(task: TaskWithAssignee) {
    if (!window.confirm(`「${task.title}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }
    try {
      await api.deleteTask(task.id);
      await refresh(filterAssigneeId);
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
      await refresh(filterAssigneeId);
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
    const refreshedTasks = await refresh(filterAssigneeId);
    if (refreshedTasks && detailTask) {
      const updated = refreshedTasks.find((t) => t.id === detailTask.id);
      if (updated) setDetailTask(updated);
    }
  }

  async function handleDetailDeleted() {
    setDetailTask(null);
    await refresh(filterAssigneeId);
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
        <Link href="/" className="text-sm font-medium text-indigo-600 hover:underline">
          ← プロジェクト一覧
        </Link>
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
            onClick={() => {
              setLoading(true);
              refresh(filterAssigneeId);
            }}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            再読み込み
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <FilterBar members={members} value={filterAssigneeId} onChange={setFilterAssigneeId} />
              <button
                type="button"
                onClick={handleOpenCreateForm}
                aria-label="タスクを追加"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                + タスクを追加
              </button>
            </div>

            <Board
              tasks={tasks}
              onStatusChange={handleStatusChange}
              onOpenDetail={handleOpenDetail}
              onDelete={handleDeleteTask}
            />
          </div>

          <div className="flex flex-col gap-8">
            <StatsPanel stats={stats} />

            <section aria-labelledby="activity-feed-title" className="flex flex-col gap-3">
              <h2 id="activity-feed-title" className="text-base font-semibold text-slate-900">
                プロジェクトの動き
              </h2>
              <ActivityFeed
                activities={activities}
                membersById={membersById}
                emptyTitle="このプロジェクトの動きはまだありません"
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
    </main>
  );
}
