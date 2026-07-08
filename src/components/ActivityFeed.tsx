import type { Activity } from "@/lib/repo";
import { formatActivityText } from "@/lib/activityText";
import { formatRelativeTime } from "@/lib/date";
import EmptyState from "@/components/EmptyState";

interface ActivityFeedProps {
  activities: Activity[];
  emptyTitle?: string;
  /** When provided, every row gets a delete button (comments and history entries alike). */
  onDelete?: (activity: Activity) => void;
}

function commentText(activity: Activity): string {
  const detail = (activity.detail ?? {}) as Record<string, unknown>;
  return typeof detail.text === "string" ? detail.text : "";
}

export default function ActivityFeed({
  activities,
  emptyTitle = "まだ動きがありません",
  onDelete,
}: ActivityFeedProps) {
  if (activities.length === 0) {
    return <EmptyState title={emptyTitle} />;
  }

  return (
    <ul className="flex flex-col gap-2">
      {activities.map((activity) => {
        const isComment = activity.type === "comment";
        return (
          <li
            key={activity.id}
            className={
              isComment
                ? "flex flex-col gap-1.5 rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm"
                : "flex flex-col gap-0.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            }
          >
            {isComment ? (
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="w-fit rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                      メモ
                    </span>
                    <span className="text-xs font-medium text-indigo-700">
                      {activity.actor_name ?? "(不明)"}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-slate-800">{commentText(activity)}</p>
                </div>
                {onDelete ? (
                  <button
                    type="button"
                    onClick={() => onDelete(activity)}
                    aria-label="コメントを削除"
                    className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                  >
                    削除
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <p className="flex-1 text-slate-800">{formatActivityText(activity)}</p>
                {onDelete ? (
                  <button
                    type="button"
                    onClick={() => onDelete(activity)}
                    aria-label="この履歴を削除"
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            )}
            <time dateTime={activity.created_at} className="text-xs text-slate-400">
              {formatRelativeTime(activity.created_at)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
