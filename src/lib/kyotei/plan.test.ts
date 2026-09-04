import { describe, it, expect } from "vitest";
import { predict } from "./model";
import { syntheticOdds } from "./odds";
import { buildBetPlan, settlePlan } from "./plan";
import { LANES, type Entry, type Lane, type OddsBoard, type RaceCard } from "./types";

function averageCard(): RaceCard {
  const entry = (lane: Lane): Entry => ({
    lane,
    klass: "B1",
    nationalWinRate: 5.5,
    localWinRate: 5.5,
    motor2nd: 35,
    boat2nd: 35,
    avgStartTiming: 0.16,
    exhibitionTime: 6.75,
  });
  return { id: "test", entries: LANES.map(entry) };
}

const card = averageCard();
const fairOdds = syntheticOdds(predict(card).combos, 0.25, false);

describe("buildBetPlan", () => {
  it("市場が正しければ全レース見送りになる（控除率25%を払わずに済む）", () => {
    const plan = buildBetPlan(card, { trifecta: fairOdds }, { bankroll: 100000, marketBlend: 1 });
    expect(plan.skip).toBe(true);
    expect(plan.tickets).toHaveLength(0);
    expect(plan.totalStake).toBe(0);
    expect(plan.reasons.join()).toMatch(/見送り/);
    expect(plan.evaluation.market.takeout).toBeCloseTo(0.25, 6);
  });

  it("オッズが甘い買い目があれば、その点だけをケリー基準の金額で買う", () => {
    const odds = { ...fairOdds };
    odds["1-2-3"] *= 2.5;
    const plan = buildBetPlan(card, { trifecta: odds }, { bankroll: 100000, marketBlend: 1 });

    expect(plan.skip).toBe(false);
    expect(plan.tickets).toHaveLength(1);
    expect(plan.tickets[0].key).toBe("1-2-3");
    expect(plan.tickets[0].amount % 100).toBe(0);
    expect(plan.tickets[0].amount).toBeLessThanOrEqual(100000 * 0.02);
    expect(plan.expectedProfit).toBeGreaterThan(0);
    expect(plan.expectedReturn / plan.totalStake).toBeGreaterThan(1.15);
  });

  it("買う点数の上限を守る", () => {
    const odds = { ...fairOdds };
    for (const key of Object.keys(odds)) odds[key] *= 2.5; // 全点が妙味ありという極端な状況
    const plan = buildBetPlan(card, { trifecta: odds }, { bankroll: 1000000, marketBlend: 1, maxTickets: 3 });
    expect(plan.tickets.length).toBeLessThanOrEqual(3);
  });

  it("オッズが足りないレースは市場が読めないので見送る", () => {
    const partial: OddsBoard = { trifecta: { "1-2-3": 200, "1-3-2": 300 } };
    const plan = buildBetPlan(card, partial, { bankroll: 100000 });
    expect(plan.skip).toBe(true);
    expect(plan.reasons.join()).toMatch(/オッズ取得率/);
  });

  it("オッズがまったく無ければ見送る", () => {
    const plan = buildBetPlan(card, {}, { bankroll: 100000 });
    expect(plan.skip).toBe(true);
    expect(plan.reasons.join()).toMatch(/1点も入力されていません/);
  });

  it("資金が小さすぎて100円に届かないなら見送る", () => {
    const odds = { ...fairOdds };
    odds["1-2-3"] *= 2.5;
    const plan = buildBetPlan(card, { trifecta: odds }, { bankroll: 1000, marketBlend: 1 });
    expect(plan.skip).toBe(true);
    expect(plan.reasons.join()).toMatch(/最低単位/);
  });
});

describe("settlePlan", () => {
  const odds = { ...fairOdds };
  odds["1-2-3"] *= 2.5;
  const plan = buildBetPlan(card, { trifecta: odds }, { bankroll: 100000, marketBlend: 1 });

  it("的中したら払戻が入る", () => {
    const s = settlePlan(plan, { first: 1, second: 2, third: 3 });
    expect(s.hitKeys).toEqual(["1-2-3"]);
    expect(s.payout).toBe(Math.floor(plan.tickets[0].amount * plan.tickets[0].odds));
    expect(s.profit).toBe(s.payout - s.staked);
    expect(s.profit).toBeGreaterThan(0);
  });

  it("外れたら投票額をすべて失う", () => {
    const s = settlePlan(plan, { first: 2, second: 1, third: 3 });
    expect(s.hitKeys).toEqual([]);
    expect(s.payout).toBe(0);
    expect(s.profit).toBe(-plan.totalStake);
  });

  it("見送ったレースの収支は0", () => {
    const skipped = buildBetPlan(card, { trifecta: fairOdds }, { bankroll: 100000, marketBlend: 1 });
    expect(settlePlan(skipped, { first: 1, second: 2, third: 3 })).toEqual({
      staked: 0,
      payout: 0,
      profit: 0,
      hitKeys: [],
    });
  });
});
