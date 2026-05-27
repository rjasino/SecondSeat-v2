import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config";

export interface DeleteSourceJobData {
  sourceId: string;
  previousStatus: string;
}

let _connection: IORedis | null = null;
let _queue: Queue<DeleteSourceJobData> | null = null;

function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }
  return _connection;
}

export function getDeleteQueue(): Queue<DeleteSourceJobData> {
  if (!_queue) {
    _queue = new Queue<DeleteSourceJobData>(config.DELETE_QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: config.DELETE_QUEUE_ATTEMPTS,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return _queue;
}

export async function enqueueDeleteSourceJob(
  sourceId: string,
  previousStatus: string
): Promise<string> {
  const queue = getDeleteQueue();
  const job = await queue.add(
    "delete-source",
    { sourceId, previousStatus },
    { jobId: `delete-${sourceId}` }
  );
  return job.id ?? `delete-${sourceId}`;
}
