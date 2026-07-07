"use client";

import { FormEvent, useState } from "react";
import type { Step } from "@/lib/repo";
import ProgressBar from "@/components/ProgressBar";
import EmptyState from "@/components/EmptyState";

interface StepListProps {
  steps: Step[];
  onToggle: (step: Step) => void;
  onAdd: (title: string) => Promise<void>;
  onDelete: (step: Step) => void;
  adding: boolean;
  error: string | null;
}

export default function StepList({ steps, onToggle, onAdd, onDelete, adding, error }: StepListProps) {
  const [title, setTitle] = useState("");
  const done = steps.filter((s) => s.done).length;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length === 0) return;
    await onAdd(trimmed);
    setTitle("");
  }

  return (
    <div className="flex flex-col gap-3">
      {steps.length > 0 ? <ProgressBar done={done} total={steps.length} label="工程進捗" /> : null}

      {steps.length === 0 ? (
        <EmptyState title="工程がまだありません" description="下の入力欄から工程を追加できます。" />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {steps.map((step) => (
            <li
              key={step.id}
              className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
            >
              <label className="flex flex-1 items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={step.done}
                  onChange={() => onToggle(step)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className={step.done ? "text-slate-400 line-through" : ""}>{step.title}</span>
              </label>
              <button
                type="button"
                onClick={() => onDelete(step)}
                aria-label={`工程「${step.title}」を削除`}
                className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <label htmlFor="new-step-title" className="sr-only">
          工程を追加
        </label>
        <input
          id="new-step-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: 買い出し"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={adding || title.trim().length === 0}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {adding ? "追加中..." : "追加"}
        </button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
