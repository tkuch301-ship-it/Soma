import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/apiError";
import { ValidationError } from "@/lib/errors";
import { buildBetPlan, type PlanOptions } from "@/lib/kyotei/plan";
import type { OddsBoard, RaceCard } from "@/lib/kyotei/types";

interface PlanRequest {
  card?: RaceCard;
  odds?: OddsBoard;
  options?: Partial<PlanOptions>;
}

/**
 * POST /api/kyotei/plan
 * 出走表 + オッズ + 資金 → 買い目プラン（多くの場合は「見送り」）。
 *
 * body: { card, odds: { trifecta: { "1-2-3": 7.4, ... } }, options: { bankroll, minEdge, ... } }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as PlanRequest | null;
    if (!body?.card) throw new ValidationError("card（出走表）が必要です");
    if (!body.odds || Object.keys(body.odds).length === 0) {
      throw new ValidationError("odds（オッズ表）が必要です");
    }
    const bankroll = body.options?.bankroll;
    if (typeof bankroll !== "number" || !(bankroll > 0)) {
      throw new ValidationError("options.bankroll に正の数値が必要です");
    }

    let plan;
    try {
      plan = buildBetPlan(body.card, body.odds, { ...body.options, bankroll });
    } catch (e) {
      // 出走表・オッズの形式エラーは 400 で返す。
      throw new ValidationError(e instanceof Error ? e.message : String(e));
    }

    return NextResponse.json({
      betType: plan.betType,
      skip: plan.skip,
      reasons: plan.reasons,
      tickets: plan.tickets,
      totalStake: plan.totalStake,
      hitProbability: plan.hitProbability,
      expectedReturn: plan.expectedReturn,
      expectedProfit: plan.expectedProfit,
      winProbability: plan.prediction.winProbability,
      market: plan.evaluation.market,
      // 全120点を返すと重いので、妙味の大きい順に上位だけ返す。
      topCandidates: plan.evaluation.all.slice(0, 20),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
