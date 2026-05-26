import type { Job } from 'bullmq';
import { RagSource, RagIngestionJob } from '@secondseat/db';
import { deleteVectorsBySourceId } from '../services/chroma.js';
import type { DeleteSourceJobData } from './delete-source.types.js';

interface DeleteSourceOptions {
  chromaUrl: string;
  collectionName: string;
}

export async function processDeleteSourceJob(
  job: Job<DeleteSourceJobData>,
  opts: DeleteSourceOptions,
): Promise<void> {
  const { sourceId } = job.data;

  const source = await RagSource.findById(sourceId);
  if (!source) {
    // Already gone — nothing to do
    return;
  }

  const previousStatus = source.previousStatus ?? 'failed';

  try {
    // 1. Delete vectors from ChromaDB (no-op if collection/vectors absent)
    await deleteVectorsBySourceId({
      chromaUrl: opts.chromaUrl,
      collectionName: opts.collectionName,
      sourceId,
    });

    // 2. Hard-delete all associated ingestion job records
    await RagIngestionJob.deleteMany({ sourceId });

    // 3. Hard-delete the source record itself
    await RagSource.findByIdAndDelete(sourceId);
  } catch (err) {
    // Restore status so the user can retry the delete from the UI
    await RagSource.findByIdAndUpdate(sourceId, { status: previousStatus });
    throw err;
  }
}
