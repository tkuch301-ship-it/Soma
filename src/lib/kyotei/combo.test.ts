import { describe, it, expect } from "vitest";
import { allCombos, comboKey, isHit, parseCombo, permutationsOf } from "./combo";
import type { Lane } from "./types";

describe("comboKey", () => {
  it("順序ありの賭式は入力順のまま", () => {
    expect(comboKey("trifecta", [3, 1, 2])).toBe("3-1-2");
    expect(comboKey("exacta", [4, 1])).toBe("4-1");
    expect(comboKey("win", [6])).toBe("6");
  });

  it("順序なしの賭式は昇順に正規化される", () => {
    expect(comboKey("trio", [3, 1, 2])).toBe("1=2=3");
    expect(comboKey("quinella", [5, 2])).toBe("2=5");
  });

  it("艇数が違う・重複しているとエラー", () => {
    expect(() => comboKey("trifecta", [1, 2] as unknown as Lane[])).toThrow(/3 艇/);
    expect(() => comboKey("trifecta", [1, 1, 2])).toThrow(/重複/);
  });
});

describe("allCombos", () => {
  it("賭式ごとの点数が公式と一致する", () => {
    expect(allCombos("win")).toHaveLength(6);
    expect(allCombos("quinella")).toHaveLength(15);
    expect(allCombos("exacta")).toHaveLength(30);
    expect(allCombos("trio")).toHaveLength(20);
    expect(allCombos("trifecta")).toHaveLength(120);
  });

  it("生成した組番はすべて一意", () => {
    const keys = allCombos("trifecta").map((c) => comboKey("trifecta", c));
    expect(new Set(keys).size).toBe(120);
  });
});

describe("isHit", () => {
  const finish: Lane[] = [1, 4, 2];

  it("3連単は着順まで一致したときだけ的中", () => {
    expect(isHit("trifecta", "1-4-2", finish)).toBe(true);
    expect(isHit("trifecta", "1-2-4", finish)).toBe(false);
  });

  it("3連複は着順が違っても的中", () => {
    expect(isHit("trio", "1=2=4", finish)).toBe(true);
  });

  it("2連単・2連複・単勝も判定できる", () => {
    expect(isHit("exacta", "1-4", finish)).toBe(true);
    expect(isHit("exacta", "4-1", finish)).toBe(false);
    expect(isHit("quinella", "1=4", finish)).toBe(true);
    expect(isHit("win", "1", finish)).toBe(true);
  });
});

describe("parseCombo / permutationsOf", () => {
  it("組番文字列を艇番に戻す", () => {
    expect(parseCombo("1-2-3")).toEqual([1, 2, 3]);
    expect(parseCombo("1=2=3")).toEqual([1, 2, 3]);
  });

  it("3艇の順列は6通り", () => {
    expect(permutationsOf([1, 2, 3] as Lane[])).toHaveLength(6);
  });
});
