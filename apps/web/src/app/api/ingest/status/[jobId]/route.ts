import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { RagIngestionJobModel } from "@/models/rag-ingestion-job.model";
import { RagSourceModel } from "@/models/rag-source.model";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;
  await connectDB();

  const job = await RagIngestionJobModel.findById(jobId).lean();
  if (!job) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (session.role !== "admin") {
    const source = await RagSourceModel.findById(job.sourceId)
      .select("createdBy")
      .lean();
    if (!source || source.createdBy?.toString() !== session.userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json({
    status: job.status,
    progress: job.progress,
    totalChunks: job.totalChunks,
    processedChunks: job.processedChunks,
    error: job.error ?? null,
    startedAt: job.startedAt ?? null,
    finishedAt: job.finishedAt ?? null,
  });
}
