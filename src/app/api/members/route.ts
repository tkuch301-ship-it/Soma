import { NextRequest, NextResponse } from "next/server";
import { listMembers, createMember } from "@/lib/repo";
import { handleApiError } from "@/lib/apiError";

export const runtime = "nodejs";

export async function GET() {
  try {
    const members = await listMembers();
    return NextResponse.json(members);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const member = await createMember(body?.name, {
      actor_id: body?.actor_id,
      actor_name: body?.actor_name,
    });
    return NextResponse.json(member, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
