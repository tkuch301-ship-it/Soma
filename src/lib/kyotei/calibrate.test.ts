import { describe, it, expect } from "vitest";
import { calibrateWeights } from "./calibrate";
import { TRUE_WEIGHTS, generateSyntheticRaces } from "./sampleRaces";

describe("calibrateWeights", () => {
  const races = generateSyntheticRaces(1200, 11);

  it("コース別成績だけのベースラインより当てはまりが良くなる", () => {
    const result = calibrateWeights(races, { iterations: 300, validationSplit: 0.3 });
    expect(result.trainLogLoss).toBeLessThan(result.baselineLogLoss);
    // 学習に使っていないレースでも改善している＝過学習ではない。
    expect(result.validationLogLoss!).toBeLessThan(result.validationBaselineLogLoss!);
  });

  it("データを作ったときの真の重みの符号・大小関係を復元する", () => {
    const { weights } = calibrateWeights(races, { iterations: 300 });
    for (const key of ["nationalWinRate", "motor2nd", "startTiming", "exhibition"] as const) {
      expect(weights[key]).toBeGreaterThan(0);
    }
    // 影響が大きい変数ほど大きな重みが付く。
    expect(weights.startTiming).toBeGreaterThan(weights.boat2nd);
    expect(weights.nationalWinRate).toBeGreaterThan(weights.boat2nd);
    // 真の値からのズレが常識的な範囲。
    expect(Math.abs(weights.nationalWinRate - TRUE_WEIGHTS.nationalWinRate)).toBeLessThan(0.25);
  });

  it("検証用に取り分けたレースは学習に使われない", () => {
    const result = calibrateWeights(races, { iterations: 50, validationSplit: 0.25 });
    expect(result.trainRaces + result.validationRaces).toBe(result.races);
    expect(result.validationRaces).toBeGreaterThan(0);
  });

  it("正則化を強くすると重みが0に寄る", () => {
    const weak = calibrateWeights(races, { iterations: 300, l2: 0.001 });
    const strong = calibrateWeights(races, { iterations: 300, l2: 5 });
    const norm = (w: Record<string, number>) => Object.values(w).reduce((s, v) => s + v * v, 0);
    expect(norm(strong.weights)).toBeLessThan(norm(weak.weights));
  });

  it("着順の分からないデータではエラーになる", () => {
    expect(() => calibrateWeights([])).toThrow(/レースがありません/);
    const voided = races.slice(0, 10).map((r) => ({ ...r, result: { ...r.result, voided: true } }));
    expect(() => calibrateWeights(voided)).toThrow(/レースがありません/);
  });
});
