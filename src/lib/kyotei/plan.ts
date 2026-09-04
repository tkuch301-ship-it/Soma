import { allCombos, isHit } from "./combo";
import { DEFAULT_EV_OPTIONS, evaluateRace, type Candidate, type EvOptions, type RaceEvaluation } from "./ev";
import { DEFAULT_STAKING, sizeStakes, type StakingOptions } from "./kelly";
import { DEFAULT_HENERY, predict, type HeneryExponents, type Prediction, type ScoreOptions } from "./model";
import type { BetType, Lane, OddsBoard, RaceCard, RaceResult } from "./types";

export interface PlanOptions extends ScoreOptions, EvOptions, StakingOptions {
  betType?: BetType;
  henery?: HeneryExponents;
  /** 現在の資金（円）。 */
  bankroll: number;
  /** 1レースで買う点数の上限。点数を増やすほど控除率をそのまま払うことになる。 */
  maxTickets?: number;
  /** オッズ取得率がこれ未満なら、市場が読めないので見送る。 */
  minOddsCoverage?: number;
}

export const DEFAULT_PLAN_OPTIONS = {
  betType: "trifecta" as BetType,
  maxTickets: 6,
  minOddsCoverage: 0.8,
};

export interface Ticket {
  key: string;
  lanes: Lane[];
  amount: number;
  odds: number;
  probability: number;
  expectedValue: number;
  /** 的中したときの払戻（円）。 */
  payoutIfHit: number;
}

export interface BetPlan {
  betType: BetType;
  prediction: Prediction;
  evaluation: RaceEvaluation;
  tickets: Ticket[];
  totalStake: number;
  /** 買った点のうち少なくとも1点が当たる確率。 */
  hitProbability: number;
  /** 払戻の期待値（円）。 */
  expectedReturn: number;
  /** 期待収支（円）。マイナスなら買ってはいけない。 */
  expectedProfit: number;
  /** true なら「このレースは買わない」。 */
  skip: boolean;
  /** 判断の理由（表示用）。 */
  reasons: string[];
}

/**
 * 出走表 + オッズ + 資金 → 買い目プラン。
 *
 * 期待値がしきい値を超える買い目が1点も無ければ `skip: true`（見送り）になる。
 * 見送りは負けではなく、控除率25%の支払いを回避した「利益」であることに注意。
 */
export function buildBetPlan(card: RaceCard, oddsBoard: OddsBoard, options: PlanOptions): BetPlan {
  const betType = options.betType ?? DEFAULT_PLAN_OPTIONS.betType;
  const maxTickets = options.maxTickets ?? DEFAULT_PLAN_OPTIONS.maxTickets;
  const minCoverage = options.minOddsCoverage ?? DEFAULT_PLAN_OPTIONS.minOddsCoverage;
  const henery = options.henery ?? DEFAULT_HENERY;
  const odds = oddsBoard[betType] ?? {};

  const prediction = predict(card, betType, { ...options, henery });
  const evaluation = evaluateRace(prediction, odds, options);
  const reasons: string[] = [];

  const totalCombos = allCombos(betType).length;
  if (evaluation.market.combos === 0) {
    return skipPlan(betType, prediction, evaluation, [`${betType} のオッズが1点も入力されていません`]);
  }
  if (evaluation.market.coverage < minCoverage) {
    reasons.push(
      `オッズ取得率 ${(evaluation.market.coverage * 100).toFixed(0)}%（${evaluation.market.combos}/${totalCombos}点）が下限 ${(minCoverage * 100).toFixed(0)}% 未満`
    );
    return skipPlan(betType, prediction, evaluation, reasons);
  }
  if (evaluation.candidates.length === 0) {
    const best = evaluation.all[0];
    reasons.push(
      best
        ? `期待値がしきい値 ${(1 + (options.minEdge ?? DEFAULT_EV_OPTIONS.minEdge)).toFixed(2)} を超える買い目なし（最良でも ${best.key} の ${best.expectedValue.toFixed(2)}）`
        : "評価できる買い目がありません"
    );
    return skipPlan(betType, prediction, evaluation, reasons);
  }

  const selected: Candidate[] = evaluation.candidates.slice(0, maxTickets);
  const stakes = sizeStakes(
    selected.map((c) => ({ key: c.key, probability: c.probability, odds: c.odds })),
    options.bankroll,
    options
  );

  if (stakes.length === 0) {
    reasons.push(
      `妙味のある買い目はあるが、ケリー基準では資金 ${options.bankroll.toLocaleString()}円 に対して最低単位 ${(options.minTicket ?? DEFAULT_STAKING.minTicket).toLocaleString()}円 に届かない`
    );
    return skipPlan(betType, prediction, evaluation, reasons);
  }

  const byKey = new Map(selected.map((c) => [c.key, c]));
  const tickets: Ticket[] = stakes.map((s) => {
    const c = byKey.get(s.key)!;
    return {
      key: c.key,
      lanes: c.lanes,
      amount: s.amount,
      odds: c.odds,
      probability: c.probability,
      expectedValue: c.expectedValue,
      payoutIfHit: Math.floor(s.amount * c.odds),
    };
  });

  const totalStake = tickets.reduce((sum, t) => sum + t.amount, 0);
  const expectedReturn = tickets.reduce((sum, t) => sum + t.probability * t.payoutIfHit, 0);
  const hitProbability = tickets.reduce((sum, t) => sum + t.probability, 0);

  reasons.push(
    `期待値 ${(expectedReturn / totalStake).toFixed(2)} の買い目を ${tickets.length}点（的中確率 ${(hitProbability * 100).toFixed(1)}%）`
  );
  reasons.push(`このレースの推定控除率 ${(evaluation.market.takeout * 100).toFixed(1)}%`);

  return {
    betType,
    prediction,
    evaluation,
    tickets,
    totalStake,
    hitProbability,
    expectedReturn,
    expectedProfit: expectedReturn - totalStake,
    skip: false,
    reasons,
  };
}

function skipPlan(
  betType: BetType,
  prediction: Prediction,
  evaluation: RaceEvaluation,
  reasons: string[]
): BetPlan {
  return {
    betType,
    prediction,
    evaluation,
    tickets: [],
    totalStake: 0,
    hitProbability: 0,
    expectedReturn: 0,
    expectedProfit: 0,
    skip: true,
    reasons: [...reasons, "→ 見送り（控除率25%を払わずに済むので、見送りは損ではない）"],
  };
}

export interface Settlement {
  staked: number;
  payout: number;
  profit: number;
  hitKeys: string[];
}

/** プランを確定着順で精算する。 */
export function settlePlan(plan: BetPlan, result: RaceResult): Settlement {
  const finish: Lane[] = [result.first, result.second, result.third];
  let payout = 0;
  const hitKeys: string[] = [];
  for (const t of plan.tickets) {
    if (isHit(plan.betType, t.key, finish)) {
      payout += t.payoutIfHit;
      hitKeys.push(t.key);
    }
  }
  return { staked: plan.totalStake, payout, profit: payout - plan.totalStake, hitKeys };
}
