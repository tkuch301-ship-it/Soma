"use client";

import type { ProjectWithStats } from "@/lib/repo";
import { formatDueDate } from "@/lib/date";
import ProgressBar from "@/components/ProgressBar";

interface ProjectCardProps {
  project: ProjectWithStats;
  onOpen: (project: ProjectWithStats) => void;
  onEdit: (project: ProjectWithStats) => void;
  onDelete: (project: ProjectWithStats) => void;
  onToggleArchive: (project: ProjectWithStats) => void;
}

export default function ProjectCard({
  project,
  onOpen,
  onEdit,
  onDelete,
  onToggleArchive,
}: ProjectCardProps) {
  const archived = project.status === "archived";

  return (
    <li
      className={`flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm ${
        archived ? "border-slate-200 opacity-70" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => onOpen(project)}
          className="text-left text-base font-semibold text-slate-900 hover:text-indigo-700 hover:underline"
        >
          {project.name}
        </button>
        {archived ? (
          <span className="shrink-0 rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            アーカイブ済み
          </span>
        ) : null}
      </div>

      {project.description ? (
        <p className="line-clamp-2 text-sm text-slate-600 whitespace-pre-wrap">{project.description}</p>
      ) : null}

      <ProgressBar done={project.tasks_done} total={project.tasks_total} label="タスク進捗" />

      <p className="text-xs text-slate-500">期限: {formatDueDate(project.due_date)}</p>

      <div className="mt-1 flex flex-wrap items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => onOpen(project)}
          aria-label={`「${project.name}」のボードを開く`}
          className="mr-auto rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
        >
          開く →
        </button>
        <button
          type="button"
          onClick={() => onToggleArchive(project)}
          className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          {archived ? "復元する" : "アーカイブする"}
        </button>
        <button
          type="button"
          onClick={() => onEdit(project)}
          aria-label={`「${project.name}」を編集`}
          className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          編集
        </button>
        <button
          type="button"
          onClick={() => onDelete(project)}
          aria-label={`「${project.name}」を削除`}
          className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          削除
        </button>
      </div>
    </li>
  );
}
