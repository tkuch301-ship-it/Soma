import { BET_TYPE_ORDERED, BET_TYPE_SIZE, LANES, type BetType, type Lane } from "./types";

/**
 * 組番の文字列表現。順序あり（3連単など）は "1-2-3"、
 * 順序なし（3連複など）は昇順に並べ替えて "1=2=3"。
 */
export function comboKey(betType: BetType, lanes: readonly Lane[]): string {
  const size = BET_TYPE_SIZE[betType];
  if (lanes.length !== size) {
    throw new Error(`${betType} は ${size} 艇の組番が必要です (受け取った数: ${lanes.length})`);
  }
  if (new Set(lanes).size !== lanes.length) {
    throw new Error(`組番に同じ艇が重複しています: ${lanes.join(",")}`);
  }
  if (BET_TYPE_ORDERED[betType]) {
    return lanes.join("-");
  }
  return [...lanes].sort((a, b) => a - b).join("=");
}

/** comboKey の逆変換。 */
export function parseCombo(key: string): Lane[] {
  const parts = key.split(/[-=]/);
  return parts.map((p) => {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 1 || n > 6) {
      throw new Error(`不正な組番です: ${key}`);
    }
    return n as Lane;
  });
}

/** 賭式ごとの全組番を列挙する（3連単なら 120 通り）。 */
export function allCombos(betType: BetType): Lane[][] {
  const size = BET_TYPE_SIZE[betType];
  const ordered = BET_TYPE_ORDERED[betType];
  const out: Lane[][] = [];

  const walk = (chosen: Lane[]) => {
    if (chosen.length === size) {
      out.push([...chosen]);
      return;
    }
    for (const lane of LANES) {
      if (chosen.includes(lane)) continue;
      // 順序なしの賭式は昇順の並びだけを生成して重複を避ける。
      if (!ordered && chosen.length > 0 && lane < chosen[chosen.length - 1]) continue;
      chosen.push(lane);
      walk(chosen);
      chosen.pop();
    }
  };
  walk([]);
  return out;
}

/** 順序なしの賭式で、1つの組番に対応する着順の並び（順列）をすべて返す。 */
export function permutationsOf(lanes: readonly Lane[]): Lane[][] {
  if (lanes.length <= 1) return [[...lanes]];
  const out: Lane[][] = [];
  for (let i = 0; i < lanes.length; i++) {
    const rest = [...lanes.slice(0, i), ...lanes.slice(i + 1)];
    for (const tail of permutationsOf(rest)) {
      out.push([lanes[i], ...tail]);
    }
  }
  return out;
}

/** 確定着順が、その賭式のその組番に的中しているか。 */
export function isHit(betType: BetType, key: string, finish: readonly Lane[]): boolean {
  const size = BET_TYPE_SIZE[betType];
  if (finish.length < size) return false;
  return comboKey(betType, finish.slice(0, size) as Lane[]) === key;
}
