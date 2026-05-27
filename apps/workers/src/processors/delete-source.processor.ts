import type { Job } from "bullmq";
import { rm } from "fs/promises";
import path from "path";
import type { DeleteSourceJobData } from "../queues/delete-source.queue.js";
import { workerConfig } from "../config/worker.config.js";
import { RagSourceModel } from "../models/rag-source.model.js";
import { RagDocumentModel } from "../models/rag-document.model.js";
import { RagIngestionJobModel } from "../models/rag-ingestion-job.model.js";
import { deleteVectorsBySourceId } from "../services/vector/chroma.client.js";

export async function processDeleteSourceJob(
  job: Job<DeleteSourceJobData>
): Promise<void> {
  const { sourceId, previousStatus } = job.data;

  try {
    // Delete all vectors from the shared ChromaDB collection for this source.
    // Idempotent: if no vectors exist for this source_id, ChromaDB is a no-op.
    await deleteVectorsBySourceId(sourceId);

    // Hard-delete all related MongoDB records
    await RagDocumentModel.deleteMany({ sourceId });
    await RagIngestionJobModel.deleteMany({ sourceId });

    // Read sourceType before deleting the source document
    const source = await RagSourceModel.findById(sourceId).select("sourceType").lean();
    await RagSourceModel.findByIdAndDelete(sourceId);

    // Disk cleanup for file-upload sources (best-effort, non-fatal)
    if (source?.sourceType === "file") {
      const uploadDir = path.join(workerConfig.INGEST_UPLOAD_DIR, sourceId);
      try {
        await rm(uploadDir, { recursive: true, force: true });
        console.log(`[delete-source] disk cleanup done for sourceId=${sourceId}`);
      } catch (diskErr) {
        console.error(
          `[delete-source] disk cleanup failed for sourceId=${sourceId}:`,
          diskErr
        );
      }
    }

    console.log(`[delete-source] sourceId=${sourceId} fully deleted`);
  } catch (err) {
    const isLastAttempt =
      job.attemptsMade >= ((job.opts.attempts ?? 1) - 1);

    if (isLastAttempt) {
      await RagSourceModel.findByIdAndUpdate(sourceId, {
        status: previousStatus,
        previousStatus: null,
      }).catch((resetErr) => {
        console.error(
          `[delete-source] failed to reset status for sourceId=${sourceId}:`,
          resetErr
        );
      });
      console.error(
        `[delete-source] all retries exhausted for sourceId=${sourceId}, status reset to "${previousStatus}"`
      );
    }

    throw err;
  }
}
