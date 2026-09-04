"use client";

import { RACER_CLASSES, type EntryDraft } from "@/lib/kyotei/form";

interface EntryTableProps {
  drafts: EntryDraft[];
  onChange: (drafts: EntryDraft[]) => void;
  disabled?: boolean;
}

const LANE_COLOR: Record<number, string> = {
  1: "bg-white text-slate-900 border-slate-300",
  2: "bg-slate-900 text-white border-slate-900",
  3: "bg-rose-500 text-white border-rose-500",
  4: "bg-blue-500 text-white border-blue-500",
  5: "bg-yellow-400 text-slate-900 border-yellow-400",
  6: "bg-emerald-500 text-white border-emerald-500",
};

const NUMERIC_FIELDS: { key: keyof EntryDraft; label: string; hint: string; step: string }[] = [
  { key: "nationalWinRate", label: "全国勝率", hint: "例 5.52", step: "0.01" },
  { key: "localWinRate", label: "当地勝率", hint: "例 5.10", step: "0.01" },
  { key: "motor2nd", label: "モーター2連率", hint: "例 38.5", step: "0.1" },
  { key: "boat2nd", label: "ボート2連率", hint: "例 34.2", step: "0.1" },
  { key: "avgStartTiming", label: "平均ST", hint: "例 0.15", step: "0.01" },
  { key: "exhibitionTime", label: "展示タイム", hint: "任意", step: "0.01" },
];

/** 出走表の入力欄。公式の出走表・直前情報から転記する。 */
export default function EntryTable({ drafts, onChange, disabled = false }: EntryTableProps) {
  const update = (index: number, patch: Partial<EntryDraft>) => {
    onChange(drafts.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <th className="px-2 py-2 font-medium">枠</th>
            <th className="px-2 py-2 font-medium">選手名</th>
            <th className="px-2 py-2 font-medium">級別</th>
            {NUMERIC_FIELDS.map((f) => (
              <th key={f.key} className="px-2 py-2 font-medium">
                {f.label}
              </th>
            ))}
            <th className="px-2 py-2 font-medium">進入</th>
          </tr>
        </thead>
        <tbody>
          {drafts.map((d, i) => (
            <tr key={d.lane} className="border-b border-slate-100">
              <td className="px-2 py-2">
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded border text-sm font-bold ${LANE_COLOR[d.lane]}`}
                >
                  {d.lane}
                </span>
              </td>
              <td className="px-2 py-2">
                <input
                  className="w-28 rounded border border-slate-300 px-2 py-1 text-sm"
                  value={d.racerName}
                  disabled={disabled}
                  placeholder="任意"
                  aria-label={`${d.lane}号艇 選手名`}
                  onChange={(e) => update(i, { racerName: e.target.value })}
                />
              </td>
              <td className="px-2 py-2">
                <select
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                  value={d.klass}
                  disabled={disabled}
                  aria-label={`${d.lane}号艇 級別`}
                  onChange={(e) => update(i, { klass: e.target.value as EntryDraft["klass"] })}
                >
                  {RACER_CLASSES.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </td>
              {NUMERIC_FIELDS.map((f) => (
                <td key={f.key} className="px-2 py-2">
                  <input
                    className="w-20 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
                    inputMode="decimal"
                    step={f.step}
                    value={String(d[f.key] ?? "")}
                    disabled={disabled}
                    placeholder={f.hint}
                    aria-label={`${d.lane}号艇 ${f.label}`}
                    onChange={(e) => update(i, { [f.key]: e.target.value } as Partial<EntryDraft>)}
                  />
                </td>
              ))}
              <td className="px-2 py-2">
                <input
                  className="w-14 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
                  inputMode="numeric"
                  value={d.startCourse}
                  disabled={disabled}
                  placeholder="枠なり"
                  aria-label={`${d.lane}号艇 進入コース`}
                  onChange={(e) => update(i, { startCourse: e.target.value })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-500">
        進入欄は前付けがある場合のみ入力（空なら枠なり進入）。展示タイムは同一レース内の相対値としてのみ使われます。
      </p>
    </div>
  );
}
