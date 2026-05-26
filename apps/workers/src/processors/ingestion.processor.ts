import crypto from 'node:crypto';
import { type Job } from 'bullmq';
import {
  RagSource,
  RagIngestionJob,
  RagDocument,
  type ISourceMetadata,
} from '@secondseat/db';
import { embed } from '@secondseat/embedding';
import { chunkMarkdown } from '../services/chunker.js';
import { upsertVector } from '../services/chroma.js';
import type { IngestionJobData } from './ingestion.types.js';

export interface ProcessorDeps {
  chromaUrl: string;
  collectionName: string;
}

/**
 * BullMQ processor for the `ingestion` queue.
 *
 * Flow: load source → chunk markdown → embed each chunk → upsert to ChromaDB
 * → write rag_documents → update job progress → mark completed.
 */
export async function processIngestionJob(
  job: Job<IngestionJobData>,
  deps: ProcessorDeps,
): Promise<void> {
  const { sourceId, jobMongoId } = job.data;
  const { chromaUrl, collectionName } = deps;

  // ─── 1. Load source & mark processing ────────────────────────────────────

  const source = await RagSource.findById(sourceId);
  if (!source) throw new Error(`RagSource not found: ${sourceId}`);

  await Promise.all([
    RagIngestionJob.findByIdAndUpdate(jobMongoId, {
      status: 'processing',
      startedAt: new Date(),
    }),
    RagSource.findByIdAndUpdate(sourceId, { status: 'processing', startedAt: new Date() }),
  ]);

  // ─── 2. Chunk markdown ────────────────────────────────────────────────────

  const chunks = chunkMarkdown(source.content);

  if (chunks.length === 0) {
    const err = 'No chunks produced';
    await Promise.all([
      RagIngestionJob.findByIdAndUpdate(jobMongoId, {
        status: 'failed',
        error: err,
        finishedAt: new Date(),
      }),
      RagSource.findByIdAndUpdate(sourceId, { status: 'failed', finishedAt: new Date() }),
    ]);
    throw new Error(err);
  }

  await RagIngestionJob.findByIdAndUpdate(jobMongoId, { totalChunks: chunks.length });

  // ─── 3. Embed → upsert → record each chunk ────────────────────────────────

  const metadata: ISourceMetadata = source.metadata ?? {
    game: 'unknown',
    area: 'unknown',
    spoilerLevel: 'none',
  };

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex]!;

    // Embed — rethrow on failure so BullMQ retries
    const embedding = await embed(chunk.text);

    // Upsert to ChromaDB — rethrow on failure so BullMQ retries
    const vectorId = await upsertVector({
      chromaUrl,
      collectionName,
      sourceId,
      chunkIndex,
      embedding,
      document: chunk.text,
      metadata: {
        sourceId,
        chunkIndex,
        game: metadata.game,
        area: metadata.area,
        spoilerLevel: metadata.spoilerLevel,
      },
    });

    // Write rag_documents — upsert on { sourceId, chunkIndex } for idempotency
    const hash = crypto.createHash('sha256').update(chunk.text).digest('hex');
    await RagDocument.findOneAndUpdate(
      { sourceId, chunkIndex },
      {
        content: chunk.text,
        hash,
        vectorId,
        tokens: chunk.tokens,
        metadata,
        sourceId,
        chunkIndex,
      },
      { upsert: true, new: true },
    );

    // Increment processedChunks and recalculate progress
    const updatedJob = await RagIngestionJob.findByIdAndUpdate(
      jobMongoId,
      { $inc: { processedChunks: 1 } },
      { new: true },
    );
    if (updatedJob && updatedJob.totalChunks) {
      const progress = Math.round((updatedJob.processedChunks / updatedJob.totalChunks) * 100);
      await RagIngestionJob.findByIdAndUpdate(jobMongoId, { progress });
    }
  }

  // ─── 4. Mark completed ────────────────────────────────────────────────────

  const finishedAt = new Date();
  await Promise.all([
    RagIngestionJob.findByIdAndUpdate(jobMongoId, {
      status: 'completed',
      finishedAt,
      progress: 100,
    }),
    RagSource.findByIdAndUpdate(sourceId, { status: 'completed', finishedAt }),
  ]);
}
