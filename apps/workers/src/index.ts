import { Worker } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { startHealthServer } from "./health.js";
import { workerConfig } from "./config/worker.config.js";
import { connectDB } from "./lib/db.js";
import { processIngestionJob } from "./processors/ingestion.processor.js";
import { processDeleteSourceJob } from "./processors/delete-source.processor.js";
import { warmupEmbeddingModel } from "./services/embed/embedding.service.js";
import type { IngestionJobData } from "./queues/ingestion-queue.js";
import type { DeleteSourceJobData } from "./queues/delete-source.queue.js";

const port = Number(process.env["WORKERS_HEALTH_PORT"] ?? 4100);

async function main(): Promise<void> {
  await connectDB();
  console.log("[worker] MongoDB connected");

  // Pre-load the embedding model so the first job doesn't pay the download cost
  console.log("[worker] warming up embedding model…");
  await warmupEmbeddingModel();

  const connection = new IORedis(workerConfig.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  const worker = new Worker<IngestionJobData>(
    workerConfig.INGEST_QUEUE_NAME,
    async (job) => {
      console.log(
        `[worker] processing job ${job.id} sourceId=${job.data.sourceId}`
      );
      await processIngestionJob(job);
    },
    { connection, concurrency: 1 }
  );

  worker.on("completed", (job) => {
    console.log(`[worker] job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker] job ${job?.id} failed: ${err.message}`);
  });

  // BullMQ failure listener — captures errors even when the processor crashes
  // mid-update (covers US.I-C.3 "human-readable summary" requirement)
  worker.on("error", (err) => {
    console.error("[worker] BullMQ error:", err.message);
  });

  const deleteWorker = new Worker<DeleteSourceJobData>(
    workerConfig.DELETE_QUEUE_NAME,
    async (job) => {
      console.log(
        `[delete-worker] processing job ${job.id} sourceId=${job.data.sourceId}`
      );
      await processDeleteSourceJob(job);
    },
    { connection, concurrency: 2 }
  );

  deleteWorker.on("completed", (job) => {
    console.log(`[delete-worker] job ${job.id} completed`);
  });

  deleteWorker.on("failed", (job, err) => {
    console.error(`[delete-worker] job ${job?.id} failed: ${err.message}`);
  });

  deleteWorker.on("error", (err) => {
    console.error("[delete-worker] BullMQ error:", err.message);
  });

  startHealthServer(port);
  console.log(
    `[worker] listening on queue="${workerConfig.INGEST_QUEUE_NAME}" health=:${port}`
  );
}

main().catch((err: Error) => {
  console.error("[worker] startup failed:", err.message);
  process.exit(1);
});
