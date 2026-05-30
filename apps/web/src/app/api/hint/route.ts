import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { config } from "@/lib/config";

const objectIdRegex = /^[a-f\d]{24}$/i;

const hintRequestSchema = z.object({
  playSessionId: z.string().regex(objectIdRegex, "Must be a valid MongoDB ObjectId"),
  runContextId: z.string().regex(objectIdRegex, "Must be a valid MongoDB ObjectId"),
  gameId: z.string().regex(objectIdRegex, "Must be a valid MongoDB ObjectId"),
  gameArea: z.string().min(1).max(100),
  chapter: z.string().min(1).max(100).optional(),
  subArea: z.string().min(1).max(100).optional(),
  playerGoal: z.enum(["progression", "exploration", "confirmation", "completion"]),
  confidenceLevel: z.enum(["confident", "uncertain", "stuck"]),
  text: z.string().min(1).max(500),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = hintRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        details: parsed.error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      },
      { status: 422 }
    );
  }

  const upstreamUrl = `${config.INFERENCE_URL}/api/v1/generate`;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Secret": config.INFERENCE_SERVICE_SECRET,
        "X-User-Id": session.userId,
        "X-User-Role": session.role,
      },
      body: JSON.stringify(parsed.data),
    });
  } catch {
    return NextResponse.json(
      { error: "Inference service unreachable" },
      { status: 502 }
    );
  }

  if (!upstreamRes.ok || !upstreamRes.body) {
    return NextResponse.json(
      { error: "Inference service error", status: upstreamRes.status },
      { status: 502 }
    );
  }

  return new NextResponse(upstreamRes.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
