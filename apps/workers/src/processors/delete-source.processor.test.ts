import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import type { DeleteSourceJobData } from './delete-source.types.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@secondseat/db', () => ({
  RagSource: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
    findByIdAndDelete: vi.fn().mockResolvedValue(null),
  },
  RagIngestionJob: {
    deleteMany: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../services/chroma.js', () => ({
  deleteVectorsBySourceId: vi.fn().mockResolvedValue(undefined),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { processDeleteSourceJob } from './delete-source.processor.js';
import { RagSource, RagIngestionJob } from '@secondseat/db';
import { deleteVectorsBySourceId } from '../services/chroma.js';

const mockRagSource = vi.mocked(RagSource);
const mockRagIngestionJob = vi.mocked(RagIngestionJob);
const mockDeleteVectors = vi.mocked(deleteVectorsBySourceId);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_SOURCE_ID = '507f1f77bcf86cd799439012';

function makeJob(sourceId = VALID_SOURCE_ID): Job<DeleteSourceJobData> {
  return { id: 'job-1', data: { sourceId } } as Job<DeleteSourceJobData>;
}

const OPTS = { chromaUrl: 'http://localhost:8000', collectionName: 'test_chunks' };

function makeSource(overrides: Record<string, unknown> = {}) {
  return {
    _id: VALID_SOURCE_ID,
    status: 'deleting',
    previousStatus: 'completed',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('processDeleteSourceJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRagSource.findById.mockResolvedValue(makeSource() as never);
    mockRagSource.findByIdAndUpdate.mockResolvedValue(null as never);
    mockRagSource.findByIdAndDelete.mockResolvedValue(null as never);
    mockRagIngestionJob.deleteMany.mockResolvedValue(null as never);
    mockDeleteVectors.mockResolvedValue(undefined);
  });

  it('returns early when source no longer exists (already deleted)', async () => {
    mockRagSource.findById.mockResolvedValue(null as never);
    await processDeleteSourceJob(makeJob(), OPTS);
    expect(mockDeleteVectors).not.toHaveBeenCalled();
    expect(mockRagSource.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('deletes vectors from ChromaDB with the correct sourceId and collection', async () => {
    await processDeleteSourceJob(makeJob(), OPTS);
    expect(mockDeleteVectors).toHaveBeenCalledWith({
      chromaUrl: OPTS.chromaUrl,
      collectionName: OPTS.collectionName,
      sourceId: VALID_SOURCE_ID,
    });
  });

  it('hard-deletes all associated ingestion jobs from MongoDB', async () => {
    await processDeleteSourceJob(makeJob(), OPTS);
    expect(mockRagIngestionJob.deleteMany).toHaveBeenCalledWith({ sourceId: VALID_SOURCE_ID });
  });

  it('hard-deletes the RagSource document from MongoDB', async () => {
    await processDeleteSourceJob(makeJob(), OPTS);
    expect(mockRagSource.findByIdAndDelete).toHaveBeenCalledWith(VALID_SOURCE_ID);
  });

  it('treats missing vectors as a no-op and still deletes MongoDB records', async () => {
    mockDeleteVectors.mockResolvedValue(undefined);
    await processDeleteSourceJob(makeJob(), OPTS);
    expect(mockRagIngestionJob.deleteMany).toHaveBeenCalled();
    expect(mockRagSource.findByIdAndDelete).toHaveBeenCalled();
  });

  it('resets source status to previousStatus on error', async () => {
    mockDeleteVectors.mockRejectedValue(new Error('ChromaDB unreachable'));
    await expect(processDeleteSourceJob(makeJob(), OPTS)).rejects.toThrow('ChromaDB unreachable');
    expect(mockRagSource.findByIdAndUpdate).toHaveBeenCalledWith(VALID_SOURCE_ID, {
      status: 'completed',
    });
  });

  it('falls back to "failed" when previousStatus is null', async () => {
    mockRagSource.findById.mockResolvedValue(makeSource({ previousStatus: null }) as never);
    mockDeleteVectors.mockRejectedValue(new Error('boom'));
    await expect(processDeleteSourceJob(makeJob(), OPTS)).rejects.toThrow('boom');
    expect(mockRagSource.findByIdAndUpdate).toHaveBeenCalledWith(VALID_SOURCE_ID, {
      status: 'failed',
    });
  });

  it('rethrows errors so BullMQ can track retries', async () => {
    mockDeleteVectors.mockRejectedValue(new Error('network error'));
    await expect(processDeleteSourceJob(makeJob(), OPTS)).rejects.toThrow('network error');
  });

  it('executes in order: vectors → jobs → source', async () => {
    const callOrder: string[] = [];
    mockDeleteVectors.mockImplementation(async () => { callOrder.push('vectors'); });
    mockRagIngestionJob.deleteMany.mockImplementation(async () => { callOrder.push('jobs'); return null; });
    mockRagSource.findByIdAndDelete.mockImplementation(async () => { callOrder.push('source'); return null; });

    await processDeleteSourceJob(makeJob(), OPTS);

    expect(callOrder).toEqual(['vectors', 'jobs', 'source']);
  });
});
