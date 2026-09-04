"use client";

import { useState } from "react";
import { backtest, type BacktestResult } from "@/lib/kyotei/backtest";
import { simulateBankroll, type SimulationResult } from "@/lib/kyotei/montecarlo";
import { generateSyntheticRaces } from "@/lib/kyotei/sampleRaces";
import type { PlanOptions } from "@/lib/kyotei/plan";
import type { HistoricalRace } from "@/lib/kyotei/types";

const yen = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;
const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

interface BacktestPanelProps {
  bankroll: number;
  options: Omit<PlanOptions, "bankroll">;
}

/**
 * 「そのルールで本当に勝てるのか」を確かめるパネル。
 * ここで回収率が1を超えないなら、本番でも同じ結果になる。
 */
export default function BacktestPanel({ bankroll, options }: BacktestPanelProps) {
  const [races, setRaces] = useState<HistoricalRace[] | null>(null);
  const [source, setSource] = useState<string>("");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = (data: HistoricalRace[], label: string) => {
    setBusy(true);
    setError(null);
    // 重い計算なので、いったん描画を返してから走らせる。
    setTimeout(() => {
      try {
        const bt = backtest(data, { ...options, startingBankroll: bankroll, compound: true });
        setRaces(data);
        setSource(label);
        setResult(bt);

        const perRaceProfit = bt.rows.map((r) => r.profit);
        const perRaceStake = bt.rows.filter((r) => r.staked > 0).map((r) => r.staked);
        setSimulation(
          perRaceProfit.some((p) => p !== 0)
            ? simulateBankroll({
                perRaceProfit,
                perRaceStake,
                startingBankroll: bankroll,
                races: 1000,
                trials: 2000,
                compound: true,
              })
            : null
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setResult(null);
        setSimulation(null);
      } finally {
        setBusy(false);
      }
    }, 0);
  };

  const loadFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("レースの配列（HistoricalRace[]）を含む JSON を指定してください");
      }
      run(parsed as HistoricalRace[], `${file.name}（${parsed.length}レース）`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const summary = result?.summary;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded bg-slate-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => run(generateSyntheticRaces(600, 42), "合成サンプル（600レース）")}
        >
          {busy ? "計算中…" : "合成サンプルで検証"}
        </button>
        <label className="cursor-pointer rounded border border-slate-300 px-3 py-2 text-sm text-slate-700">
          自分のデータ（JSON）を読み込む
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadFile(file);
              e.target.value = "";
            }}
          />
        </label>
        {source ? <span className="text-xs text-slate-500">対象: {source}</span> : null}
      </div>

      <p className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        合成サンプルは動作確認用に乱数で作った架空データで、実際のレース結果ではありません。ここでの成績は「このツールが儲かる証拠」には
        なりません。判断に使えるのは、自分で集めた実際の出走表・締切直前オッズ・確定着順で検証した結果だけです。
      </p>

      {error ? <p className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}

      {summary ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="回収率" value={summary.roi.toFixed(3)} tone={summary.roi >= 1 ? "good" : "bad"} />
            <Stat
              label="収支"
              value={`${summary.profit >= 0 ? "+" : ""}${yen(summary.profit)}`}
              tone={summary.profit >= 0 ? "good" : "bad"}
            />
            <Stat label="賭けたレース" value={`${summary.betRaces} / ${summary.races}`} />
            <Stat label="的中率（レース単位）" value={pct(summary.hitRate)} />
            <Stat label="投票総額" value={yen(summary.staked)} />
            <Stat label="最終資金" value={yen(summary.finalBankroll)} />
            <Stat label="最大ドローダウン" value={pct(summary.maxDrawdown)} tone={summary.maxDrawdown > 0.5 ? "bad" : "neutral"} />
            <Stat label="t 値" value={summary.tStat.toFixed(2)} tone={Math.abs(summary.tStat) >= 2 ? "good" : "neutral"} />
          </div>

          <p className="text-xs text-slate-600">
            {Math.abs(summary.tStat) < 2
              ? `t 値が ${summary.tStat.toFixed(2)} で、この収支は偶然の範囲です。「勝てている」とも「負けている」とも言えません。`
              : summary.tStat >= 2
                ? "t 値が 2 を超えており、統計的には優位性がありそうです（ただしオッズが締切直前の実オッズであることが前提）。"
                : "t 値が -2 を下回っており、このルールは統計的にはっきり負けています。"}
            {summary.racesForSignificance
              ? ` 今の優位性を確認するには、およそ ${summary.racesForSignificance.toLocaleString("ja-JP")} レースの検証が必要です。`
              : ""}
          </p>

          {summary.roi < 1 ? (
            <p className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
              回収率が 1.0 未満です。このモデル・この条件では賭けるほど負けます。重みの較正、しきい値（最低期待値）の引き上げ、
              あるいは「賭けない」という選択を検討してください。
            </p>
          ) : null}

          {simulation ? (
            <section className="rounded-lg border border-slate-200 p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">
                この成績のまま 1,000 レース続けたら（ブートストラップ 2,000 試行）
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="プラスで終わる確率"
                  value={pct(simulation.profitProbability)}
                  tone={simulation.profitProbability >= 0.5 ? "good" : "bad"}
                />
                <Stat
                  label="破産する確率"
                  value={pct(simulation.ruinProbability)}
                  tone={simulation.ruinProbability > 0.1 ? "bad" : "good"}
                />
                <Stat label="最終資金の中央値" value={yen(simulation.medianFinalBankroll)} />
                <Stat label="下位5%の最終資金" value={yen(simulation.p5FinalBankroll)} />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                「高確率で利益」が言えるのは、この“プラスで終わる確率”が高く、かつ破産確率が十分低いときだけです。
                期待値がプラスでも賭け金が大きすぎると、この確率は簡単に5割を切ります（ケリー係数を下げると改善します）。
              </p>
            </section>
          ) : null}

          {races ? (
            <details className="text-xs text-slate-600">
              <summary className="cursor-pointer">直近20レースの明細</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="px-2 py-1 font-medium">レース</th>
                      <th className="px-2 py-1 font-medium">判断</th>
                      <th className="px-2 py-1 text-right font-medium">投票</th>
                      <th className="px-2 py-1 text-right font-medium">払戻</th>
                      <th className="px-2 py-1 text-right font-medium">収支</th>
                      <th className="px-2 py-1 text-right font-medium">資金</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result!.rows.slice(-20).map((r) => (
                      <tr key={r.index} className="border-b border-slate-100">
                        <td className="px-2 py-1">{r.raceId}</td>
                        <td className="px-2 py-1">{r.skipped ? "見送り" : `${r.tickets}点`}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{r.staked ? yen(r.staked) : "-"}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{r.payout ? yen(r.payout) : "-"}</td>
                        <td
                          className={`px-2 py-1 text-right tabular-nums ${
                            r.profit > 0 ? "text-emerald-700" : r.profit < 0 ? "text-rose-700" : ""
                          }`}
                        >
                          {r.profit ? yen(r.profit) : "-"}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">{yen(r.bankroll)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "bad" | "neutral" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : "text-slate-800";
  return (
    <div className="rounded border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
