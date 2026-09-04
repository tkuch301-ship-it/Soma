import { LANES, type Entry, type Lane, type RaceCard, type RacerClass } from "./types";
import { validateCard } from "./model";

/** 画面の入力欄（すべて文字列）。数値変換とバリデーションはここで一括して行う。 */
export interface EntryDraft {
  lane: Lane;
  racerName: string;
  klass: RacerClass;
  nationalWinRate: string;
  localWinRate: string;
  motor2nd: string;
  boat2nd: string;
  avgStartTiming: string;
  exhibitionTime: string;
  /** 空なら枠なり進入。 */
  startCourse: string;
}

export const RACER_CLASSES: RacerClass[] = ["A1", "A2", "B1", "B2"];

const FIELD_LABEL: Record<string, string> = {
  nationalWinRate: "全国勝率",
  localWinRate: "当地勝率",
  motor2nd: "モーター2連率",
  boat2nd: "ボート2連率",
  avgStartTiming: "平均ST",
  exhibitionTime: "展示タイム",
  startCourse: "進入コース",
};

export function toDrafts(card: RaceCard): EntryDraft[] {
  return LANES.map((lane) => {
    const e = card.entries.find((x) => x.lane === lane);
    return {
      lane,
      racerName: e?.racerName ?? "",
      klass: e?.klass ?? "B1",
      nationalWinRate: e ? String(e.nationalWinRate) : "",
      localWinRate: e ? String(e.localWinRate) : "",
      motor2nd: e ? String(e.motor2nd) : "",
      boat2nd: e ? String(e.boat2nd) : "",
      avgStartTiming: e ? String(e.avgStartTiming) : "",
      exhibitionTime: e?.exhibitionTime != null ? String(e.exhibitionTime) : "",
      startCourse: e?.startCourse != null ? String(e.startCourse) : "",
    };
  });
}

export function emptyDrafts(): EntryDraft[] {
  return LANES.map((lane) => ({
    lane,
    racerName: "",
    klass: "B1" as RacerClass,
    nationalWinRate: "",
    localWinRate: "",
    motor2nd: "",
    boat2nd: "",
    avgStartTiming: "",
    exhibitionTime: "",
    startCourse: "",
  }));
}

export interface ParseResult {
  card: RaceCard | null;
  errors: string[];
}

/** 入力欄 → 出走表。1つでも問題があればエラー文言を返す。 */
export function parseDrafts(drafts: readonly EntryDraft[], meta: Partial<RaceCard> = {}): ParseResult {
  const errors: string[] = [];
  const entries: Entry[] = [];

  for (const d of drafts) {
    const num = (key: keyof EntryDraft, required = true): number | null => {
      const raw = String(d[key] ?? "").trim();
      if (raw === "") {
        if (required) errors.push(`${d.lane}号艇: ${FIELD_LABEL[key] ?? key}を入力してください`);
        return null;
      }
      const v = Number(raw);
      if (!Number.isFinite(v)) {
        errors.push(`${d.lane}号艇: ${FIELD_LABEL[key] ?? key}が数値ではありません`);
        return null;
      }
      return v;
    };

    const nationalWinRate = num("nationalWinRate");
    const localWinRate = num("localWinRate");
    const motor2nd = num("motor2nd");
    const boat2nd = num("boat2nd");
    const avgStartTiming = num("avgStartTiming");
    const exhibitionTime = num("exhibitionTime", false);
    const startCourseRaw = num("startCourse", false);

    let startCourse: Lane | undefined;
    if (startCourseRaw != null) {
      if (!Number.isInteger(startCourseRaw) || startCourseRaw < 1 || startCourseRaw > 6) {
        errors.push(`${d.lane}号艇: 進入コースは1〜6で入力してください`);
      } else {
        startCourse = startCourseRaw as Lane;
      }
    }

    if (
      nationalWinRate == null ||
      localWinRate == null ||
      motor2nd == null ||
      boat2nd == null ||
      avgStartTiming == null
    ) {
      continue;
    }

    entries.push({
      lane: d.lane,
      racerName: d.racerName.trim() || undefined,
      klass: d.klass,
      nationalWinRate,
      localWinRate,
      motor2nd,
      boat2nd,
      avgStartTiming,
      exhibitionTime,
      startCourse,
    });
  }

  if (errors.length > 0) return { card: null, errors };

  const card: RaceCard = { ...meta, entries };
  try {
    validateCard(card);
  } catch (e) {
    return { card: null, errors: [e instanceof Error ? e.message : String(e)] };
  }
  return { card, errors: [] };
}
