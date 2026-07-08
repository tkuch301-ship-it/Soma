import type { Activity } from "@/lib/repo";
import { formatActivityText } from "@/lib/activityText";
import { formatRelativeTime } from "@/lib/date";
import EmptyState from "@/components/EmptyState";

interface ActivityFeedProps {
  activities: Activity[];
  emptyTitle?: string;
}

export default function ActivityFeed({
  activities,
  emptyTitle = "まだ動きがありません",
}: ActivityFeedProps) {
  if (activities.length === 0) {
    return <EmptyState title={emptyTitle} />;
  }

  return (
    <ul className="flex flex-col gap-2">
      {activities.map((activity) => (
        <li
          key={activity.id}
          className="flex flex-col gap-0.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <p className="text-slate-800">{formatActivityText(activity)}</p>
          <time dateTime={activity.created_at} className="text-xs text-slate-400">
            {formatRelativeTime(activity.created_at)}
          </time>
        </li>
      ))}
    </ul>
  );
}
