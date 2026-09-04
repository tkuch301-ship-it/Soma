/**
 * 競艇の期待値ベース投票支援モジュール。
 *
 * 使い方の流れ:
 *   1. `calibrateWeights()` … 自分で集めた過去レースでモデルを較正する
 *   2. `buildBetPlan()`     … 出走表 + 締切直前オッズ + 資金 → 買い目と金額（多くのレースは「見送り」になる）
 *   3. `backtest()`         … 本当に回収率が 1 を超えるのかを検証する
 *   4. `simulateBankroll()` … その優位性で「N レース後にプラスで終わる確率」を出す
 */
export * from "./types";
export * from "./combo";
export * from "./courseStats";
export * from "./model";
export * from "./ev";
export * from "./kelly";
export * from "./plan";
export * from "./backtest";
export * from "./montecarlo";
export * from "./calibrate";
export * from "./odds";
export * from "./sampleRaces";
export * from "./form";
