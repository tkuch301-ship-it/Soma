import { describe, it, expect } from "vitest";
import { makeRng, simulateBankroll } from "./montecarlo";

describe("makeRng", () => {
  it("同じ種なら同じ列を返す", () => {
    const a = makeRng(123);
    const b = makeRng(123);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("0以上1未満", () => {
    const rng = makeRng(9);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("simulateBankroll", () => {
  const base = { startingBankroll: 300000, races: 300, trials: 500, seed: 3 };

  it("同じ種なら結果が再現する", () => {
    const a = simulateBankroll({ ...base, perRaceProfit: [-1000, 5000, -1000, -1000] });
    const b = simulateBankroll({ ...base, perRaceProfit: [-1000, 5000, -1000, -1000] });
    expect(a).toEqual(b);
  });

  it("必ずプラスのサンプルなら利益確率は1", () => {
    const r = simulateBankroll({ ...base, perRaceProfit: [1000, 2000] });
    expect(r.profitProbability).toBe(1);
    expect(r.ruinProbability).toBe(0);
    expect(r.medianFinalBankroll).toBeGreaterThan(base.startingBankroll);
  });

  it("期待値がマイナスなら、ほぼ確実に負けて破産もする", () => {
    const r = simulateBankroll({
      ...base,
      perRaceProfit: [-20000, -20000, -20000, 40000], // 期待値 -5,000円/レース
      ruinBankroll: 0,
      compound: false,
    });
    expect(r.profitProbability).toBeLessThan(0.05);
    expect(r.ruinProbability).toBeGreaterThan(0.5);
  });

  it("期待値がプラスでも、賭け金が大きいと利益確率は下がる", () => {
    // 的中率5%・払戻30倍（期待値プラス）だが、1レースの賭け金が資金の10%というオーバーベット。
    const stake = 30000;
    const heavy = Array.from({ length: 100 }, (_, i) => (i < 5 ? stake * 29 : -stake));
    const r = simulateBankroll({ ...base, perRaceProfit: heavy, races: 200, ruinBankroll: 0 });
    expect(r.profitProbability).toBeLessThan(0.9);
    expect(r.medianMaxDrawdown).toBeGreaterThan(0.2);
  });

  it("分位点の並びが崩れない", () => {
    const r = simulateBankroll({ ...base, perRaceProfit: [-1000, 4000, -1000, -1000] });
    expect(r.p5FinalBankroll).toBeLessThanOrEqual(r.medianFinalBankroll);
    expect(r.medianFinalBankroll).toBeLessThanOrEqual(r.p95FinalBankroll);
  });

  it("サンプルが空・資金が0以下ならエラー", () => {
    expect(() => simulateBankroll({ ...base, perRaceProfit: [] })).toThrow(/バックテスト/);
    expect(() => simulateBankroll({ ...base, perRaceProfit: [1], startingBankroll: 0 })).toThrow(/初期資金/);
  });
});
