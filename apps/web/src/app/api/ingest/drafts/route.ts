import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { RagSourceModel } from "@/models/rag-source.model";
import { UserModel } from "@/models/user.model";
import { getSession } from "@/lib/session";
import { createDraftSchema } from "@/lib/ingest/schemas";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.role !== "author") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = createDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.issues },
      { status: 422 },
    );
  }

  const { title, game, guideType, content } = parsed.data;

  await connectDB();

  const user = await UserModel.findById(session.userId).lean();
  const author = user?.name ?? session.userId;

  const source = await RagSourceModel.create({
    title,
    sourceType: "text",
    status: "draft",
    content: content ?? "",
    createdBy: session.userId,
    metadata: {
      game,
      guideType,
      author,
      charCount: content?.length ?? 0,
      wordCount: content ? countWords(content) : 0,
    },
  });

  return NextResponse.json(
    { sourceId: source._id.toString(), status: "draft" },
    { status: 201 },
  );
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
