import { allCombos, comboKey } from "./combo";
import type { BetType } from "./types";

/**
 * 公式サイトなどからコピーしたテキストをオッズ表に変換する。
 *
 * 受け付ける形式（1行1点）:
 *   1-2-3 7.4
 *   1-2-3,7.4
 *   1-2-3	7.4
 *   1=2=3 3.2   （3連複などの順序なし賭式）
 */
export function parseOddsText(text: string, betType: BetType): Record<string, number> {
  const out: Record<string, number> = {};
  const errors: string[] = [];

  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const m = line.match(/^([0-9]+(?:\s*[-=]\s*[0-9]+)*)\s*[,\t ]\s*([0-9]+(?:\.[0-9]+)?)$/);
      if (!m) {
        errors.push(`${i + 1}行目を解釈できません: "${line}"`);
        return;
      }
      const lanes = m[1].split(/\s*[-=]\s*/).map(Number);
      const odds = Number(m[2]);
      if (!(odds > 0)) {
        errors.push(`${i + 1}行目のオッズが不正です: "${line}"`);
        return;
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        out[comboKey(betType, lanes as any)] = odds;
      } catch (e) {
        errors.push(`${i + 1}行目: ${e instanceof Error ? e.message : String(e)}`);
      }
    });

  if (errors.length > 0 && Object.keys(out).length === 0) {
    throw new Error(errors.slice(0, 3).join(" / "));
  }
  return out;
}

/**
 * 確率分布からオッズ表を作る（テスト・シミュレーション用）。
 *
 * パリミュチュエル方式のオッズは (1 - 控除率) / 投票シェア なので、
 * 投票シェアが確率と一致していれば odds = (1 - takeout) / p になる。
 */
export function syntheticOdds(
  probabilities: Record<string, number>,
  takeout = 0.25,
  /** オッズの丸め（公式は 0.1 刻み、高配当は粗い）。 */
  round = true
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, p] of Object.entries(probabilities)) {
    if (!(p > 0)) continue;
    const raw = (1 - takeout) / p;
    out[key] = round ? Math.max(1, Math.floor(raw * 10) / 10) : raw;
  }
  return out;
}

/** 賭式の全組番のうち、オッズが入力されていないものを返す。 */
export function missingCombos(odds: Record<string, number>, betType: BetType): string[] {
  return allCombos(betType)
    .map((c) => comboKey(betType, c))
    .filter((key) => !(odds[key] > 0));
}
