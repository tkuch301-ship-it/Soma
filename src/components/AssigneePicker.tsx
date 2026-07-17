"use client";

import type { Member } from "@/lib/repo";

interface AssigneePickerProps {
  members: Member[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  /** Unique prefix so checkbox ids don't collide when the picker is rendered more than once on a page. */
  idPrefix: string;
  label?: string;
}

/**
 * Multi-assignee picker: a chip per member that toggles a real (visually
 * hidden) checkbox, plus a summary line listing who's currently selected.
 * Replaces the old bare `<select multiple>`.
 */
export default function AssigneePicker({
  members,
  selectedIds,
  onChange,
  idPrefix,
  label = "担当者",
}: AssigneePickerProps) {
  const selectedSet = new Set(selectedIds);

  function toggle(id: number) {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((v) => v !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  const selectedMembers = members.filter((m) => selectedSet.has(m.id));

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-slate-700">{label}（複数選択可）</span>

      {members.length === 0 ? (
        <p className="text-xs text-slate-500">部員がまだ登録されていません。</p>
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label={`${label}を選択`}>
          {members.map((m) => {
            const checked = selectedSet.has(m.id);
            const inputId = `${idPrefix}-assignee-${m.id}`;
            return (
              <label
                key={m.id}
                htmlFor={inputId}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  checked
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(m.id)}
                  className="sr-only"
                />
                {m.name}
              </label>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-500">
        選択中: {selectedMembers.length > 0 ? selectedMembers.map((m) => m.name).join("、") : "未割当"}
      </p>
    </div>
  );
}
