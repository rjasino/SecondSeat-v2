import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { RagSourceModel } from "@/models/rag-source.model";
import { RagIngestionJobModel } from "@/models/rag-ingestion-job.model";
import { getSession } from "@/lib/session";
import { enqueueIngestionJob } from "@/lib/queue/ingest-queue";

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

  const { sourceId } = await params;
  await connectDB();

  const source = await RagSourceModel.findById(sourceId);
  if (!source) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (source.status !== "failed") {
    return NextResponse.json(
      { error: "conflict", hint: "Only sources with status=failed can be retried." },
      { status: 409 }
    );
  }

  // Create new job record — preserve the failed one for history
  const newJob = await RagIngestionJobModel.create({
    sourceId: source._id,
    status: "queued",
  });

  const jobDocId = newJob._id.toString();

  let queueJobUuid: string;
  try {
    queueJobUuid = await enqueueIngestionJob(sourceId, jobDocId);
  } catch {
    await RagIngestionJobModel.findByIdAndDelete(newJob._id);
    return NextResponse.json({ error: "queue_unavailable" }, { status: 503 });
  }

  await RagIngestionJobModel.findByIdAndUpdate(newJob._id, { queueJobUuid });
  await RagSourceModel.findByIdAndUpdate(source._id, { status: "queued" });

  return NextResponse.json({ jobId: jobDocId, sourceId }, { status: 202 });
}
