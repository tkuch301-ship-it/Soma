"use client";

import { useCallback, useEffect, useState } from "react";
import type { Member, MemberStat, TaskStatus, TaskWithAssignee } from "@/lib/repo";
import { api, ApiError, type TaskInput } from "@/lib/api";
import Board from "@/components/Board";
import TaskForm from "@/components/TaskForm";
import MemberPanel from "@/components/MemberPanel";
import StatsPanel from "@/components/StatsPanel";
import FilterBar from "@/components/FilterBar";

export default function Home() {
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<TaskWithAssignee[]>([]);
  const [stats, setStats] = useState<MemberStat[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filterAssigneeId, setFilterAssigneeId] = useState<"all" | number>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithAssignee | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberAdding, setMemberAdding] = useState(false);

  const refresh = useCallback(async (assigneeFilter: "all" | number) => {
    setLoadError(null);
    try {
      const [membersRes, tasksRes, statsRes] = await Promise.all([
        api.listMembers(),
        api.listTasks(assigneeFilter === "all" ? {} : { assigneeId: assigneeFilter }),
        api.memberStats(),
      ]);
      setMembers(membersRes);
      setTasks(tasksRes);
      setStats(statsRes);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(filterAssigneeId);
    // refresh identity is stable (empty deps); only filterAssigneeId changes matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAssigneeId]);

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
    setEditingTask(null);
    setFormError(null);
    setFormOpen(true);
  }

  function handleOpenEditForm(task: TaskWithAssignee) {
    setEditingTask(task);
    setFormError(null);
    setFormOpen(true);
  }

  function handleCloseForm() {
    setFormOpen(false);
    setEditingTask(null);
    setFormError(null);
  }

  async function handleSubmitForm(input: TaskInput) {
    setFormSubmitting(true);
    setFormError(null);
    try {
      if (editingTask) {
        await api.updateTask(editingTask.id, input);
      } else {
        await api.createTask(input);
      }
      await refresh(filterAssigneeId);
      setFormOpen(false);
      setEditingTask(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "タスクの保存に失敗しました");
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleAddMember(name: string): Promise<boolean> {
    setMemberAdding(true);
    setMemberError(null);
    try {
      await api.createMember(name);
      await refresh(filterAssigneeId);
      return true;
    } catch (err) {
      if (err instanceof ApiError && /already exists/i.test(err.message)) {
        setMemberError(`「${name}」という名前の部員は既に登録されています`);
      } else {
        setMemberError(err instanceof ApiError ? err.message : "部員の追加に失敗しました");
      }
      return false;
    } finally {
      setMemberAdding(false);
    }
  }

  async function handleDeleteMember(member: Member) {
    if (
      !window.confirm(
        `「${member.name}」を削除しますか？担当していたタスクは未割当になります。`
      )
    ) {
      return;
    }
    setMemberError(null);
    const nextFilter = filterAssigneeId === member.id ? "all" : filterAssigneeId;
    try {
      await api.deleteMember(member.id);
      if (nextFilter !== filterAssigneeId) {
        setFilterAssigneeId(nextFilter);
      } else {
        await refresh(filterAssigneeId);
      }
    } catch (err) {
      setMemberError(err instanceof ApiError ? err.message : "部員の削除に失敗しました");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900">Soma — サークルタスクボード</h1>
        <p className="text-sm text-slate-500">
          サークル部員のタスク進捗を管理・共有するボードです。
        </p>
      </header>

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
              onEdit={handleOpenEditForm}
              onDelete={handleDeleteTask}
            />
          </div>

          <div className="flex flex-col gap-8">
            <MemberPanel
              members={members}
              onAdd={handleAddMember}
              onDelete={handleDeleteMember}
              error={memberError}
              adding={memberAdding}
            />
            <StatsPanel stats={stats} />
          </div>
        </div>
      )}

      <TaskForm
        open={formOpen}
        members={members}
        initialTask={editingTask}
        onCancel={handleCloseForm}
        onSubmit={handleSubmitForm}
        submitting={formSubmitting}
        error={formError}
      />
    </main>
  );
}
