interface ProgressBarProps {
  done: number;
  total: number;
  label: string;
  colorClass?: string;
}

/** Small labelled progress bar, styled consistently with StatsPanel's existing bars. */
export default function ProgressBar({ done, total, label, colorClass = "bg-emerald-500" }: ProgressBarProps) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span>
          {done} / {total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
      >
        <div className={`h-full rounded-full ${colorClass} transition-all`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
