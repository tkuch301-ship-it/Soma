"use client";

import type { BetPlan } from "@/lib/kyotei/plan";
import { BET_TYPE_LABEL, LANES } from "@/lib/kyotei/types";

const yen = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;
const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

const LANE_BAR: Record<number, string> = {
  1: "bg-slate-400",
  2: "bg-slate-900",
  3: "bg-rose-500",
  4: "bg-blue-500",
  5: "bg-yellow-400",
  6: "bg-emerald-500",
};

interface PlanResultProps {
  plan: BetPlan;
  bankroll: number;
}

export default function PlanResult({ plan, bankroll }: PlanResultProps) {
  const { evaluation, prediction } = plan;

  return (
    <div className="flex flex-col gap-6">
      <div
        className={`rounded-lg border p-4 ${
          plan.skip ? "border-slate-300 bg-slate-50" : "border-emerald-300 bg-emerald-50"
        }`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded px-2 py-1 text-sm font-bold ${
              plan.skip ? "bg-slate-600 text-white" : "bg-emerald-600 text-white"
            }`}
          >
            {plan.skip ? "見送り" : "勝負"}
          </span>
          <span className="text-sm text-slate-700">
            {BET_TYPE_LABEL[plan.betType]} / 資金 {yen(bankroll)}
          </span>
          {!plan.skip ? (
            <span className="text-sm text-slate-700">
              投票 {yen(plan.totalStake)}（資金の {pct(plan.totalStake / bankroll)}） / 期待収支{" "}
              <strong className={plan.expectedProfit >= 0 ? "text-emerald-700" : "text-rose-700"}>
                {plan.expectedProfit >= 0 ? "+" : ""}
                {yen(plan.expectedProfit)}
              </strong>
            </span>
          ) : null}
        </div>
        <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
          {plan.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">各艇の1着確率（モデル予想）</h3>
        <div className="flex flex-col gap-1">
          {LANES.map((lane) => {
            const p = prediction.winProbability[lane];
            const entry = prediction.scores.find((s) => s.lane === lane);
            return (
              <div key={lane} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-right font-bold text-slate-700">{lane}</span>
                <span className="w-10 text-slate-500">
                  {entry && entry.startCourse !== lane ? `→${entry.startCourse}コース` : ""}
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100">
                  <div className={`h-full ${LANE_BAR[lane]}`} style={{ width: `${p * 100}%` }} />
                </div>
                <span className="w-12 text-right tabular-nums text-slate-600">{pct(p)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 p-4 text-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">このレースの市場</h3>
        <dl className="grid grid-cols-2 gap-2 text-slate-600 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-500">推定控除率</dt>
            <dd className="tabular-nums">{pct(evaluation.market.takeout)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">オッズ取得点数</dt>
            <dd className="tabular-nums">
              {evaluation.market.combos}点（{pct(evaluation.market.coverage, 0)}）
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">妙味あり判定</dt>
            <dd className="tabular-nums">{evaluation.candidates.length}点</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-slate-500">
          控除率は「全通り買うと必ず失う割合」。これを上回る精度で確率を当てられない限り、長期の収支はマイナスになります。
        </p>
      </section>

      {plan.tickets.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">買い目（ケリー基準の配分）</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-2 py-2 font-medium">組番</th>
                  <th className="px-2 py-2 text-right font-medium">オッズ</th>
                  <th className="px-2 py-2 text-right font-medium">予想確率</th>
                  <th className="px-2 py-2 text-right font-medium">市場確率</th>
                  <th className="px-2 py-2 text-right font-medium">期待値</th>
                  <th className="px-2 py-2 text-right font-medium">購入額</th>
                  <th className="px-2 py-2 text-right font-medium">的中時払戻</th>
                </tr>
              </thead>
              <tbody>
                {plan.tickets.map((t) => {
                  const candidate = evaluation.all.find((c) => c.key === t.key);
                  return (
                    <tr key={t.key} className="border-b border-slate-100">
                      <td className="px-2 py-2 font-bold tabular-nums text-slate-800">{t.key}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{t.odds.toFixed(1)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{pct(t.probability, 2)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                        {candidate ? pct(candidate.marketProbability, 2) : "-"}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums text-emerald-700">
                        {t.expectedValue.toFixed(2)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{yen(t.amount)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-500">{yen(t.payoutIfHit)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="text-sm font-semibold text-slate-700">
                  <td className="px-2 py-2" colSpan={5}>
                    合計（少なくとも1点当たる確率 {pct(plan.hitProbability)}）
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{yen(plan.totalStake)}</td>
                  <td className="px-2 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ) : null}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">期待値の高い順（上位10点・買わない点も含む）</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-2 py-2 font-medium">組番</th>
                <th className="px-2 py-2 text-right font-medium">オッズ</th>
                <th className="px-2 py-2 text-right font-medium">予想確率</th>
                <th className="px-2 py-2 text-right font-medium">市場確率</th>
                <th className="px-2 py-2 text-right font-medium">期待値</th>
              </tr>
            </thead>
            <tbody>
              {evaluation.all.slice(0, 10).map((c) => (
                <tr key={c.key} className="border-b border-slate-100">
                  <td className="px-2 py-2 font-medium tabular-nums text-slate-800">{c.key}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.odds.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{pct(c.probability, 2)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-500">{pct(c.marketProbability, 2)}</td>
                  <td
                    className={`px-2 py-2 text-right font-semibold tabular-nums ${
                      c.expectedValue >= 1 ? "text-emerald-700" : "text-slate-500"
                    }`}
                  >
                    {c.expectedValue.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
