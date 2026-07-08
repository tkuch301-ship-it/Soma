import type { Activity, TaskStatus } from "@/lib/repo";
import { STATUS_META } from "@/lib/statusMeta";

const FIELD_LABELS: Record<string, string> = {
  name: "名前",
  title: "タイトル",
  description: "説明",
  assignees: "担当者",
  status: "ステータス",
  due_date: "期限",
};

function actorLabel(activity: Activity): string {
  return activity.actor_name ?? "(不明)";
}

function statusLabel(value: unknown): string {
  if (typeof value === "string" && value in STATUS_META) {
    return STATUS_META[value as TaskStatus].label;
  }
  if (value === null || value === undefined) return "(なし)";
  return String(value);
}

function textValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(空)";
  return String(value);
}

function dueDateValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "期限なし";
  return String(value);
}

function assigneesValue(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "未割当";
  return value.map((name) => String(name)).join("、");
}

function formatFieldValue(field: string, value: unknown): string {
  switch (field) {
    case "status":
      return statusLabel(value);
    case "assignees":
      return assigneesValue(value);
    case "due_date":
      return dueDateValue(value);
    default:
      return textValue(value);
  }
}

function isFieldChange(value: unknown): value is { before: unknown; after: unknown } {
  return typeof value === "object" && value !== null && "before" in value && "after" in value;
}

/** Renders a `field: {before, after}` detail map (task_updated / project_updated) as Japanese fragments. */
function formatChanges(detail: Record<string, unknown>): string {
  // Some payloads nest the per-field map under "changes"; support both shapes defensively.
  const rawChanges =
    "changes" in detail && typeof detail.changes === "object" && detail.changes !== null
      ? (detail.changes as Record<string, unknown>)
      : detail;

  const parts = Object.entries(rawChanges)
    .filter(([, value]) => isFieldChange(value))
    .map(([field, value]) => {
      const change = value as { before: unknown; after: unknown };
      const label = FIELD_LABELS[field] ?? field;
      const before = formatFieldValue(field, change.before);
      const after = formatFieldValue(field, change.after);
      return `${label}を ${before}→${after}`;
    });

  return parts.join("、");
}

/**
 * Converts a raw Activity row into a Japanese sentence for display in the
 * activity feed / task history tab. Unknown activity types fall back to
 * showing the raw `type` string so nothing is silently hidden.
 */
export function formatActivityText(activity: Activity): string {
  const actor = actorLabel(activity);
  const detail = (activity.detail ?? {}) as Record<string, unknown>;

  switch (activity.type) {
    case "project_created":
      return `${actor} が プロジェクト「${textValue(detail.name)}」を作成しました`;
    case "project_updated": {
      const changes = formatChanges(detail);
      return changes
        ? `${actor} が プロジェクトを更新しました（${changes}）`
        : `${actor} が プロジェクトを更新しました`;
    }
    case "project_deleted":
      return `${actor} が プロジェクト「${textValue(detail.name)}」を削除しました`;
    case "task_created":
      return `${actor} が タスク「${textValue(detail.title)}」を作成しました`;
    case "task_updated": {
      const changes = formatChanges(detail);
      return changes
        ? `${actor} が タスクを更新しました（${changes}）`
        : `${actor} が タスクを更新しました`;
    }
    case "task_status_changed": {
      const before = statusLabel(detail.before);
      const after = statusLabel(detail.after);
      return `${actor} が ステータスを ${before}→${after} に変更しました`;
    }
    case "task_deleted":
      return `${actor} が タスク「${textValue(detail.title)}」を削除しました`;
    case "step_added":
      return `${actor} が 工程「${textValue(detail.title)}」を追加しました`;
    case "step_done":
      return `${actor} が 工程「${textValue(detail.title)}」を完了しました`;
    case "step_undone":
      return `${actor} が 工程「${textValue(detail.title)}」を未完了に戻しました`;
    case "step_deleted":
      return `${actor} が 工程「${textValue(detail.title)}」を削除しました`;
    case "comment":
      return `${actor} が コメントを追加しました：${textValue(detail.text)}`;
    case "member_added":
      return `${actor} が 部員「${textValue(detail.name)}」を追加しました`;
    case "member_deleted":
      return `${actor} が 部員「${textValue(detail.name)}」を削除しました`;
    default:
      return `${actor} が ${activity.type} を実行しました`;
  }
}
