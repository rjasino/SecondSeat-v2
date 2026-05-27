import { RagIngestionJobModel } from "../models/rag-ingestion-job.model.js";
import { RagSourceModel } from "../models/rag-source.model.js";

export async function markJobProcessing(
  jobDocId: string,
  sourceId: string
): Promise<void> {
  await RagIngestionJobModel.findByIdAndUpdate(jobDocId, {
    $set: { status: "processing", startedAt: new Date() },
  });
  await RagSourceModel.findByIdAndUpdate(sourceId, {
    $set: { status: "processing", startedAt: new Date() },
  });
}

export async function setTotalChunks(
  jobDocId: string,
  totalChunks: number
): Promise<void> {
  await RagIngestionJobModel.findByIdAndUpdate(jobDocId, {
    $set: { totalChunks },
  });
}

export async function incrementProgress(
  jobDocId: string,
  processedSoFar: number,
  totalChunks: number
): Promise<void> {
  const progress = Math.floor((processedSoFar / totalChunks) * 100);
  await RagIngestionJobModel.findByIdAndUpdate(jobDocId, {
    $inc: { processedChunks: 1 },
    $set: { progress },
  });
}

export async function markJobCompleted(
  jobDocId: string,
  sourceId: string
): Promise<void> {
  const now = new Date();
  await RagIngestionJobModel.findByIdAndUpdate(jobDocId, {
    $set: { status: "completed", progress: 100, finishedAt: now },
  });
  await RagSourceModel.findByIdAndUpdate(sourceId, {
    $set: { status: "completed", finishedAt: now },
  });
}

export async function markJobFailed(
  jobDocId: string,
  sourceId: string,
  errorCode: string,
  rawMessage: string
): Promise<void> {
  const now = new Date();
  const safeError = `${errorCode}: ${rawMessage}`.slice(0, 1024);
  await RagIngestionJobModel.findByIdAndUpdate(jobDocId, {
    $set: { status: "failed", error: safeError, finishedAt: now },
  });
  await RagSourceModel.findByIdAndUpdate(sourceId, {
    $set: { status: "failed", finishedAt: now },
  });
}
