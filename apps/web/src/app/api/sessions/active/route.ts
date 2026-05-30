import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { PlaySessionModel } from "@/models/play-session.model";
import { RunContextModel } from "@/models/run-context.model";
import { objectIdRegex } from "@/lib/play/schemas";
import { serializeRunContext } from "@/lib/play/serialize";

export const runtime = "nodejs";

/**
 * Load run: return the authed user's active PlaySession for a game plus its
 * latest RunContext, for prefilling the Request Screen. 404 when there is no
 * active session (the UI falls back to starting a new run).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const gameId = req.nextUrl.searchParams.get("gameId");
  if (!gameId || !objectIdRegex.test(gameId)) {
    return NextResponse.json({ error: "invalid_gameId" }, { status: 422 });
  }

  await connectDB();

  const playSession = await PlaySessionModel.findOne({
    userId: session.userId,
    gameId,
    isActive: true,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!playSession) {
    return NextResponse.json({ error: "no_active_session" }, { status: 404 });
  }

  const runContext = await RunContextModel.findOne({
    playSessionId: playSession._id,
  })
    .sort({ updatedAt: -1 })
    .lean();

  if (!runContext) {
    return NextResponse.json({ error: "no_run_context" }, { status: 404 });
  }

  return NextResponse.json({
    playSessionId: playSession._id.toString(),
    runContext: serializeRunContext(runContext),
  });
}
