import { allCombos, comboKey, permutationsOf } from "./combo";
import { COURSE_WIN_RATE, courseBaseScores } from "./courseStats";
import {
  BET_TYPE_ORDERED,
  BET_TYPE_SIZE,
  LANES,
  type BetType,
  type Entry,
  type Lane,
  type RaceCard,
} from "./types";

/** モデルが使う説明変数。 */
export const FEATURE_KEYS = [
  "nationalWinRate",
  "localWinRate",
  "motor2nd",
  "boat2nd",
  "startTiming",
  "klass",
  "exhibition",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type ModelWeights = Record<FeatureKey, number>;

/**
 * 既定の重み。
 *
 * 【重要】これは「もっともらしい事前分布」であって、実データで当てはめた値ではない。
 * 実際に賭ける前に `calibrateWeights()` で自分が集めた履歴に当てはめること。
 * 未較正の重みで出した確率は、期待値計算の土台としては信用できない。
 */
export const DEFAULT_WEIGHTS: ModelWeights = {
  nationalWinRate: 0.35,
  localWinRate: 0.12,
  motor2nd: 0.25,
  boat2nd: 0.08,
  startTiming: 0.8,
  klass: 0.25,
  exhibition: 0.5,
};

/**
 * 2着・3着を引くときにスコアを鈍らせる指数（Henery モデル）。
 *
 * 素の Plackett–Luce（λ=1）は「強い艇が2着3着にも入る確率」を過大評価する。
 * λ<1 にすると後ろの着順ほど実力差の影響が薄まり、実測の3連単配当分布に近づく。
 */
export interface HeneryExponents {
  second: number;
  third: number;
}

export const DEFAULT_HENERY: HeneryExponents = { second: 0.81, third: 0.65 };

const KLASS_POINT: Record<Entry["klass"], number> = {
  A1: 1,
  A2: 0.34,
  B1: -0.34,
  B2: -1,
};

/** 全国平均のおおよその基準値。特徴量はここからの差分にして単位を揃える。 */
const REFERENCE = {
  winRate: 5.5,
  motor2nd: 35,
  boat2nd: 35,
  startTiming: 0.16,
};

/** 進入コース（前付けがなければ枠なり）。 */
export function startCourseOf(entry: Entry): Lane {
  return entry.startCourse ?? entry.lane;
}

/**
 * 1艇ぶんの特徴量ベクトル。
 * 展示タイムはレースごとに水面・気象で水準が動くので、
 * そのレースの平均からの差（速いほどプラス）として扱う。
 */
export function featureVector(entry: Entry, fieldMeanExhibition: number | null): ModelWeights {
  const exhibition =
    fieldMeanExhibition != null && entry.exhibitionTime != null
      ? (fieldMeanExhibition - entry.exhibitionTime) * 10
      : 0;
  return {
    nationalWinRate: entry.nationalWinRate - REFERENCE.winRate,
    localWinRate: entry.localWinRate - REFERENCE.winRate,
    motor2nd: (entry.motor2nd - REFERENCE.motor2nd) / 10,
    boat2nd: (entry.boat2nd - REFERENCE.boat2nd) / 10,
    startTiming: (REFERENCE.startTiming - entry.avgStartTiming) * 10,
    klass: KLASS_POINT[entry.klass],
    exhibition,
  };
}

/** レース内の展示タイム平均（未取得の艇は除外。全艇未取得なら null）。 */
export function meanExhibitionTime(entries: readonly Entry[]): number | null {
  const times = entries
    .map((e) => e.exhibitionTime)
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t));
  if (times.length === 0) return null;
  return times.reduce((a, b) => a + b, 0) / times.length;
}

export interface ScoreOptions {
  weights?: ModelWeights;
  /** コース別基準スコア。既定は全国平均のコース別1着率から作る。 */
  courseBase?: Record<Lane, number>;
}

export interface LaneScore {
  lane: Lane;
  startCourse: Lane;
  score: number;
  features: ModelWeights;
}

/** 出走表 → 各艇の強さスコア（対数スケール）。 */
export function scoreRace(card: RaceCard, options: ScoreOptions = {}): LaneScore[] {
  validateCard(card);
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const courseBase = options.courseBase ?? courseBaseScores(COURSE_WIN_RATE);
  const fieldMean = meanExhibitionTime(card.entries);

  return card.entries.map((entry) => {
    const features = featureVector(entry, fieldMean);
    let score = courseBase[startCourseOf(entry)];
    for (const key of FEATURE_KEYS) score += weights[key] * features[key];
    return { lane: entry.lane, startCourse: startCourseOf(entry), score, features };
  });
}

export function validateCard(card: RaceCard): void {
  if (!card || !Array.isArray(card.entries) || card.entries.length !== 6) {
    throw new Error("出走表は6艇ぶん必要です");
  }
  const lanes = new Set(card.entries.map((e) => e.lane));
  if (lanes.size !== 6) throw new Error("枠番 1〜6 が重複なく必要です");
  const courses = new Set(card.entries.map(startCourseOf));
  if (courses.size !== 6) throw new Error("進入コース 1〜6 が重複なく必要です");
  for (const e of card.entries) {
    for (const [label, value] of [
      ["全国勝率", e.nationalWinRate],
      ["当地勝率", e.localWinRate],
      ["モーター2連対率", e.motor2nd],
      ["ボート2連対率", e.boat2nd],
      ["平均ST", e.avgStartTiming],
    ] as const) {
      if (!Number.isFinite(value)) throw new Error(`${label}が数値ではありません (枠${e.lane})`);
    }
  }
}

/** softmax。lambda はスコアを鈍らせる指数（Henery）。 */
function softmax(scores: readonly number[], indices: readonly number[], lambda: number): number[] {
  const scaled = indices.map((i) => scores[i] * lambda);
  const max = Math.max(...scaled);
  const exps = scaled.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/**
 * 着順（順列）ごとの確率。depth=1 なら単勝、2 なら2連単、3 なら3連単。
 * 逐次選択（Plackett–Luce）で、k 着目の抽選には lambda_k を掛けたスコアを使う。
 */
export function finishOrderProbabilities(
  scores: readonly LaneScore[],
  depth: 1 | 2 | 3,
  henery: HeneryExponents = DEFAULT_HENERY
): Map<string, number> {
  const raw = scores.map((s) => s.score);
  const lanes = scores.map((s) => s.lane);
  const lambdas = [1, henery.second, henery.third];
  const out = new Map<string, number>();

  const walk = (chosen: number[], remaining: number[], prob: number) => {
    if (chosen.length === depth) {
      out.set(chosen.map((i) => lanes[i]).join("-"), prob);
      return;
    }
    const probs = softmax(raw, remaining, lambdas[chosen.length]);
    remaining.forEach((idx, k) => {
      walk(
        [...chosen, idx],
        remaining.filter((r) => r !== idx),
        prob * probs[k]
      );
    });
  };
  walk(
    [],
    raw.map((_, i) => i),
    1
  );
  return out;
}

/** 各艇の1着確率（枠番 → 確率）。 */
export function winProbabilities(scores: readonly LaneScore[]): Record<Lane, number> {
  const probs = softmax(
    scores.map((s) => s.score),
    scores.map((_, i) => i),
    1
  );
  const out = {} as Record<Lane, number>;
  LANES.forEach((lane) => (out[lane] = 0));
  scores.forEach((s, i) => (out[s.lane] = probs[i]));
  return out;
}

/** 賭式ごとの全組番の確率（合計 1）。 */
export function comboProbabilities(
  scores: readonly LaneScore[],
  betType: BetType,
  henery: HeneryExponents = DEFAULT_HENERY
): Record<string, number> {
  const size = BET_TYPE_SIZE[betType];
  const ordered = finishOrderProbabilities(scores, size, henery);
  const out: Record<string, number> = {};

  if (BET_TYPE_ORDERED[betType]) {
    for (const [key, p] of ordered) out[key] = p;
    return out;
  }
  // 順序なしの賭式は、対応する順列の確率を足し合わせる。
  for (const combo of allCombos(betType)) {
    let p = 0;
    for (const perm of permutationsOf(combo)) p += ordered.get(perm.join("-")) ?? 0;
    out[comboKey(betType, combo)] = p;
  }
  return out;
}

/** 出走表からまとめて予測を作る。 */
export interface Prediction {
  scores: LaneScore[];
  winProbability: Record<Lane, number>;
  combos: Record<string, number>;
  betType: BetType;
}

export function predict(
  card: RaceCard,
  betType: BetType = "trifecta",
  options: ScoreOptions & { henery?: HeneryExponents } = {}
): Prediction {
  const scores = scoreRace(card, options);
  return {
    scores,
    winProbability: winProbabilities(scores),
    combos: comboProbabilities(scores, betType, options.henery ?? DEFAULT_HENERY),
    betType,
  };
}
