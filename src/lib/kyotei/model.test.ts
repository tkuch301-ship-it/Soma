import { describe, it, expect } from "vitest";
import { COURSE_WIN_RATE } from "./courseStats";
import {
  DEFAULT_WEIGHTS,
  comboProbabilities,
  finishOrderProbabilities,
  predict,
  scoreRace,
  validateCard,
  winProbabilities,
} from "./model";
import { LANES, type Entry, type Lane, type RaceCard } from "./types";

/** 全艇が全国平均ちょうどの選手、というレース。 */
function averageEntry(lane: Lane, overrides: Partial<Entry> = {}): Entry {
  return {
    lane,
    klass: "B1",
    nationalWinRate: 5.5,
    localWinRate: 5.5,
    motor2nd: 35,
    boat2nd: 35,
    avgStartTiming: 0.16,
    exhibitionTime: 6.75,
    ...overrides,
  };
}

function averageCard(overrides: Partial<Entry>[] = []): RaceCard {
  return {
    entries: LANES.map((lane) => averageEntry(lane, overrides[lane - 1] ?? {})),
  };
}

describe("scoreRace / winProbabilities", () => {
  it("全艇が平均なら、勝率はコース別成績そのものになる", () => {
    // 級別 B1 のぶんだけ全艇一律にスコアが下がるが、softmax は平行移動に不変。
    const probs = winProbabilities(scoreRace(averageCard()));
    const total = LANES.reduce((s, l) => s + COURSE_WIN_RATE[l], 0);
    for (const lane of LANES) {
      expect(probs[lane]).toBeCloseTo(COURSE_WIN_RATE[lane] / total, 6);
    }
  });

  it("1号艇が半分以上勝つという競艇の基本構造を再現する", () => {
    const probs = winProbabilities(scoreRace(averageCard()));
    expect(probs[1]).toBeGreaterThan(0.5);
    expect(probs[6]).toBeLessThan(0.05);
  });

  it("成績の良い選手ほど勝率が上がる", () => {
    const base = winProbabilities(scoreRace(averageCard()));
    const boosted = winProbabilities(
      scoreRace(averageCard([{}, { nationalWinRate: 7.5, klass: "A1", avgStartTiming: 0.13 }]))
    );
    expect(boosted[2]).toBeGreaterThan(base[2]);
    // 他艇の確率は相対的に下がる。
    expect(boosted[1]).toBeLessThan(base[1]);
  });

  it("展示タイムはレース内の相対値として効く（全艇同じなら影響なし）", () => {
    const flat = winProbabilities(scoreRace(averageCard()));
    const shifted = winProbabilities(
      scoreRace(averageCard(LANES.map(() => ({ exhibitionTime: 6.9 }))))
    );
    for (const lane of LANES) expect(shifted[lane]).toBeCloseTo(flat[lane], 10);
  });

  it("進入コースが変われば、その順位付けで評価される（前付け）", () => {
    const card = averageCard();
    // 6号艇が1コースを取り、1号艇が6コースに落ちるケース。
    card.entries[0].startCourse = 6;
    card.entries[5].startCourse = 1;
    const probs = winProbabilities(scoreRace(card));
    expect(probs[6]).toBeGreaterThan(probs[1]);
  });
});

describe("finishOrderProbabilities", () => {
  const scores = scoreRace(averageCard());

  it("3連単120通りの確率の合計は1", () => {
    const probs = finishOrderProbabilities(scores, 3);
    expect(probs.size).toBe(120);
    const total = [...probs.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("2連単・単勝も合計1になり、単勝は winProbabilities と一致する", () => {
    const exacta = finishOrderProbabilities(scores, 2);
    expect(exacta.size).toBe(30);
    expect([...exacta.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);

    const win = finishOrderProbabilities(scores, 1);
    const direct = winProbabilities(scores);
    for (const lane of LANES) expect(win.get(String(lane))!).toBeCloseTo(direct[lane], 10);
  });

  it("Henery 指数を下げると、後の着順で実力差が縮まる", () => {
    const sharp = finishOrderProbabilities(scores, 3, { second: 1, third: 1 });
    const flat = finishOrderProbabilities(scores, 3, { second: 0.5, third: 0.3 });
    // 1-2-3（実力順どおり）の確率は、指数を下げたほうが小さくなる。
    expect(flat.get("1-2-3")!).toBeLessThan(sharp.get("1-2-3")!);
  });
});

describe("comboProbabilities", () => {
  const scores = scoreRace(averageCard());

  it("順序なしの賭式は対応する順列の和になる", () => {
    const ordered = finishOrderProbabilities(scores, 3);
    const trio = comboProbabilities(scores, "trio");
    const expected = ["1-2-3", "1-3-2", "2-1-3", "2-3-1", "3-1-2", "3-2-1"].reduce(
      (s, k) => s + ordered.get(k)!,
      0
    );
    expect(trio["1=2=3"]).toBeCloseTo(expected, 12);
    expect(Object.values(trio).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
});

describe("predict", () => {
  it("スコア・勝率・組番確率をまとめて返す", () => {
    const p = predict(averageCard(), "trifecta", { weights: DEFAULT_WEIGHTS });
    expect(p.scores).toHaveLength(6);
    expect(Object.keys(p.combos)).toHaveLength(120);
    expect(Object.values(p.winProbability).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
});

describe("validateCard", () => {
  it("6艇そろっていないと弾く", () => {
    expect(() => validateCard({ entries: [averageEntry(1)] })).toThrow(/6艇/);
  });

  it("枠番が重複していると弾く", () => {
    const card = averageCard();
    card.entries[1].lane = 1;
    expect(() => validateCard(card)).toThrow(/枠番/);
  });

  it("進入コースが重複していると弾く", () => {
    const card = averageCard();
    card.entries[1].startCourse = 1;
    expect(() => validateCard(card)).toThrow(/進入コース/);
  });

  it("数値でない指標を弾く", () => {
    const card = averageCard();
    card.entries[0].nationalWinRate = Number.NaN;
    expect(() => validateCard(card)).toThrow(/全国勝率/);
  });
});
