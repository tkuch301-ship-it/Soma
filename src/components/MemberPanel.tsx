"use client";

import { FormEvent, useState } from "react";
import type { Member } from "@/lib/repo";
import EmptyState from "@/components/EmptyState";

interface MemberPanelProps {
  members: Member[];
  onAdd: (name: string) => Promise<boolean>;
  onDelete: (member: Member) => void;
  error: string | null;
  adding: boolean;
}

export default function MemberPanel({ members, onAdd, onDelete, error, adding }: MemberPanelProps) {
  const [name, setName] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    const success = await onAdd(trimmed);
    if (success) {
      setName("");
    }
  }

  return (
    <section aria-labelledby="member-panel-title" className="flex flex-col gap-3">
      <h2 id="member-panel-title" className="text-base font-semibold text-slate-900">
        部員管理
      </h2>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-1 min-w-[10rem] flex-col gap-1">
          <label htmlFor="new-member-name" className="text-sm font-medium text-slate-700">
            部員名
          </label>
          <input
            id="new-member-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 山田太郎"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          disabled={adding || name.trim().length === 0}
          aria-label="部員を追加"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {adding ? "追加中..." : "部員を追加"}
        </button>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {members.length === 0 ? (
        <EmptyState
          title="部員がまだ登録されていません"
          description="上のフォームから最初の部員を追加しましょう。"
        />
      ) : (
        <ul className="flex flex-col divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-sm text-slate-800">{m.name}</span>
              <button
                type="button"
                onClick={() => onDelete(m)}
                aria-label={`${m.name}を削除`}
                className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
