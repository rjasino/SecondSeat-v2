import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { PlaySessionModel } from "@/models/play-session.model";
import { RunContextModel } from "@/models/run-context.model";
import { objectId, START_OF_GAME_CONTEXT } from "@/lib/play/schemas";
import { serializeRunContext } from "@/lib/play/serialize";

export const runtime = "nodejs";

const newRunSchema = z.object({ gameId: objectId });

/**
 * New run: create an active PlaySession for the authed user + game, plus an
 * initial start-of-game RunContext. Any prior active session for the same
 * user+game is closed so "the active session" stays unambiguous for load.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = newRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  await connectDB();

  // Close any existing active session for this user+game.
  await PlaySessionModel.updateMany(
    { userId: session.userId, gameId: parsed.data.gameId, isActive: true },
    { isActive: false, endedAt: new Date() }
  );

  const playSession = await PlaySessionModel.create({
    userId: session.userId,
    gameId: parsed.data.gameId,
    isActive: true,
  });

  const runContext = await RunContextModel.create({
    playSessionId: playSession._id,
    ...START_OF_GAME_CONTEXT,
  });

  return NextResponse.json(
    {
      playSessionId: playSession._id.toString(),
      runContext: serializeRunContext(runContext),
    },
    { status: 201 }
  );
}
