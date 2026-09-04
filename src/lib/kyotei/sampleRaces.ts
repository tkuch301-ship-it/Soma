import { comboKey } from "./combo";
import { COURSE_WIN_RATE, courseBaseScores } from "./courseStats";
import { DEFAULT_HENERY, FEATURE_KEYS, featureVector, meanExhibitionTime, type LaneScore, type ModelWeights } from "./model";
import { finishOrderProbabilities } from "./model";
import { makeRng } from "./montecarlo";
import { syntheticOdds } from "./odds";
import { LANES, type Entry, type HistoricalRace, type Lane, type RaceCard, type RacerClass } from "./types";

/**
 * デモ・テスト用の人工レースデータ。
 *
 * 【重要】これは実際のレース結果ではない。既知の「真のモデル」から乱数で作った合成データで、
 * 動作確認とUIのデモにしか使えない。
 * ここでのバックテスト結果は「このツールが儲かる証拠」には一切ならない。
 * 本気で使うなら、公式の出走表・締切直前オッズ・確定着順を自分で集めて差し替えること。
 */

const KLASSES: RacerClass[] = ["A1", "A2", "B1", "B2"];

/** データ生成に使う「真の」重み。推定側の DEFAULT_WEIGHTS とは意図的に少しずらしてある。 */
export const TRUE_WEIGHTS: ModelWeights = {
  nationalWinRate: 0.42,
  localWinRate: 0.1,
  motor2nd: 0.3,
  boat2nd: 0.05,
  startTiming: 0.95,
  klass: 0.2,
  exhibition: 0.55,
};

function gaussian(rng: () => number, mean: number, sd: number): number {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function makeEntry(rng: () => number, lane: Lane): Entry {
  const klass = KLASSES[Math.floor(rng() * KLASSES.length)];
  const klassBase = { A1: 6.8, A2: 5.9, B1: 5.0, B2: 4.1 }[klass];
  const national = Math.max(1, gaussian(rng, klassBase, 0.55));
  return {
    lane,
    klass,
    racerName: `選手${lane}`,
    nationalWinRate: Number(national.toFixed(2)),
    localWinRate: Number(Math.max(1, gaussian(rng, national, 0.7)).toFixed(2)),
    motor2nd: Number(Math.max(5, gaussian(rng, 35, 8)).toFixed(1)),
    boat2nd: Number(Math.max(5, gaussian(rng, 35, 8)).toFixed(1)),
    avgStartTiming: Number(Math.max(0.05, gaussian(rng, 0.16, 0.02)).toFixed(2)),
    exhibitionTime: Number(gaussian(rng, 6.75, 0.06).toFixed(2)),
  };
}

export function makeSampleCard(seed = 1, meta: Partial<RaceCard> = {}): RaceCard {
  const rng = makeRng(seed);
  return {
    id: `sample-${seed}`,
    venue: "サンプル場",
    raceNumber: 1,
    ...meta,
    entries: LANES.map((lane) => makeEntry(rng, lane)),
  };
}

export interface SyntheticOptions {
  /** 控除率。 */
  takeout?: number;
  /**
   * 市場のゆがみ（本命‑穴バイアス）。1 なら市場＝真の確率。
   * 1 未満だと穴が買われすぎ（穴のオッズが実力より低く、本命のオッズが甘くなる）。
   */
  marketBias?: number;
  /** 市場のランダムなブレの大きさ。 */
  marketNoise?: number;
  /** モデルからは見えない要因（当日の調整・展開など）の大きさ。 */
  hiddenFactor?: number;
}

/**
 * 人工の過去レース列を作る。真の確率 → 着順を抽選し、
 * 真の確率をゆがめたものを「市場のオッズ」にする。
 */
export function generateSyntheticRaces(
  count: number,
  seed = 42,
  options: SyntheticOptions = {}
): HistoricalRace[] {
  const { takeout = 0.25, marketBias = 0.9, marketNoise = 0.12, hiddenFactor = 0.35 } = options;
  const rng = makeRng(seed);
  const courseBase = courseBaseScores(COURSE_WIN_RATE);
  const races: HistoricalRace[] = [];

  for (let i = 0; i < count; i++) {
    const card: RaceCard = {
      id: `synthetic-${i + 1}`,
      venue: "サンプル場",
      date: "2026-01-01",
      raceNumber: (i % 12) + 1,
      entries: LANES.map((lane) => makeEntry(rng, lane)),
    };

    const fieldMean = meanExhibitionTime(card.entries);
    const scores: LaneScore[] = card.entries.map((entry) => {
      const features = featureVector(entry, fieldMean);
      let score = courseBase[entry.lane];
      for (const k of FEATURE_KEYS) score += TRUE_WEIGHTS[k] * features[k];
      // モデルが観測できない当日要因。これがあるから予想は完璧にならない。
      score += gaussian(rng, 0, hiddenFactor);
      return { lane: entry.lane, startCourse: entry.lane, score, features };
    });

    const trueProbs = finishOrderProbabilities(scores, 3, DEFAULT_HENERY);

    // 真の確率から着順を1つ抽選する。
    const draw = rng();
    let acc = 0;
    let finishKey = "1-2-3";
    for (const [key, p] of trueProbs) {
      acc += p;
      if (draw <= acc) {
        finishKey = key;
        break;
      }
    }
    const finish = finishKey.split("-").map(Number) as Lane[];

    // 市場: 真の確率を p^bias でゆがめ、ノイズを乗せてから正規化。
    const marketRaw: Record<string, number> = {};
    let sum = 0;
    for (const [key, p] of trueProbs) {
      const v = Math.pow(p, marketBias) * Math.exp(gaussian(rng, 0, marketNoise));
      marketRaw[key] = v;
      sum += v;
    }
    for (const key of Object.keys(marketRaw)) marketRaw[key] /= sum;

    races.push({
      card,
      odds: { trifecta: syntheticOdds(marketRaw, takeout) },
      result: {
        first: finish[0],
        second: finish[1],
        third: finish[2],
      },
    });
  }
  return races;
}

/** UI の初期表示に使う1レース分のサンプル（出走表 + 3連単オッズ）。 */
export function sampleRaceWithOdds(seed = 7): { card: RaceCard; odds: Record<string, number> } {
  const [race] = generateSyntheticRaces(1, seed);
  return { card: { ...race.card, id: `sample-${seed}`, venue: "サンプル場" }, odds: race.odds.trifecta ?? {} };
}

/** 組番文字列（表示用）。 */
export function formatCombo(lanes: readonly Lane[], ordered = true): string {
  return ordered ? lanes.join("-") : comboKey("trio", lanes as Lane[]);
}
