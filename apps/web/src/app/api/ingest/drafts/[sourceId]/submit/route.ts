import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { RagSourceModel } from "@/models/rag-source.model";
import { getSession } from "@/lib/session";
import { draftSourceIdParamsSchema } from "@/lib/ingest/schemas";
import { enqueueSourceForIngestion } from "@/lib/ingest/ingest.service";

export const runtime = "nodejs";

export async function POST(
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
      { error: "conflict", hint: "Source must be in draft status to submit." },
      { status: 409 }
    );
  }
  if (!source.title?.trim()) {
    return NextResponse.json(
      { error: "validation_error", hint: "Title is required before submitting." },
      { status: 422 }
    );
  }
  if (!source.content?.trim()) {
    return NextResponse.json(
      { error: "validation_error", hint: "Content cannot be empty before submitting." },
      { status: 422 }
    );
  }

  let jobId: string;
  try {
    ({ jobId } = await enqueueSourceForIngestion(sourceId));
  } catch {
    return NextResponse.json({ error: "queue_unavailable" }, { status: 503 });
  }

  return NextResponse.json({ sourceId, jobId, status: "queued" });
}
