import type { MemberStat } from "@/lib/repo";
import EmptyState from "@/components/EmptyState";

interface StatsPanelProps {
  stats: MemberStat[];
}

export default function StatsPanel({ stats }: StatsPanelProps) {
  return (
    <section aria-labelledby="stats-panel-title" className="flex flex-col gap-3">
      <h2 id="stats-panel-title" className="text-base font-semibold text-slate-900">
        進捗サマリ
      </h2>

      {stats.length === 0 ? (
        <EmptyState
          title="部員がまだいないため統計を表示できません"
          description="部員管理から部員を追加すると、ここに進捗が表示されます。"
        />
      ) : (
        <ul className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
          {stats.map((s) => {
            const percent = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
            return (
              <li key={s.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-800">{s.name}</span>
                  <span className="text-xs text-slate-500">
                    {s.done} / {s.total} 件完了 ({percent}%)
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${s.name}の完了率`}
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
                >
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
