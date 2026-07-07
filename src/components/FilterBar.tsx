"use client";

import type { Member } from "@/lib/repo";

interface FilterBarProps {
  members: Member[];
  value: "all" | number;
  onChange: (value: "all" | number) => void;
}

export default function FilterBar({ members, value, onChange }: FilterBarProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="assignee-filter" className="text-sm font-medium text-slate-700">
        担当者で絞り込み
      </label>
      <select
        id="assignee-filter"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "all" ? "all" : Number(v));
        }}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <option value="all">全員</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
