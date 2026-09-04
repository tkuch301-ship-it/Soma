import { describe, it, expect } from "vitest";
import { expectedLogWealth, kellyAllocations, sizeStakes, type KellyOutcome } from "./kelly";

/**
 * 期待対数資産を数値的に最大化する（解析解の検算用）。
 * 座標ごとの山登りをステップ幅を細かくしながら繰り返す。
 */
function numericOptimum(outcomes: readonly KellyOutcome[]): number[] {
  let f = outcomes.map(() => 0);
  let best = expectedLogWealth(outcomes, f);
  for (let step = 0.05; step > 1e-6; step *= 0.5) {
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < f.length; i++) {
        for (const delta of [step, -step]) {
          const trial = [...f];
          trial[i] = Math.max(0, trial[i] + delta);
          if (trial.reduce((a, b) => a + b, 0) >= 1) continue;
          const value = expectedLogWealth(outcomes, trial);
          if (value > best + 1e-12) {
            best = value;
            f = trial;
            improved = true;
          }
        }
      }
    }
  }
  return f;
}

describe("kellyAllocations", () => {
  it("単一の買い目では教科書どおりの f = (bp - q) / b になる", () => {
    // p=0.5, 払戻3倍 → b=2, f = (2*0.5 - 0.5)/2 = 0.25
    const alloc = kellyAllocations([{ key: "a", probability: 0.5, odds: 3 }]);
    expect(alloc).toHaveLength(1);
    expect(alloc[0].fraction).toBeCloseTo(0.25, 10);
  });

  it("期待値がマイナスの買い目には賭けない", () => {
    expect(kellyAllocations([{ key: "a", probability: 0.3, odds: 3 }])).toEqual([]);
    expect(kellyAllocations([{ key: "a", probability: 0.2, odds: 4 }])).toEqual([]);
  });

  it("期待値ちょうど1.0（トントン）でも賭けない", () => {
    expect(kellyAllocations([{ key: "a", probability: 0.25, odds: 4 }])).toEqual([]);
  });

  it("複数の排反な買い目で、数値最適化の結果と一致する", () => {
    const cases: KellyOutcome[][] = [
      [
        { key: "a", probability: 0.5, odds: 3 },
        { key: "b", probability: 0.3, odds: 4 },
      ],
      [
        { key: "a", probability: 0.2, odds: 8 },
        { key: "b", probability: 0.15, odds: 9 },
        { key: "c", probability: 0.1, odds: 5 }, // 期待値マイナス → 買わないはず
      ],
      [
        { key: "a", probability: 0.06, odds: 25 },
        { key: "b", probability: 0.04, odds: 40 },
        { key: "c", probability: 0.03, odds: 60 },
      ],
    ];

    for (const outcomes of cases) {
      const analytic = outcomes.map(
        (o) => kellyAllocations(outcomes).find((a) => a.key === o.key)?.fraction ?? 0
      );
      const numeric = numericOptimum(outcomes);
      expect(expectedLogWealth(outcomes, analytic)).toBeGreaterThanOrEqual(
        expectedLogWealth(outcomes, numeric) - 1e-6
      );
      analytic.forEach((f, i) => expect(f).toBeCloseTo(numeric[i], 3));
    }
  });

  it("残す資金の割合が、解に現れる b と一致する（不変式）", () => {
    const outcomes: KellyOutcome[] = [
      { key: "a", probability: 0.5, odds: 3 },
      { key: "b", probability: 0.3, odds: 4 },
    ];
    const alloc = kellyAllocations(outcomes);
    const staked = alloc.reduce((s, a) => s + a.fraction, 0);
    const cumP = 0.8;
    const cumInv = 1 / 3 + 1 / 4;
    expect(1 - staked).toBeCloseTo((1 - cumP) / (1 - cumInv), 10);
  });
});

describe("sizeStakes", () => {
  const outcomes: KellyOutcome[] = [{ key: "1-2-3", probability: 0.5, odds: 3 }];

  it("ケリー係数と100円単位の切り捨てが効く", () => {
    // フルケリー 25% × 係数 0.25 = 6.25% だが、1点上限 2% で頭打ち。
    const stakes = sizeStakes(outcomes, 100000, { fraction: 0.25 });
    expect(stakes).toHaveLength(1);
    expect(stakes[0].amount).toBe(2000);
    expect(stakes[0].amount % 100).toBe(0);
  });

  it("上限を緩めるとケリー係数どおりの金額になる", () => {
    const stakes = sizeStakes(outcomes, 100000, {
      fraction: 0.25,
      maxTicketFraction: 1,
      maxRaceFraction: 1,
    });
    expect(stakes[0].amount).toBe(6200); // 0.0625 * 100000 = 6250 → 100円単位に切り捨て
  });

  it("レース全体の上限を超えたら比例縮小する", () => {
    const many: KellyOutcome[] = [
      { key: "a", probability: 0.3, odds: 5 },
      { key: "b", probability: 0.25, odds: 6 },
      { key: "c", probability: 0.2, odds: 7 },
    ];
    const stakes = sizeStakes(many, 100000, { fraction: 1, maxRaceFraction: 0.05, maxTicketFraction: 1 });
    const total = stakes.reduce((s, t) => s + t.amount, 0);
    expect(total).toBeLessThanOrEqual(5000);
    expect(total).toBeGreaterThan(4000);
  });

  it("資金が少なくて最低単位に届かないなら何も買わない", () => {
    expect(sizeStakes(outcomes, 3000)).toEqual([]);
    expect(sizeStakes(outcomes, 0)).toEqual([]);
  });

  it("期待値がマイナスなら何も買わない", () => {
    expect(sizeStakes([{ key: "a", probability: 0.1, odds: 5 }], 1000000)).toEqual([]);
  });
});
