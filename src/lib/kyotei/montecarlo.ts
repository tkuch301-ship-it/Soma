/**
 * 資金曲線のモンテカルロ。
 *
 * 「高確率で利益が出るか」に数字で答えるための部分。
 * 1レースあたりの収支をブートストラップ再抽出して将来を何千通りも試し、
 * 「N レース後にプラスで終わっている確率」と「破産確率」を出す。
 *
 * 期待値がプラスでも、賭け金が大きければプラスで終わる確率は簡単に5割を切る。
 */

/** 決定的な結果を得るための小さな PRNG（mulberry32）。 */
export function makeRng(seed = 1): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimulationInput {
  /** 1レースあたりの収支サンプル（円）。バックテストの各行 profit をそのまま渡す。 */
  perRaceProfit: readonly number[];
  /** 1レースあたりの投票額サンプル（円）。resize=true のときに賭け金を資金比で調整するのに使う。 */
  perRaceStake?: readonly number[];
  startingBankroll: number;
  /** シミュレーションするレース数。 */
  races: number;
  /** 試行回数。 */
  trials?: number;
  /** 資金がこれ以下になったら破産。 */
  ruinBankroll?: number;
  /** true なら資金の増減に比例して賭け金も増減させる（複利）。 */
  compound?: boolean;
  seed?: number;
}

export interface SimulationResult {
  trials: number;
  races: number;
  /** 最終資金が初期資金を上回った試行の割合。 */
  profitProbability: number;
  /** 破産（資金が下限以下）した試行の割合。 */
  ruinProbability: number;
  medianFinalBankroll: number;
  p5FinalBankroll: number;
  p95FinalBankroll: number;
  meanFinalBankroll: number;
  /** 最大ドローダウンの中央値。 */
  medianMaxDrawdown: number;
}

export function simulateBankroll(input: SimulationInput): SimulationResult {
  const {
    perRaceProfit,
    perRaceStake,
    startingBankroll,
    races,
    trials = 5000,
    ruinBankroll = 0,
    compound = true,
    seed = 1,
  } = input;

  if (perRaceProfit.length === 0) {
    throw new Error("収支サンプルが空です。先にバックテストを実行してください");
  }
  if (!(startingBankroll > 0)) throw new Error("初期資金は正の値が必要です");

  const rng = makeRng(seed);
  const finals: number[] = [];
  const drawdowns: number[] = [];
  let profitable = 0;
  let ruined = 0;

  // 複利で賭け金を調整するときの基準（サンプルを取った当時の資金規模）。
  const baseStake =
    perRaceStake && perRaceStake.length > 0
      ? perRaceStake.reduce((a, b) => a + b, 0) / perRaceStake.length
      : null;

  for (let t = 0; t < trials; t++) {
    let bankroll = startingBankroll;
    let peak = bankroll;
    let maxDd = 0;
    let isRuined = false;

    for (let r = 0; r < races; r++) {
      const sample = perRaceProfit[Math.floor(rng() * perRaceProfit.length)];
      // 複利: 資金が半分になれば賭け金も半分になるので、収支も比例して縮む。
      const scale = compound ? bankroll / startingBankroll : 1;
      bankroll += sample * scale;
      peak = Math.max(peak, bankroll);
      maxDd = Math.max(maxDd, peak > 0 ? (peak - bankroll) / peak : 0);
      if (bankroll <= ruinBankroll || (baseStake != null && bankroll < baseStake)) {
        isRuined = true;
        break;
      }
    }

    finals.push(bankroll);
    drawdowns.push(maxDd);
    if (bankroll > startingBankroll) profitable++;
    if (isRuined) ruined++;
  }

  finals.sort((a, b) => a - b);
  drawdowns.sort((a, b) => a - b);
  const pct = (arr: number[], q: number) => arr[Math.min(arr.length - 1, Math.floor(q * arr.length))];

  return {
    trials,
    races,
    profitProbability: profitable / trials,
    ruinProbability: ruined / trials,
    medianFinalBankroll: pct(finals, 0.5),
    p5FinalBankroll: pct(finals, 0.05),
    p95FinalBankroll: pct(finals, 0.95),
    meanFinalBankroll: finals.reduce((a, b) => a + b, 0) / finals.length,
    medianMaxDrawdown: pct(drawdowns, 0.5),
  };
}
