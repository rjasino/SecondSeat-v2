import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// ─── Job data contracts (shared with apps/workers) ────────────────────────────

export interface IngestionJobData {
  sourceId: string;
  jobMongoId: string;
}

export interface DeleteSourceJobData {
  sourceId: string;
}

// ─── Singletons ───────────────────────────────────────────────────────────────

let _connection: IORedis | null = null;
let _ingestionQueue: Queue<IngestionJobData> | null = null;
let _deleteSourceQueue: Queue<DeleteSourceJobData> | null = null;

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
  if (!_ingestionQueue) {
    _ingestionQueue = new Queue<IngestionJobData>('ingestion', {
      connection: getConnection(redisUrl),
    });
  }
  return _ingestionQueue;
}

/**
 * Return the singleton BullMQ delete-source queue.
 */
export function getDeleteSourceQueue(redisUrl: string): Queue<DeleteSourceJobData> {
  if (!_deleteSourceQueue) {
    _deleteSourceQueue = new Queue<DeleteSourceJobData>('delete-source', {
      connection: getConnection(redisUrl),
    });
  }
  return _deleteSourceQueue;
}
