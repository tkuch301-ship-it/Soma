"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Member, ProjectWithStats } from "@/lib/repo";
import { api, ApiError, type ProjectInput } from "@/lib/api";
import ActorSelector from "@/components/ActorSelector";
import ProjectCard from "@/components/ProjectCard";
import ProjectForm from "@/components/ProjectForm";
import MemberPanel from "@/components/MemberPanel";
import EmptyState from "@/components/EmptyState";

export default function Home() {
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectWithStats | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberAdding, setMemberAdding] = useState(false);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [projectsRes, membersRes] = await Promise.all([api.listProjects(), api.listMembers()]);
      setProjects(projectsRes);
      setMembers(membersRes);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function handleOpenProject(project: ProjectWithStats) {
    router.push(`/projects/${project.id}`);
  }

  function handleOpenCreateForm() {
    setEditingProject(null);
    setFormError(null);
    setFormOpen(true);
  }

  function handleOpenEditForm(project: ProjectWithStats) {
    setEditingProject(project);
    setFormError(null);
    setFormOpen(true);
  }

  function handleCloseForm() {
    setFormOpen(false);
    setEditingProject(null);
    setFormError(null);
  }

  async function handleSubmitForm(input: ProjectInput) {
    setFormSubmitting(true);
    setFormError(null);
    try {
      if (editingProject) {
        await api.updateProject(editingProject.id, input);
      } else {
        await api.createProject(input);
      }
      await refresh();
      setFormOpen(false);
      setEditingProject(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "プロジェクトの保存に失敗しました");
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleDeleteProject(project: ProjectWithStats) {
    if (
      !window.confirm(`「${project.name}」を削除しますか？関連するタスク・工程も削除され、取り消せません。`)
    ) {
      return;
    }
    try {
      await api.deleteProject(project.id);
      await refresh();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "プロジェクトの削除に失敗しました");
    }
  }

  async function handleToggleArchive(project: ProjectWithStats) {
    try {
      await api.updateProject(project.id, {
        status: project.status === "archived" ? "active" : "archived",
      });
      await refresh();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "プロジェクトの更新に失敗しました");
    }
  }

  async function handleAddMember(name: string): Promise<boolean> {
    setMemberAdding(true);
    setMemberError(null);
    try {
      await api.createMember(name);
      await refresh();
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
      !window.confirm(`「${member.name}」を削除しますか？担当していたタスクは未割当になります。`)
    ) {
      return;
    }
    setMemberError(null);
    try {
      await api.deleteMember(member.id);
      await refresh();
    } catch (err) {
      setMemberError(err instanceof ApiError ? err.message : "部員の削除に失敗しました");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-slate-900">Soma — プロジェクト一覧</h1>
          <p className="text-sm text-slate-500">
            サークルのプロジェクト・タスク・工程の進捗を管理・共有するボードです。
          </p>
        </div>
        <ActorSelector members={members} />
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
              refresh();
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
              <h2 className="text-base font-semibold text-slate-900">プロジェクト</h2>
              <button
                type="button"
                onClick={handleOpenCreateForm}
                aria-label="プロジェクトを作成"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                + プロジェクトを作成
              </button>
            </div>

            {projects.length === 0 ? (
              <EmptyState
                title="まだプロジェクトがありません。最初のプロジェクトを作成しましょう"
                description="「プロジェクトを作成」ボタンから新しいプロジェクトを作成できます。"
              />
            ) : (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onOpen={handleOpenProject}
                    onEdit={handleOpenEditForm}
                    onDelete={handleDeleteProject}
                    onToggleArchive={handleToggleArchive}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-8">
            <MemberPanel
              members={members}
              onAdd={handleAddMember}
              onDelete={handleDeleteMember}
              error={memberError}
              adding={memberAdding}
            />
          </div>
        </div>
      )}

      <ProjectForm
        open={formOpen}
        initialProject={editingProject}
        onCancel={handleCloseForm}
        onSubmit={handleSubmitForm}
        submitting={formSubmitting}
        error={formError}
      />
    </main>
  );
}
