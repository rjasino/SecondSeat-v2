import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { RagSourceModel } from "@/models/rag-source.model";
import { RagIngestionJobModel } from "@/models/rag-ingestion-job.model";
import { getSession } from "@/lib/session";
import { updateDraftSchema, draftSourceIdParamsSchema } from "@/lib/ingest/schemas";
export const runtime = "nodejs";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ sourceId: string }> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.role !== "author") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rawParams = await params;
  const parsedParams = draftSourceIdParamsSchema.safeParse(rawParams);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }
  const { sourceId } = parsedParams.data;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = updateDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.issues },
      { status: 422 }
    );
  }

  await connectDB();

  const source = await RagSourceModel.findById(sourceId);
  if (!source) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (source.status !== "draft") {
    return NextResponse.json(
      { error: "conflict", hint: "Only draft sources can be updated via this endpoint." },
      { status: 409 }
    );
  }

  const { title, game, guideType, author, content } = parsed.data;

  const charCount = content !== undefined ? content.length : (source.content?.length ?? 0);
  const wordCount = content !== undefined ? countWords(content) : 0;

  const updateFields: Record<string, unknown> = {
    "metadata.charCount": charCount,
    "metadata.wordCount": wordCount,
  };
  if (title !== undefined) updateFields["title"] = title;
  if (game !== undefined) updateFields["metadata.game"] = game;
  if (guideType !== undefined) updateFields["metadata.guideType"] = guideType;
  if (author !== undefined) updateFields["metadata.author"] = author;
  if (content !== undefined) updateFields["content"] = content;

  await RagSourceModel.findByIdAndUpdate(sourceId, { $set: updateFields });

  return NextResponse.json({
    sourceId,
    savedAt: new Date().toISOString(),
    charCount,
    wordCount,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ sourceId: string }> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.role !== "author") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rawParams = await params;
  const parsedParams = draftSourceIdParamsSchema.safeParse(rawParams);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }
  const { sourceId } = parsedParams.data;

  await connectDB();

  const source = await RagSourceModel.findById(sourceId);
  if (!source) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (source.status !== "draft") {
    return NextResponse.json(
      { error: "conflict", hint: "Only draft sources can be deleted via this endpoint." },
      { status: 409 }
    );
  }

  await RagIngestionJobModel.deleteMany({ sourceId });
  await RagSourceModel.findByIdAndDelete(sourceId);

  console.log(
    `[audit] draft deleted adminId=${session.userId} sourceId=${sourceId} ts=${new Date().toISOString()}`
  );

  return new NextResponse(null, { status: 204 });
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
