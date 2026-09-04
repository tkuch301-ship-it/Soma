import { describe, it, expect } from "vitest";
import { backtest } from "./backtest";
import { generateSyntheticRaces } from "./sampleRaces";

const races = generateSyntheticRaces(400, 42);

describe("backtest", () => {
  it("集計が各レースの明細と一致する", () => {
    const result = backtest(races, { startingBankroll: 300000 });
    const { summary, rows } = result;

    expect(rows).toHaveLength(races.length);
    expect(summary.races).toBe(races.length);
    expect(summary.betRaces + summary.skippedRaces).toBe(summary.races);
    expect(summary.staked).toBe(rows.reduce((s, r) => s + r.staked, 0));
    expect(summary.payout).toBe(rows.reduce((s, r) => s + r.payout, 0));
    expect(summary.profit).toBe(summary.payout - summary.staked);
    expect(summary.finalBankroll).toBe(summary.startingBankroll + summary.profit);
    if (summary.staked > 0) expect(summary.roi).toBeCloseTo(summary.payout / summary.staked, 10);
  });

  it("しきい値を上げれば全レース見送りになり、資金は動かない", () => {
    const result = backtest(races, { startingBankroll: 300000, minEdge: 10 });
    expect(result.summary.betRaces).toBe(0);
    expect(result.summary.skippedRaces).toBe(result.summary.races);
    expect(result.summary.finalBankroll).toBe(300000);
    expect(result.summary.profit).toBe(0);
  });

  it("控除率のない（賭ける側に有利な）市場なら、ちゃんと勝ちに行ける", () => {
    // 払戻が理論値の1.5倍というあり得ない条件。ロジックが機能することの確認用。
    const generous = generateSyntheticRaces(400, 5, { takeout: -0.5, marketBias: 1, marketNoise: 0 });
    const result = backtest(generous, { startingBankroll: 300000, marketBlend: 1, compound: false });
    expect(result.summary.betRaces).toBeGreaterThan(0);
    expect(result.summary.roi).toBeGreaterThan(1);
    expect(result.summary.profit).toBeGreaterThan(0);
    expect(result.summary.tStat).toBeGreaterThan(0);
    expect(result.summary.racesForSignificance).toBeGreaterThan(0);
  });

  it("現実的な控除率25%の市場では、未較正のモデルは普通に負ける", () => {
    // これがこのツールで一番大事な事実。合成データですら簡単には勝てない。
    const result = backtest(races, { startingBankroll: 300000, compound: false });
    expect(result.summary.roi).toBeLessThan(1);
  });

  it("破産したらそれ以降は賭けない", () => {
    const result = backtest(races, { startingBankroll: 300000, ruinBankroll: 299999 });
    expect(result.summary.ruined).toBe(true);
    const firstBet = result.rows.findIndex((r) => r.staked > 0);
    expect(firstBet).toBeGreaterThanOrEqual(0);
    // 最初に負けた時点で打ち切られるので、賭けたレースはごく少数。
    expect(result.summary.betRaces).toBeLessThan(5);
  });

  it("不成立レースは除外される", () => {
    const withVoid = races.map((r, i) => (i % 2 === 0 ? { ...r, result: { ...r.result, voided: true } } : r));
    const result = backtest(withVoid, { startingBankroll: 300000 });
    const voidedRows = result.rows.filter((_, i) => i % 2 === 0);
    expect(voidedRows.every((r) => r.staked === 0 && r.skipped)).toBe(true);
  });

  it("複利にすると、資金の増減が賭け金に反映される", () => {
    const fixed = backtest(races, { startingBankroll: 300000, compound: false });
    const compounded = backtest(races, { startingBankroll: 300000, compound: true });
    expect(compounded.summary.staked).not.toBe(fixed.summary.staked);
  });

  it("最大ドローダウンは 0〜1 の範囲に収まる", () => {
    const result = backtest(races, { startingBankroll: 300000 });
    expect(result.summary.maxDrawdown).toBeGreaterThanOrEqual(0);
    expect(result.summary.maxDrawdown).toBeLessThanOrEqual(1);
  });
});
