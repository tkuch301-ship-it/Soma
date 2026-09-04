import { parseCombo } from "./combo";
import type { Prediction } from "./model";
import type { BetType, Lane } from "./types";

/** オッズ表から算出した市場（払戻プール）の情報。 */
export interface MarketSummary {
  /** Σ(1/オッズ)。控除率のぶんだけ 1 を超える。 */
  overround: number;
  /** 推定控除率。1 - 1/overround。競艇は概ね 0.25 前後。 */
  takeout: number;
  /** オッズが取得できた組番の数 / 全組番数。 */
  coverage: number;
  combos: number;
}

/**
 * オッズ表から市場の含意確率を復元する。
 *
 * 単勝でも3連単でも、オッズは「その組番に賭けられた金額の割合」の裏返しなので、
 * 1/オッズ を正規化したものが市場の予想確率になる。
 * Σ(1/オッズ) が 1 を超えるぶんが控除率（＝胴元の取り分）で、
 * ここが「全部買えば必ず負ける」ことの正体。
 */
export function marketSummary(odds: Record<string, number>, totalCombos: number): MarketSummary {
  const values = Object.values(odds).filter((o) => Number.isFinite(o) && o > 0);
  const overround = values.reduce((sum, o) => sum + 1 / o, 0);
  return {
    overround,
    takeout: overround > 0 ? 1 - 1 / overround : 0,
    coverage: totalCombos > 0 ? values.length / totalCombos : 0,
    combos: values.length,
  };
}

/** オッズ表 → 正規化した市場含意確率。 */
export function impliedProbabilities(odds: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  let sum = 0;
  for (const [key, o] of Object.entries(odds)) {
    if (!Number.isFinite(o) || o <= 0) continue;
    out[key] = 1 / o;
    sum += 1 / o;
  }
  if (sum > 0) for (const key of Object.keys(out)) out[key] /= sum;
  return out;
}

export interface EvOptions {
  /**
   * 予想確率と市場含意確率の混ぜ方。1 = モデルだけ、0 = 市場だけ。
   *
   * 市場（オッズ）は多数の予想が集約されたかなり強い予測なので、
   * モデルを丸ごと信じると「較正ズレ」がそのまま偽の期待値に化ける。
   * 市場側に引き寄せておくと、偽の妙味を掴む頻度が下がる。
   */
  marketBlend?: number;
  /** 買う条件。期待値 = 確率 × オッズ が (1 + minEdge) 以上。 */
  minEdge?: number;
  /** オッズの下限・上限（極端な人気/穴を外す）。 */
  minOdds?: number;
  maxOdds?: number;
  /** 予想確率の下限。確率が低すぎる買い目は分散が大きすぎる。 */
  minProbability?: number;
}

export const DEFAULT_EV_OPTIONS: Required<EvOptions> = {
  marketBlend: 0.5,
  minEdge: 0.15,
  minOdds: 3,
  maxOdds: 300,
  minProbability: 0.005,
};

export interface Candidate {
  betType: BetType;
  key: string;
  lanes: Lane[];
  /** モデルが出した確率。 */
  modelProbability: number;
  /** オッズから逆算した市場の確率。 */
  marketProbability: number;
  /** 実際に期待値計算に使う確率（上2つのブレンド）。 */
  probability: number;
  odds: number;
  /** 期待値（100円あたりの払戻期待。1.0 でトントン）。 */
  expectedValue: number;
  /** 期待値 - 1。プラスなら妙味あり。 */
  edge: number;
}

export interface RaceEvaluation {
  betType: BetType;
  market: MarketSummary;
  /** 条件を満たした買い目（妙味順）。 */
  candidates: Candidate[];
  /** 全組番の評価（デバッグ・表示用、妙味順）。 */
  all: Candidate[];
}

/**
 * 予想 × オッズ → 買い目候補。
 *
 * 幾何ブレンド p ∝ p_model^b × p_market^(1-b) を使う。
 * 対数空間での線形補間なので、どちらかが極端に小さい確率を出したときに
 * 引きずられにくい。
 */
export function evaluateRace(
  prediction: Prediction,
  odds: Record<string, number>,
  options: EvOptions = {}
): RaceEvaluation {
  const opts = { ...DEFAULT_EV_OPTIONS, ...options };
  if (opts.marketBlend < 0 || opts.marketBlend > 1) {
    throw new Error("marketBlend は 0〜1 で指定してください");
  }
  const totalCombos = Object.keys(prediction.combos).length;
  const market = marketSummary(odds, totalCombos);
  const implied = impliedProbabilities(odds);

  const blended: Record<string, number> = {};
  let blendSum = 0;
  for (const [key, pModel] of Object.entries(prediction.combos)) {
    const pMarket = implied[key];
    // オッズ未取得の組番は市場情報がないのでモデル確率をそのまま使う。
    const p =
      pMarket == null || pMarket <= 0
        ? pModel
        : Math.exp(opts.marketBlend * Math.log(Math.max(pModel, 1e-12)) + (1 - opts.marketBlend) * Math.log(pMarket));
    blended[key] = p;
    blendSum += p;
  }

  const all: Candidate[] = [];
  for (const [key, pRaw] of Object.entries(blended)) {
    const o = odds[key];
    if (!Number.isFinite(o) || o <= 0) continue;
    const probability = blendSum > 0 ? pRaw / blendSum : 0;
    const expectedValue = probability * o;
    all.push({
      betType: prediction.betType,
      key,
      lanes: parseCombo(key),
      modelProbability: prediction.combos[key] ?? 0,
      marketProbability: implied[key] ?? 0,
      probability,
      odds: o,
      expectedValue,
      edge: expectedValue - 1,
    });
  }
  all.sort((a, b) => b.edge - a.edge);

  const candidates = all.filter(
    (c) =>
      c.edge >= opts.minEdge &&
      c.odds >= opts.minOdds &&
      c.odds <= opts.maxOdds &&
      c.probability >= opts.minProbability
  );

  return { betType: prediction.betType, market, candidates, all };
}
