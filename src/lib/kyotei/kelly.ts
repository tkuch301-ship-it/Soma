/**
 * 資金配分（ケリー基準）。
 *
 * 「何を買うか」より「いくら賭けるか」で破産するかどうかが決まる。
 * 期待値がプラスの買い目でも、賭けすぎれば資金曲線の中央値はマイナスになる。
 * ここでは同一レース内の複数買い目（＝互いに排反な結果）に対する
 * 対数資産最大化の厳密解を実装する。
 *
 * アルゴリズム: Smoczynski & Tomkins (2010),
 * "An explicit solution to the problem of optimizing the allocations of a
 *  bettor's wealth when wagering on horse races".
 */

export interface KellyOutcome {
  key: string;
  /** 的中確率。 */
  probability: number;
  /** 払戻倍率（賭け金込みのグロス。1.0 が元返し）。 */
  odds: number;
}

export interface KellyAllocation {
  key: string;
  /** 資金に対する賭け金の割合。 */
  fraction: number;
}

/**
 * 排反な結果への同時ケリー配分（フルケリー）。
 *
 * 期待対数資産 Σ_i p_i·log(1 - F + f_i·o_i) + (1 - Σp_i)·log(1 - F) を最大化する。
 * （F = Σf_i。どれも当たらなければ賭けた分をすべて失う。）
 */
export function kellyAllocations(outcomes: readonly KellyOutcome[]): KellyAllocation[] {
  const valid = outcomes.filter(
    (o) => Number.isFinite(o.probability) && o.probability > 0 && Number.isFinite(o.odds) && o.odds > 1
  );
  if (valid.length === 0) return [];

  // 期待値（p×o）の高い順に並べ、上から順に「買う集合」を広げていく。
  const sorted = [...valid].sort((a, b) => b.probability * b.odds - a.probability * a.odds);

  let cumP = 0;
  let cumInvOdds = 0;
  let bestT = 0;
  let bestB = 1; // b は「賭けずに残す資金の割合」。1 なら何も買わない。

  for (let t = 0; t < sorted.length; t++) {
    cumP += sorted[t].probability;
    cumInvOdds += 1 / sorted[t].odds;
    const denom = 1 - cumInvOdds;
    // Σ(1/o) ≥ 1 まで買い目を広げるのは「全通り買い」に等しく、解にならない。
    if (denom <= 0) break;
    const b = (1 - cumP) / denom;
    if (sorted[t].probability * sorted[t].odds > b) {
      bestT = t + 1;
      bestB = b;
    } else {
      break;
    }
  }

  if (bestT === 0) return [];

  const out: KellyAllocation[] = [];
  for (let i = 0; i < bestT; i++) {
    const f = sorted[i].probability - bestB / sorted[i].odds;
    if (f > 0) out.push({ key: sorted[i].key, fraction: f });
  }
  return out;
}

/** 期待対数資産（配分の検算・テスト用）。 */
export function expectedLogWealth(
  outcomes: readonly KellyOutcome[],
  fractions: readonly number[]
): number {
  const total = fractions.reduce((a, b) => a + b, 0);
  const reserve = 1 - total;
  if (reserve < 0) return Number.NEGATIVE_INFINITY;
  let missProb = 1;
  let sum = 0;
  outcomes.forEach((o, i) => {
    const wealth = reserve + fractions[i] * o.odds;
    if (wealth <= 0) {
      sum = Number.NEGATIVE_INFINITY;
      return;
    }
    sum += o.probability * Math.log(wealth);
    missProb -= o.probability;
  });
  if (!Number.isFinite(sum)) return Number.NEGATIVE_INFINITY;
  if (missProb > 0) {
    if (reserve <= 0) return Number.NEGATIVE_INFINITY;
    sum += missProb * Math.log(reserve);
  }
  return sum;
}

export interface StakingOptions {
  /**
   * ケリー係数。1 = フルケリー。
   *
   * フルケリーは長期成長率は最大だが、資金が半分になる場面が普通に来る。
   * しかも確率の推定を少しでも上振れさせているとフルケリーは即オーバーベットになる。
   * 予想確率に自信がない前提なら 1/4 以下が現実的。
   */
  fraction?: number;
  /** 1レースで賭ける上限（資金比）。 */
  maxRaceFraction?: number;
  /** 1点あたりの上限（資金比）。 */
  maxTicketFraction?: number;
  /** 舟券の最低単位（円）。 */
  unit?: number;
  /** 1点あたりの最低購入額（円）。これに満たない点は買わない。 */
  minTicket?: number;
}

export const DEFAULT_STAKING: Required<StakingOptions> = {
  fraction: 0.25,
  maxRaceFraction: 0.05,
  maxTicketFraction: 0.02,
  unit: 100,
  minTicket: 100,
};

export interface Stake {
  key: string;
  /** 購入金額（円、unit の倍数）。 */
  amount: number;
  /** 資金に対する割合（丸め後の実効値）。 */
  fraction: number;
}

/**
 * ケリー配分 → 実際の購入金額（100円単位）。
 * 端数は必ず切り捨て、上限を超えないようにする。
 */
export function sizeStakes(
  outcomes: readonly KellyOutcome[],
  bankroll: number,
  options: StakingOptions = {}
): Stake[] {
  const opts = { ...DEFAULT_STAKING, ...options };
  if (!(bankroll > 0)) return [];

  const raw = kellyAllocations(outcomes);
  if (raw.length === 0) return [];

  // ケリー係数と1点あたり上限を適用。
  let scaled = raw.map((a) => ({
    key: a.key,
    fraction: Math.min(a.fraction * opts.fraction, opts.maxTicketFraction),
  }));

  // レース全体の上限を超えていたら比例縮小。
  const total = scaled.reduce((sum, a) => sum + a.fraction, 0);
  if (total > opts.maxRaceFraction) {
    const shrink = opts.maxRaceFraction / total;
    scaled = scaled.map((a) => ({ key: a.key, fraction: a.fraction * shrink }));
  }

  const stakes: Stake[] = [];
  for (const a of scaled) {
    const amount = Math.floor((a.fraction * bankroll) / opts.unit) * opts.unit;
    if (amount < opts.minTicket) continue;
    stakes.push({ key: a.key, amount, fraction: amount / bankroll });
  }
  return stakes;
}
