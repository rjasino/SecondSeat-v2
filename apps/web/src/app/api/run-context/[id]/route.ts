import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { PlaySessionModel } from "@/models/play-session.model";
import { RunContextModel } from "@/models/run-context.model";
import { objectIdRegex, runContextFieldsSchema } from "@/lib/play/schemas";
import { serializeRunContext } from "@/lib/play/serialize";

export const runtime = "nodejs";

/**
 * Update a run context in place (latest wins — no versioning). Scoped to the
 * authed user: the context's PlaySession must belong to them, else 404 (we do
 * not reveal whether someone else's context exists).
 */
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!objectIdRegex.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 422 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = runContextFieldsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  await connectDB();

  const runContext = await RunContextModel.findById(id);
  if (!runContext) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Ownership check: the parent PlaySession must belong to the authed user.
  const playSession = await PlaySessionModel.findById(runContext.playSessionId)
    .select("userId")
    .lean();
  if (!playSession || playSession.userId.toString() !== session.userId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  runContext.gameArea = parsed.data.gameArea;
  runContext.subArea = parsed.data.subArea;
  runContext.playerGoal = parsed.data.playerGoal;
  runContext.confidenceLevel = parsed.data.confidenceLevel;
  runContext.chapter = parsed.data.chapter ?? undefined;
  await runContext.save();

  return NextResponse.json({ runContext: serializeRunContext(runContext) });
}
