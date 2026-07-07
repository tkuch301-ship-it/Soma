"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Project } from "@/lib/repo";
import type { ProjectInput } from "@/lib/api";

interface ProjectFormProps {
  open: boolean;
  initialProject: Project | null;
  onCancel: () => void;
  onSubmit: (input: ProjectInput) => Promise<void>;
  submitting: boolean;
  error: string | null;
}

export default function ProjectForm({
  open,
  initialProject,
  onCancel,
  onSubmit,
  submitting,
  error,
}: ProjectFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialProject?.name ?? "");
    setDescription(initialProject?.description ?? "");
    setDueDate(initialProject?.due_date ?? "");
    setNameError(null);
  }, [open, initialProject]);

  if (!open) return null;

  const isEdit = initialProject !== null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setNameError("プロジェクト名を入力してください");
      return;
    }
    setNameError(null);

    await onSubmit({
      name: trimmedName,
      description,
      due_date: dueDate === "" ? null : dueDate,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-form-title"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
        <h2 id="project-form-title" className="text-lg font-semibold text-slate-900">
          {isEdit ? "プロジェクトを編集" : "プロジェクトを作成"}
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="project-name" className="text-sm font-medium text-slate-700">
              名前 <span className="text-red-600">*</span>
            </label>
            <input
              id="project-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {nameError ? <p className="text-xs text-red-600">{nameError}</p> : null}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="project-description" className="text-sm font-medium text-slate-700">
              説明
            </label>
            <textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="project-due-date" className="text-sm font-medium text-slate-700">
              期限
            </label>
            <input
              id="project-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
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
              {submitting ? "保存中..." : isEdit ? "更新する" : "作成する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
