import type { Lane } from "./types";

/**
 * コース別1着率（全国平均の概算, 小数）。
 *
 * 競艇の最大の特徴は「進入コースだけで勝率がほぼ決まる」こと。
 * 1コースは半分以上のレースで1着になり、6コースはほとんど勝てない。
 * モデルの基準値（切片）はここから作る。
 *
 * 数字はボートレース公式が公開しているコース別成績の概ねの水準。
 * 実運用では自分で集計した最新値・場別の値に差し替えること
 * （`calibrateCourseBase` で履歴から再推定できる）。
 */
export const COURSE_WIN_RATE: Record<Lane, number> = {
  1: 0.55,
  2: 0.145,
  3: 0.12,
  4: 0.105,
  5: 0.055,
  6: 0.025,
};

/**
 * コース別の基準スコア（対数オッズ空間の切片）。
 *
 * Plackett–Luce モデルでは選択確率が exp(score) に比例するので、
 * 全艇が平均的な選手なら勝率が COURSE_WIN_RATE に一致するように
 * log(勝率) を切片に置く。定数分の平行移動は確率に影響しない。
 */
export function courseBaseScores(
  winRates: Record<Lane, number> = COURSE_WIN_RATE
): Record<Lane, number> {
  const total = (Object.values(winRates) as number[]).reduce((a, b) => a + b, 0);
  const out = {} as Record<Lane, number>;
  for (const lane of [1, 2, 3, 4, 5, 6] as Lane[]) {
    const p = winRates[lane] / total;
    if (!(p > 0)) throw new Error(`コース${lane}の勝率は正の値である必要があります`);
    out[lane] = Math.log(p);
  }
  return out;
}

/** 履歴から「コース別1着率」を数え上げて再推定する。 */
export function calibrateCourseBase(
  finishes: readonly { winnerCourse: Lane }[],
  /** ゼロ頻度を避けるためのラプラス平滑化。 */
  smoothing = 5
): Record<Lane, number> {
  const counts = { 1: smoothing, 2: smoothing, 3: smoothing, 4: smoothing, 5: smoothing, 6: smoothing } as Record<Lane, number>;
  for (const f of finishes) counts[f.winnerCourse] += 1;
  const total = (Object.values(counts) as number[]).reduce((a, b) => a + b, 0);
  const out = {} as Record<Lane, number>;
  for (const lane of [1, 2, 3, 4, 5, 6] as Lane[]) out[lane] = counts[lane] / total;
  return out;
}
