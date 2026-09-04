import { COURSE_WIN_RATE, courseBaseScores } from "./courseStats";
import {
  DEFAULT_HENERY,
  FEATURE_KEYS,
  featureVector,
  meanExhibitionTime,
  startCourseOf,
  type HeneryExponents,
  type ModelWeights,
} from "./model";
import type { HistoricalRace, Lane } from "./types";

/**
 * 過去レースからモデルの重みを推定する。
 *
 * Plackett–Luce の対数尤度を勾配上昇で最大化する。
 * 「1着に選ばれる確率が exp(score) に比例し、
 *   2着は残りの艇の中で同じ規則で選ばれる」という素直なモデル。
 *
 * 勾配は softmax と同じ形になる:
 *   ∂logL/∂w = Σ_k λ_k ( x_(k着の艇) - Σ_j p_j x_j )
 */
export interface CalibrationOptions {
  /** 何着目まで尤度に使うか。3 なら3連単の並びまで学習する。 */
  depth?: 1 | 2 | 3;
  henery?: HeneryExponents;
  learningRate?: number;
  iterations?: number;
  /** L2 正則化。データが少ないときに重みが暴れるのを抑える。 */
  l2?: number;
  initial?: Partial<ModelWeights>;
  courseBase?: Record<Lane, number>;
  /** 末尾のこの割合を検証用に取り分け、学習には使わない。 */
  validationSplit?: number;
}

export interface CalibrationResult {
  weights: ModelWeights;
  races: number;
  trainRaces: number;
  validationRaces: number;
  /** 1レースあたりの平均対数損失（小さいほど良い）。 */
  trainLogLoss: number;
  validationLogLoss: number | null;
  /** 重みをすべて 0 にした（＝コース別成績だけの）ときの対数損失。これに勝てないモデルは無意味。 */
  baselineLogLoss: number;
  validationBaselineLogLoss: number | null;
  iterations: number;
}

interface RaceSample {
  features: number[][]; // [艇][特徴量]
  base: number[]; // [艇] コース別基準スコア
  order: number[]; // 着順（艇のインデックス）
}

function toSamples(races: readonly HistoricalRace[], courseBase: Record<Lane, number>): RaceSample[] {
  const samples: RaceSample[] = [];
  for (const race of races) {
    if (race.result.voided) continue;
    const entries = race.card.entries;
    if (entries.length !== 6) continue;
    const fieldMean = meanExhibitionTime(entries);
    const laneIndex = new Map(entries.map((e, i) => [e.lane, i]));
    const order = [race.result.first, race.result.second, race.result.third]
      .map((lane) => laneIndex.get(lane))
      .filter((i): i is number => i != null);
    if (order.length < 3 || new Set(order).size !== 3) continue;

    samples.push({
      features: entries.map((e) => {
        const f = featureVector(e, fieldMean);
        return FEATURE_KEYS.map((k) => f[k]);
      }),
      base: entries.map((e) => courseBase[startCourseOf(e)]),
      order,
    });
  }
  return samples;
}

function logLikelihoodAndGradient(
  samples: readonly RaceSample[],
  w: number[],
  depth: number,
  lambdas: number[]
): { logLik: number; grad: number[] } {
  const grad = new Array(w.length).fill(0);
  let logLik = 0;

  for (const s of samples) {
    const scores = s.features.map((f, i) => s.base[i] + f.reduce((sum, x, k) => sum + x * w[k], 0));
    let remaining = scores.map((_, i) => i);

    for (let k = 0; k < depth; k++) {
      const lambda = lambdas[k];
      const scaled = remaining.map((i) => scores[i] * lambda);
      const max = Math.max(...scaled);
      const exps = scaled.map((v) => Math.exp(v - max));
      const denom = exps.reduce((a, b) => a + b, 0);
      const probs = exps.map((e) => e / denom);

      const chosen = s.order[k];
      const chosenPos = remaining.indexOf(chosen);
      logLik += Math.log(Math.max(probs[chosenPos], 1e-300));

      for (let f = 0; f < w.length; f++) {
        let expected = 0;
        remaining.forEach((i, idx) => (expected += probs[idx] * s.features[i][f]));
        grad[f] += lambda * (s.features[chosen][f] - expected);
      }
      remaining = remaining.filter((i) => i !== chosen);
    }
  }
  return { logLik, grad };
}

export function calibrateWeights(
  races: readonly HistoricalRace[],
  options: CalibrationOptions = {}
): CalibrationResult {
  const depth = options.depth ?? 3;
  const henery = options.henery ?? DEFAULT_HENERY;
  const lambdas = [1, henery.second, henery.third].slice(0, depth);
  const learningRate = options.learningRate ?? 0.05;
  const iterations = options.iterations ?? 400;
  const l2 = options.l2 ?? 0.01;
  const courseBase = options.courseBase ?? courseBaseScores(COURSE_WIN_RATE);
  const split = options.validationSplit ?? 0;

  const all = toSamples(races, courseBase);
  if (all.length === 0) {
    throw new Error("学習に使えるレースがありません（確定着順つきの出走表が必要です）");
  }
  const cut = Math.max(1, Math.floor(all.length * (1 - split)));
  const train = all.slice(0, cut);
  const validation = all.slice(cut);

  let w = FEATURE_KEYS.map((k) => options.initial?.[k] ?? 0);
  const velocity = new Array(w.length).fill(0);
  let lr = learningRate;
  let prev = -Infinity;
  let done = 0;

  for (let it = 0; it < iterations; it++) {
    const { logLik, grad } = logLikelihoodAndGradient(train, w, depth, lambdas);
    const penalized = logLik - l2 * w.reduce((s, v) => s + v * v, 0);
    if (penalized < prev) {
      // 行き過ぎ。1歩戻して学習率を落とす。
      w = w.map((v, i) => v - velocity[i]);
      lr *= 0.5;
      velocity.fill(0);
      if (lr < 1e-6) break;
      continue;
    }
    prev = penalized;
    done = it + 1;
    for (let i = 0; i < w.length; i++) {
      velocity[i] = (lr / train.length) * (grad[i] - 2 * l2 * w[i]);
      w[i] += velocity[i];
    }
  }

  const weights = {} as ModelWeights;
  FEATURE_KEYS.forEach((k, i) => (weights[k] = w[i]));

  const zeros = new Array(w.length).fill(0);
  const perRace = (samples: RaceSample[], weightVec: number[]) =>
    samples.length === 0
      ? null
      : -logLikelihoodAndGradient(samples, weightVec, depth, lambdas).logLik / samples.length;

  return {
    weights,
    races: all.length,
    trainRaces: train.length,
    validationRaces: validation.length,
    trainLogLoss: perRace(train, w)!,
    validationLogLoss: perRace(validation, w),
    baselineLogLoss: perRace(train, zeros)!,
    validationBaselineLogLoss: perRace(validation, zeros),
    iterations: done,
  };
}
