import { describe, it, expect } from "vitest";
import { emptyDrafts, parseDrafts, toDrafts } from "./form";
import { makeSampleCard } from "./sampleRaces";

describe("toDrafts / parseDrafts", () => {
  it("出走表 → 入力欄 → 出走表 で内容が保たれる", () => {
    const card = makeSampleCard(3);
    const { card: parsed, errors } = parseDrafts(toDrafts(card));
    expect(errors).toEqual([]);
    expect(parsed!.entries).toHaveLength(6);
    for (const original of card.entries) {
      const back = parsed!.entries.find((e) => e.lane === original.lane)!;
      expect(back.nationalWinRate).toBeCloseTo(original.nationalWinRate, 10);
      expect(back.avgStartTiming).toBeCloseTo(original.avgStartTiming, 10);
      expect(back.klass).toBe(original.klass);
    }
  });

  it("未入力の欄をすべて指摘する", () => {
    const { card, errors } = parseDrafts(emptyDrafts());
    expect(card).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/1号艇/);
  });

  it("展示タイムは任意（空なら未取得扱い）", () => {
    const drafts = toDrafts(makeSampleCard(3)).map((d) => ({ ...d, exhibitionTime: "" }));
    const { card, errors } = parseDrafts(drafts);
    expect(errors).toEqual([]);
    expect(card!.entries.every((e) => e.exhibitionTime == null)).toBe(true);
  });

  it("数値でない入力を弾く", () => {
    const drafts = toDrafts(makeSampleCard(3));
    drafts[0].motor2nd = "あ";
    const { card, errors } = parseDrafts(drafts);
    expect(card).toBeNull();
    expect(errors[0]).toMatch(/モーター2連率が数値ではありません/);
  });

  it("進入コースの範囲と重複をチェックする", () => {
    const drafts = toDrafts(makeSampleCard(3));
    drafts[0].startCourse = "9";
    expect(parseDrafts(drafts).errors[0]).toMatch(/1〜6/);

    const dup = toDrafts(makeSampleCard(3));
    dup[0].startCourse = "2";
    expect(parseDrafts(dup).errors[0]).toMatch(/進入コース/);
  });

  it("進入コースを入れ替えた出走表は通る（前付け）", () => {
    const drafts = toDrafts(makeSampleCard(3));
    drafts[0].startCourse = "6";
    drafts[5].startCourse = "1";
    const { card, errors } = parseDrafts(drafts);
    expect(errors).toEqual([]);
    expect(card!.entries[0].startCourse).toBe(6);
  });
});
