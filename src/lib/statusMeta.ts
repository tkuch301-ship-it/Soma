import type { TaskStatus } from "@/lib/repo";

export const TASK_STATUSES: TaskStatus[] = ["todo", "doing", "review", "done"];

interface StatusMeta {
  label: string;
  badgeClass: string;
  columnHeaderClass: string;
}

export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  todo: {
    label: "未着手",
    badgeClass: "bg-slate-100 text-slate-700 border border-slate-300",
    columnHeaderClass: "bg-slate-100 text-slate-800 border-slate-300",
  },
  doing: {
    label: "進行中",
    badgeClass: "bg-amber-100 text-amber-800 border border-amber-300",
    columnHeaderClass: "bg-amber-100 text-amber-900 border-amber-300",
  },
  review: {
    label: "確認待ち",
    badgeClass: "bg-indigo-100 text-indigo-800 border border-indigo-300",
    columnHeaderClass: "bg-indigo-100 text-indigo-900 border-indigo-300",
  },
  done: {
    label: "完了",
    badgeClass: "bg-emerald-100 text-emerald-800 border border-emerald-300",
    columnHeaderClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
};
