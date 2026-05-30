import { RagSourceModel } from "@/models/rag-source.model";
import { RagIngestionJobModel } from "@/models/rag-ingestion-job.model";
import { enqueueIngestionJob } from "@/lib/queue/ingest-queue";
import { config } from "@/lib/config";

export interface EnqueueResult {
  jobId: string;
  queueJobUuid: string;
}

export async function enqueueSourceForIngestion(
  sourceId: string
): Promise<EnqueueResult> {
  const source = await RagSourceModel.findById(sourceId).select("metadata").lean();
  const meta = source?.metadata as Record<string, unknown> | undefined;
  const gameId =
    typeof meta?.["game"] === "string" ? meta["game"] : config.GAME_ID;
  const author = typeof meta?.["author"] === "string" ? meta["author"] : "";

  const ingestionJob = await RagIngestionJobModel.create({
    sourceId,
    status: "queued",
  });
  const jobDocId = ingestionJob._id.toString();

  let queueJobUuid: string;
  try {
    queueJobUuid = await enqueueIngestionJob(sourceId, jobDocId, gameId, author);
  } catch (err) {
    await RagSourceModel.findByIdAndUpdate(sourceId, { status: "failed" });
    await RagIngestionJobModel.findByIdAndUpdate(ingestionJob._id, {
      status: "failed",
      error:
        err instanceof Error
          ? err.message.slice(0, 1024)
          : "queue_enqueue_failed",
    });
    throw err;
  }

  await RagIngestionJobModel.findByIdAndUpdate(ingestionJob._id, {
    queueJobUuid,
  });
  await RagSourceModel.findByIdAndUpdate(sourceId, { status: "queued" });

  return { jobId: jobDocId, queueJobUuid };
}

