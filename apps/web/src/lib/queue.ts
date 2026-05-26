import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// ─── Job data contract (shared with apps/workers) ─────────────────────────────

export interface IngestionJobData {
  sourceId: string;
  jobMongoId: string;
}

// ─── Singletons ───────────────────────────────────────────────────────────────

let _connection: IORedis | null = null;
let _queue: Queue<IngestionJobData> | null = null;

function getConnection(redisUrl: string): IORedis {
  if (!_connection) {
    _connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null, // required by BullMQ
    });
  }
  return _connection;
}

/**
 * Return the singleton BullMQ ingestion queue.
 * redisUrl is required on first call; ignored on subsequent calls.
 */
export function getIngestionQueue(redisUrl: string): Queue<IngestionJobData> {
  if (!_queue) {
    _queue = new Queue<IngestionJobData>('ingestion', {
      connection: getConnection(redisUrl),
    });
  }
  return _queue;
}
