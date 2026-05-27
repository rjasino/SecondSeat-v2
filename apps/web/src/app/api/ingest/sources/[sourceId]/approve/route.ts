import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { RagSourceModel } from "@/models/rag-source.model";
import { getSession } from "@/lib/session";
import { enqueueSourceForIngestion } from "@/lib/ingest/ingest.service";

export const runtime = "nodejs";

const approveBodySchema = z.object({
  content: z.string().min(1),
});

export async function POST(
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

  const { sourceId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = approveBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  await connectDB();

  const source = await RagSourceModel.findById(sourceId);
  if (!source) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (source.status !== "pending_review") {
    return NextResponse.json(
      { error: "conflict", hint: "Source must be in pending_review status to approve." },
      { status: 409 }
    );
  }

  await RagSourceModel.findByIdAndUpdate(source._id, {
    content: parsed.data.content,
  });

  let jobId: string;
  try {
    ({ jobId } = await enqueueSourceForIngestion(sourceId));
  } catch {
    return NextResponse.json({ error: "queue_unavailable" }, { status: 503 });
  }

  return NextResponse.json({ jobId, sourceId }, { status: 202 });
}
