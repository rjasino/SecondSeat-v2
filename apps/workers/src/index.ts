import { Redis as IORedis } from 'ioredis';
import { Worker } from 'bullmq';
import { connect } from '@secondseat/db';
import { loadConfig } from './config/index.js';
import { createHealthServer } from './health.js';
import { processIngestionJob } from './processors/ingestion.processor.js';
import type { IngestionJobData } from './processors/ingestion.types.js';

const config = loadConfig();

await connect(config.MONGODB_URI);
console.log('[workers] MongoDB connected');

const connection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });

const ingestionWorker = new Worker<IngestionJobData>(
  'ingestion',
  (job) =>
    processIngestionJob(job, {
      chromaUrl: config.CHROMA_URL,
      collectionName: config.CHROMA_COLLECTION_NAME,
    }),
  {
    connection,
    concurrency: 1,
  },
);

ingestionWorker.on('completed', (job) => {
  console.log(`[workers] ingestion job ${job.id} completed`);
});

ingestionWorker.on('failed', (job, err) => {
  console.error(`[workers] ingestion job ${job?.id} failed:`, err.message);
});

const server = createHealthServer();
server.listen(config.WORKER_HEALTH_PORT, () => {
  console.log(`[workers] health probe on :${config.WORKER_HEALTH_PORT}`);
});
