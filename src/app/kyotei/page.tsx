"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import BacktestPanel from "@/components/kyotei/BacktestPanel";
import EntryTable from "@/components/kyotei/EntryTable";
import PlanResult from "@/components/kyotei/PlanResult";
import { emptyDrafts, parseDrafts, toDrafts, type EntryDraft } from "@/lib/kyotei/form";
import { parseOddsText } from "@/lib/kyotei/odds";
import { buildBetPlan, type BetPlan } from "@/lib/kyotei/plan";
import { sampleRaceWithOdds } from "@/lib/kyotei/sampleRaces";
import { BET_TYPE_LABEL, type BetType } from "@/lib/kyotei/types";

const BET_TYPES: BetType[] = ["trifecta", "trio", "exacta", "quinella", "win"];

function oddsToText(odds: Record<string, number>): string {
  return Object.entries(odds)
    .map(([key, value]) => `${key} ${value.toFixed(1)}`)
    .join("\n");
}

const initialSample = sampleRaceWithOdds(7);

export default function KyoteiPage() {
  const [drafts, setDrafts] = useState<EntryDraft[]>(() => toDrafts(initialSample.card));
  const [oddsText, setOddsText] = useState(() => oddsToText(initialSample.odds));
  const [betType, setBetType] = useState<BetType>("trifecta");

  // 出走表とオッズは同じレースのものでなければ意味がないので、サンプルは必ずセットで入れる。
  const loadSample = () => {
    const next = sampleRaceWithOdds(Math.floor(Math.random() * 100000));
    setDrafts(toDrafts(next.card));
    setOddsText(oddsToText(next.odds));
    setBetType("trifecta");
  };

  const [bankroll, setBankroll] = useState(200000);
  const [kellyFraction, setKellyFraction] = useState(0.25);
  const [minEdge, setMinEdge] = useState(0.15);
  const [marketBlend, setMarketBlend] = useState(0.5);
  const [maxTickets, setMaxTickets] = useState(6);

  const parsedCard = useMemo(() => parseDrafts(drafts, { venue: "入力レース" }), [drafts]);

  const parsedOdds = useMemo(() => {
    if (!oddsText.trim()) return { odds: {} as Record<string, number>, error: null as string | null };
    try {
      return { odds: parseOddsText(oddsText, betType), error: null };
    } catch (e) {
      return { odds: {} as Record<string, number>, error: e instanceof Error ? e.message : String(e) };
    }
  }, [oddsText, betType]);

  const planOptions = useMemo(
    () => ({ betType, minEdge, marketBlend, maxTickets, fraction: kellyFraction }),
    [betType, minEdge, marketBlend, maxTickets, kellyFraction]
  );

  const plan = useMemo<{ value: BetPlan | null; error: string | null }>(() => {
    if (!parsedCard.card) return { value: null, error: null };
    try {
      return {
        value: buildBetPlan(parsedCard.card, { [betType]: parsedOdds.odds }, { ...planOptions, bankroll }),
        error: null,
      };
    } catch (e) {
      return { value: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [parsedCard.card, parsedOdds.odds, planOptions, bankroll, betType]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">競艇 期待値ツール</h1>
          <Link href="/" className="text-sm text-slate-500 underline">
            タスクボードへ
          </Link>
        </div>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">先に知っておくこと</p>
          <ul className="mt-1 list-disc pl-5">
            <li>舟券は控除率が約25%あります。買い続ける限り、平均では投じた額の約75%しか戻りません。</li>
            <li>
              「高確率で当てる」ことと「利益が出る」ことは別物です。1号艇の単勝は6割近く当たりますが、それでも回収率は1を超えません。
            </li>
            <li>
              このツールは当てるためのものではなく、<strong>オッズが自分の見積もりより甘い買い目だけを買い、
              それ以外を全部見送るため</strong>のものです。多くのレースは「見送り」になります。
            </li>
            <li>使う前に、自分で集めた過去レースで検証してください（下部の検証パネル）。回収率が1を超えないなら賭けないのが正解です。</li>
          </ul>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">1. 出走表</h2>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700"
              onClick={loadSample}
            >
              サンプルレースを入れる（出走表＋オッズ）
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700"
              onClick={() => {
                setDrafts(emptyDrafts());
                setOddsText("");
              }}
            >
              クリア
            </button>
          </div>
        </div>
        <EntryTable drafts={drafts} onChange={setDrafts} />
        {parsedCard.errors.length > 0 ? (
          <ul className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
            {parsedCard.errors.slice(0, 6).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-800">2. オッズ（締切直前のものを使う）</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-600">
            賭式
            <select
              className="ml-2 rounded border border-slate-300 px-2 py-1 text-sm"
              value={betType}
              onChange={(e) => setBetType(e.target.value as BetType)}
            >
              {BET_TYPES.map((b) => (
                <option key={b} value={b}>
                  {BET_TYPE_LABEL[b]}
                </option>
              ))}
            </select>
          </label>
          <span className="text-xs text-slate-500">
            読み取れた点数: {Object.keys(parsedOdds.odds).length}
          </span>
        </div>
        <textarea
          className="h-40 w-full rounded border border-slate-300 p-2 font-mono text-xs"
          value={oddsText}
          onChange={(e) => setOddsText(e.target.value)}
          placeholder={"1点1行で貼り付け\n1-2-3 7.4\n1-3-2 12.1"}
          aria-label="オッズ入力"
        />
        {parsedOdds.error ? (
          <p className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{parsedOdds.error}</p>
        ) : null}
        <p className="text-xs text-slate-500">
          早い時間のオッズで計算すると、締切までに動いて実際には買えない配当で判断することになります。必ず締切直前のオッズを使ってください。
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-800">3. 資金とルール</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField label="資金（円）" value={bankroll} step={10000} min={0} onChange={setBankroll} hint="失っても生活に影響しない額だけ" />
          <NumberField
            label="ケリー係数"
            value={kellyFraction}
            step={0.05}
            min={0.01}
            max={1}
            onChange={setKellyFraction}
            hint="1=フルケリー。確率の推定が甘いと即オーバーベットになるので 0.25 以下推奨"
          />
          <NumberField
            label="最低期待値（−1）"
            value={minEdge}
            step={0.05}
            min={0}
            max={3}
            onChange={setMinEdge}
            hint={`期待値 ${(1 + minEdge).toFixed(2)} 以上の買い目だけ買う`}
          />
          <NumberField
            label="モデルの信用度"
            value={marketBlend}
            step={0.05}
            min={0}
            max={1}
            onChange={setMarketBlend}
            hint="1=モデルだけを信じる / 0=市場（オッズ）だけを信じる"
          />
          <NumberField label="1レースの最大点数" value={maxTickets} step={1} min={1} max={30} onChange={setMaxTickets} hint="点数を増やすほど控除率をそのまま払うことになる" />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-800">4. 判断</h2>
        {plan.error ? (
          <p className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{plan.error}</p>
        ) : plan.value ? (
          <PlanResult plan={plan.value} bankroll={bankroll} />
        ) : (
          <p className="rounded border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            出走表を入力すると判断が表示されます。
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-800">5. 検証（ここが本題）</h2>
        <p className="text-sm text-slate-600">
          上の設定のまま過去レースに適用したら、実際どうだったのかを確かめます。ここで回収率が1を超えないなら、本番でも負けます。
        </p>
        <BacktestPanel bankroll={bankroll} options={planOptions} />
      </section>

      <footer className="border-t border-slate-200 pt-4 text-xs text-slate-500">
        <p>
          舟券が買えるのは20歳以上です。賭けは余剰資金の範囲で。のめり込みや借金に心当たりがある場合は、
          公益社団法人ギャンブル依存症問題を考える会などの相談窓口を利用してください。
        </p>
      </footer>
    </main>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
}

function NumberField({ label, value, onChange, step = 1, min, max, hint }: NumberFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-700">
      <span className="font-medium">{label}</span>
      <input
        type="number"
        className="rounded border border-slate-300 px-2 py-1 tabular-nums"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}
