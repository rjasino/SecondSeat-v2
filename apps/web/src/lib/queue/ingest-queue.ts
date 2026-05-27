import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config";

export interface IngestionJobData {
  sourceId: string;
  jobDocId: string;
  gameId: string;
  author: string;
}

let _connection: IORedis | null = null;
let _queue: Queue<IngestionJobData> | null = null;

function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }
  return _connection;
}

export function getIngestionQueue(): Queue<IngestionJobData> {
  if (!_queue) {
    _queue = new Queue<IngestionJobData>(config.INGEST_QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return _queue;
}

export async function enqueueIngestionJob(
  sourceId: string,
  jobDocId: string,
  gameId: string,
  author: string
): Promise<string> {
  const queue = getIngestionQueue();
  const job = await queue.add(
    "process-source",
    { sourceId, jobDocId, gameId, author },
    { jobId: `ingest-${sourceId}-${Date.now()}` }
  );
  return job.id ?? `ingest-${sourceId}`;
}
