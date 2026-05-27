import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { RagSourceModel } from "@/models/rag-source.model";
import { RagIngestionJobModel } from "@/models/rag-ingestion-job.model";
import { getSession } from "@/lib/session";
import { enqueueDeleteSourceJob } from "@/lib/queue/delete-queue";

export const runtime = "nodejs";

export async function GET(
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

  const source = await RagSourceModel.findById(sourceId)
    .select("-sourceUri")
    .lean();
  if (!source) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const jobs = await RagIngestionJobModel.find({ sourceId })
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ source, jobs });
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

  const { sourceId } = await params;
  await connectDB();

  const source = await RagSourceModel.findById(sourceId);
  if (!source) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (source.status === "processing") {
    return NextResponse.json(
      { error: "conflict", hint: "Wait for the job to finish before deleting." },
      { status: 409 }
    );
  }

  // Idempotent: already queued for deletion — return the existing job reference
  if (source.status === "deleting") {
    const existingJob = await RagIngestionJobModel.findOne({ sourceId })
      .sort({ createdAt: -1 })
      .lean();
    return NextResponse.json(
      { jobId: existingJob?._id.toString() ?? null },
      { status: 202 }
    );
  }

  const previousStatus = source.status;
  await RagSourceModel.findByIdAndUpdate(sourceId, {
    status: "deleting",
    previousStatus,
  });

  const jobId = await enqueueDeleteSourceJob(sourceId, previousStatus);

  console.log(
    `[audit] source delete queued adminId=${session.userId} sourceId=${sourceId} jobId=${jobId} ts=${new Date().toISOString()}`
  );

  return NextResponse.json({ jobId }, { status: 202 });
}
