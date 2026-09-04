import { buildBetPlan, settlePlan, type PlanOptions } from "./plan";
import type { HistoricalRace } from "./types";

export interface BacktestOptions extends Omit<PlanOptions, "bankroll"> {
  /** 初期資金（円）。 */
  startingBankroll: number;
  /** true なら資金の増減に応じて賭け金も変える（複利）。false なら初期資金固定。 */
  compound?: boolean;
  /** 資金がこれを下回ったら破産として打ち切る（円）。 */
  ruinBankroll?: number;
}

export interface BacktestRow {
  index: number;
  raceId: string;
  skipped: boolean;
  tickets: number;
  staked: number;
  payout: number;
  profit: number;
  bankroll: number;
  hitKeys: string[];
}

export interface BacktestSummary {
  races: number;
  betRaces: number;
  skippedRaces: number;
  tickets: number;
  staked: number;
  payout: number;
  profit: number;
  /** 回収率（払戻 / 投票額）。1.0 でトントン。控除率のせいで無策なら 0.75 に収束する。 */
  roi: number;
  /** 賭けたレースのうち的中したレースの割合。 */
  hitRate: number;
  startingBankroll: number;
  finalBankroll: number;
  maxDrawdown: number;
  ruined: boolean;
  /**
   * 回収率の標準誤差と t 値。
   *
   * |t| が 2 を超えていなければ「勝てている」とは言えない。
   * 舟券の収支は分散が非常に大きいので、数百レース程度のプラスは普通に偶然で出る。
   */
  roiStandardError: number;
  tStat: number;
  /** 今の1レースあたりの優位性を統計的に確認するのに必要な、おおよそのレース数。 */
  racesForSignificance: number | null;
}

export interface BacktestResult {
  rows: BacktestRow[];
  summary: BacktestSummary;
}

/**
 * 過去レースでの検証。
 *
 * ここで回収率が 1.0 を超えないなら、そのモデル・そのしきい値では
 * 本番でも負ける。オッズは締切直前の実オッズを使うこと
 * （早い時間のオッズで検証すると、実際には買えない配当で勝ったことになる）。
 */
export function backtest(races: readonly HistoricalRace[], options: BacktestOptions): BacktestResult {
  const compound = options.compound ?? true;
  const ruinBankroll = options.ruinBankroll ?? 0;

  let bankroll = options.startingBankroll;
  let peak = bankroll;
  let maxDrawdown = 0;
  let ruined = false;

  const rows: BacktestRow[] = [];
  const perRaceReturn: number[] = []; // 賭けたレースの (払戻 - 投票額) / 投票額

  races.forEach((race, index) => {
    const raceId = race.card.id ?? `${race.card.date ?? ""}#${race.card.raceNumber ?? index + 1}`;
    if (ruined || race.result.voided) {
      rows.push({ index, raceId, skipped: true, tickets: 0, staked: 0, payout: 0, profit: 0, bankroll, hitKeys: [] });
      return;
    }

    const plan = buildBetPlan(race.card, race.odds, {
      ...options,
      bankroll: compound ? bankroll : options.startingBankroll,
    });
    const settlement = plan.skip
      ? { staked: 0, payout: 0, profit: 0, hitKeys: [] as string[] }
      : settlePlan(plan, race.result);

    bankroll += settlement.profit;
    if (settlement.staked > 0) perRaceReturn.push(settlement.profit / settlement.staked);

    peak = Math.max(peak, bankroll);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - bankroll) / peak : 0);
    if (bankroll <= ruinBankroll) ruined = true;

    rows.push({
      index,
      raceId,
      skipped: plan.skip,
      tickets: plan.tickets.length,
      staked: settlement.staked,
      payout: settlement.payout,
      profit: settlement.profit,
      bankroll,
      hitKeys: settlement.hitKeys,
    });
  });

  const betRows = rows.filter((r) => r.staked > 0);
  const staked = betRows.reduce((s, r) => s + r.staked, 0);
  const payout = betRows.reduce((s, r) => s + r.payout, 0);
  const hits = betRows.filter((r) => r.hitKeys.length > 0).length;
  const roi = staked > 0 ? payout / staked : 0;

  const n = perRaceReturn.length;
  const mean = n > 0 ? perRaceReturn.reduce((a, b) => a + b, 0) / n : 0;
  const variance =
    n > 1 ? perRaceReturn.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const roiStandardError = n > 0 ? sd / Math.sqrt(n) : 0;
  const tStat = roiStandardError > 0 ? mean / roiStandardError : 0;
  // t = 2 に届くのに必要なサンプル数: n* = (2·sd/mean)^2
  const racesForSignificance =
    mean > 0 && sd > 0 ? Math.ceil((2 * sd / mean) ** 2) : null;

  return {
    rows,
    summary: {
      races: rows.length,
      betRaces: betRows.length,
      skippedRaces: rows.length - betRows.length,
      tickets: betRows.reduce((s, r) => s + r.tickets, 0),
      staked,
      payout,
      profit: payout - staked,
      roi,
      hitRate: betRows.length > 0 ? hits / betRows.length : 0,
      startingBankroll: options.startingBankroll,
      finalBankroll: bankroll,
      maxDrawdown,
      ruined,
      roiStandardError,
      tStat,
      racesForSignificance,
    },
  };
}
