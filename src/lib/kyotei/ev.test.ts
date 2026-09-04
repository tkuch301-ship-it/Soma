import { describe, it, expect } from "vitest";
import { evaluateRace, impliedProbabilities, marketSummary } from "./ev";
import { predict } from "./model";
import { syntheticOdds } from "./odds";
import { LANES, type Entry, type Lane, type RaceCard } from "./types";

function averageCard(): RaceCard {
  const entry = (lane: Lane): Entry => ({
    lane,
    klass: "B1",
    nationalWinRate: 5.5,
    localWinRate: 5.5,
    motor2nd: 35,
    boat2nd: 35,
    avgStartTiming: 0.16,
    exhibitionTime: 6.75,
  });
  return { entries: LANES.map(entry) };
}

describe("marketSummary", () => {
  it("オッズ表から控除率を復元できる", () => {
    const prediction = predict(averageCard());
    const odds = syntheticOdds(prediction.combos, 0.25, false);
    const summary = marketSummary(odds, 120);
    expect(summary.takeout).toBeCloseTo(0.25, 6);
    expect(summary.overround).toBeCloseTo(1 / 0.75, 6);
    expect(summary.coverage).toBe(1);
  });

  it("一部しかオッズが無ければ取得率が下がる", () => {
    const summary = marketSummary({ "1-2-3": 7.4, "1-3-2": 12.1 }, 120);
    expect(summary.coverage).toBeCloseTo(2 / 120, 6);
  });
});

describe("impliedProbabilities", () => {
  it("1/オッズ を正規化した値になる", () => {
    const implied = impliedProbabilities({ a: 2, b: 4, c: 4 });
    expect(implied.a).toBeCloseTo(0.5, 10);
    expect(implied.b).toBeCloseTo(0.25, 10);
    expect(Object.values(implied).reduce((x, y) => x + y, 0)).toBeCloseTo(1, 10);
  });
});

describe("evaluateRace", () => {
  const prediction = predict(averageCard());

  it("モデルと市場が一致していると、どの買い目も期待値0.75（＝控除率ぶんの負け）になる", () => {
    const odds = syntheticOdds(prediction.combos, 0.25, false);
    const evaluation = evaluateRace(prediction, odds, { marketBlend: 1 });
    for (const c of evaluation.all) expect(c.expectedValue).toBeCloseTo(0.75, 6);
    // 妙味のある買い目は1点も無い＝見送るべきレース。
    expect(evaluation.candidates).toHaveLength(0);
  });

  it("オッズが甘い買い目だけが候補に挙がる", () => {
    const odds = syntheticOdds(prediction.combos, 0.25, false);
    odds["3-1-2"] *= 2; // この1点だけ市場が過小評価している状況
    const evaluation = evaluateRace(prediction, odds, { marketBlend: 1, minOdds: 0, minProbability: 0 });
    expect(evaluation.candidates).toHaveLength(1);
    expect(evaluation.candidates[0].key).toBe("3-1-2");
    expect(evaluation.candidates[0].expectedValue).toBeCloseTo(1.5, 6);
  });

  it("オッズ・確率のしきい値で候補を絞れる", () => {
    const odds = syntheticOdds(prediction.combos, 0.25, false);
    odds["3-1-2"] *= 2;
    const tooTight = evaluateRace(prediction, odds, { marketBlend: 1, minEdge: 0.8 });
    expect(tooTight.candidates).toHaveLength(0);

    const oddsCapped = evaluateRace(prediction, odds, { marketBlend: 1, maxOdds: 5 });
    expect(oddsCapped.candidates.every((c) => c.odds <= 5)).toBe(true);
  });

  it("marketBlend を下げると確率が市場側に寄り、妙味が小さく見積もられる", () => {
    const odds = syntheticOdds(prediction.combos, 0.25, false);
    odds["3-1-2"] *= 2;
    const pure = evaluateRace(prediction, odds, { marketBlend: 1, minOdds: 0, minProbability: 0 });
    const shrunk = evaluateRace(prediction, odds, { marketBlend: 0.5, minOdds: 0, minProbability: 0 });
    const pureEdge = pure.all.find((c) => c.key === "3-1-2")!.edge;
    const shrunkEdge = shrunk.all.find((c) => c.key === "3-1-2")!.edge;
    expect(shrunkEdge).toBeLessThan(pureEdge);
  });

  it("marketBlend=0 なら市場そのものなので、期待値は一律に控除率ぶんだけ負ける", () => {
    const odds = syntheticOdds(prediction.combos, 0.25, false);
    const evaluation = evaluateRace(prediction, odds, { marketBlend: 0 });
    for (const c of evaluation.all) expect(c.expectedValue).toBeCloseTo(0.75, 6);
  });

  it("marketBlend が範囲外ならエラー", () => {
    expect(() => evaluateRace(prediction, {}, { marketBlend: 1.5 })).toThrow(/0〜1/);
  });
});
