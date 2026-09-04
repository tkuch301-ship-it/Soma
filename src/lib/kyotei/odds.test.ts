import { describe, it, expect } from "vitest";
import { missingCombos, parseOddsText, syntheticOdds } from "./odds";

describe("parseOddsText", () => {
  it("空白・カンマ・タブ区切りを読める", () => {
    const odds = parseOddsText("1-2-3 7.4\n1-3-2,12.1\n2-1-3\t9", "trifecta");
    expect(odds).toEqual({ "1-2-3": 7.4, "1-3-2": 12.1, "2-1-3": 9 });
  });

  it("順序なしの賭式は昇順に正規化する", () => {
    expect(parseOddsText("3=1=2 4.5", "trio")).toEqual({ "1=2=3": 4.5 });
  });

  it("読めない行は飛ばすが、1点も読めなければエラー", () => {
    expect(parseOddsText("1-2-3 7.4\nゴミ行", "trifecta")).toEqual({ "1-2-3": 7.4 });
    expect(() => parseOddsText("ゴミ行\nもっとゴミ", "trifecta")).toThrow();
  });

  it("艇数が合わない行はエラーとして扱われる", () => {
    expect(() => parseOddsText("1-2 7.4", "trifecta")).toThrow(/3 艇/);
  });
});

describe("syntheticOdds", () => {
  it("控除率ぶんだけ払戻が削られる", () => {
    const odds = syntheticOdds({ a: 0.5 }, 0.25, false);
    expect(odds.a).toBeCloseTo(1.5, 10);
  });
});

describe("missingCombos", () => {
  it("入力されていない組番を挙げる", () => {
    expect(missingCombos({ "1-2-3": 7.4 }, "trifecta")).toHaveLength(119);
    expect(missingCombos({}, "win")).toHaveLength(6);
  });
});
