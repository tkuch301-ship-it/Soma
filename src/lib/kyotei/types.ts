/**
 * 競艇（ボートレース）の期待値ベース投票支援モジュールの共通型。
 *
 * 前提として、公営競技の舟券は控除率（テラ銭）が約25%ある。
 * 「全部の買い目を買う」と長期的には必ず -25% に収束するので、
 * 利益を出す唯一の方法は「自分の予想確率 × オッズ が 1 を十分上回る買い目だけを買い、
 * それ以外のレースは見送る」こと。このモジュールはその判断を機械化する。
 */

/** 枠番 / 進入コース（1〜6）。 */
export type Lane = 1 | 2 | 3 | 4 | 5 | 6;

export const LANES: readonly Lane[] = [1, 2, 3, 4, 5, 6];

/** 選手級別。 */
export type RacerClass = "A1" | "A2" | "B1" | "B2";

/** 賭式。 */
export type BetType =
  | "win" // 単勝
  | "quinella" // 2連複
  | "exacta" // 2連単
  | "trio" // 3連複
  | "trifecta"; // 3連単

export const BET_TYPE_LABEL: Record<BetType, string> = {
  win: "単勝",
  quinella: "2連複",
  exacta: "2連単",
  trio: "3連複",
  trifecta: "3連単",
};

/** その賭式が着順（順序）を区別するか。区別しないものは組番を昇順に正規化する。 */
export const BET_TYPE_ORDERED: Record<BetType, boolean> = {
  win: true,
  quinella: false,
  exacta: true,
  trio: false,
  trifecta: true,
};

/** その賭式が対象にする着順の数。 */
export const BET_TYPE_SIZE: Record<BetType, 1 | 2 | 3> = {
  win: 1,
  quinella: 2,
  exacta: 2,
  trio: 3,
  trifecta: 3,
};

/** 出走表1艇分。数値は公式の出走表・直前情報から転記する想定。 */
export interface Entry {
  /** 枠番。 */
  lane: Lane;
  /** 進入コース。前付けなどで枠と違う場合に指定。省略時は枠なり（lane と同じ）。 */
  startCourse?: Lane;
  racerName?: string;
  racerNumber?: string;
  /** 級別。 */
  klass: RacerClass;
  /** 全国勝率（勝率点。全国平均およそ 5.5）。 */
  nationalWinRate: number;
  /** 当地勝率。 */
  localWinRate: number;
  /** モーター2連対率(%)。 */
  motor2nd: number;
  /** ボート2連対率(%)。 */
  boat2nd: number;
  /** 平均スタートタイミング(秒)。小さいほど速い。全国平均およそ 0.16。 */
  avgStartTiming: number;
  /** 展示タイム(秒)。未取得なら null。同一レース内の相対値としてのみ使う。 */
  exhibitionTime?: number | null;
}

/** 1レース分の出走表。 */
export interface RaceCard {
  id?: string;
  /** 開催場（例: "住之江"）。 */
  venue?: string;
  /** 日付 (YYYY-MM-DD)。 */
  date?: string;
  /** レース番号 (1-12)。 */
  raceNumber?: number;
  /** 6艇ぶんの出走表。 */
  entries: Entry[];
}

/**
 * オッズ表。キーは組番文字列。
 * - 順序あり（単勝/2連単/3連単）: "1", "1-2", "1-2-3"
 * - 順序なし（2連複/3連複）: "1=2", "1=2=3"（昇順に正規化）
 * 値は払戻倍率（100円が何倍になるか）。
 */
export type OddsBoard = Partial<Record<BetType, Record<string, number>>>;

/** 確定着順（1着・2着・3着の枠番）。 */
export interface RaceResult {
  first: Lane;
  second: Lane;
  third: Lane;
  /** 不成立・返還があったレースは true。バックテストから除外する。 */
  voided?: boolean;
}

/** バックテスト用の1レース分のレコード。 */
export interface HistoricalRace {
  card: RaceCard;
  odds: OddsBoard;
  result: RaceResult;
}
