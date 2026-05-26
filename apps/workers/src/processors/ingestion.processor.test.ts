import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import type { IngestionJobData } from './ingestion.types.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@secondseat/db', () => {
  const makeModel = () => ({
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn().mockResolvedValue({ processedChunks: 1, totalChunks: 2 }),
    findOneAndUpdate: vi.fn().mockResolvedValue({}),
  });
  return {
    RagSource: makeModel(),
    RagIngestionJob: makeModel(),
    RagDocument: makeModel(),
  };
});

vi.mock('@secondseat/embedding', () => ({
  embed: vi.fn().mockResolvedValue(new Array(384).fill(0.1)),
}));

vi.mock('../services/chunker.js', () => ({
  chunkMarkdown: vi.fn().mockReturnValue([
    { text: 'chunk one', tokens: 10 },
    { text: 'chunk two', tokens: 15 },
  ]),
}));

vi.mock('../services/chroma.js', () => ({
  upsertVector: vi.fn().mockResolvedValue('sourceId_0'),
}));

// Import after mocks
const { processIngestionJob } = await import('./ingestion.processor.js');
const { RagSource, RagIngestionJob, RagDocument } = await import('@secondseat/db');
const { embed } = await import('@secondseat/embedding');
const { chunkMarkdown } = await import('../services/chunker.js');
const { upsertVector } = await import('../services/chroma.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEPS = { chromaUrl: 'http://localhost:8000', collectionName: 'test_col' };

function makeJob(data: IngestionJobData): Job<IngestionJobData> {
  return { data } as unknown as Job<IngestionJobData>;
}

const MOCK_SOURCE = {
  _id: 'src1',
  content: '# Guide\n\nSome content.',
  metadata: { game: 'Elden Ring', area: 'Limgrave', spoilerLevel: 'none' },
  status: 'queued',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('processIngestionJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset findByIdAndUpdate to return a sensible progress object
    (RagIngestionJob.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({
      processedChunks: 1,
      totalChunks: 2,
    });
    (RagSource.findById as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SOURCE);
  });

  it('loads the source by sourceId and throws if not found', async () => {
    (RagSource.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await expect(
      processIngestionJob(makeJob({ sourceId: 'missing', jobMongoId: 'job1' }), DEPS),
    ).rejects.toThrow('RagSource not found: missing');
  });

  it('marks the job and source as processing on start', async () => {
    await processIngestionJob(makeJob({ sourceId: 'src1', jobMongoId: 'job1' }), DEPS);
    expect(RagIngestionJob.findByIdAndUpdate).toHaveBeenCalledWith(
      'job1',
      expect.objectContaining({ status: 'processing' }),
    );
    expect(RagSource.findByIdAndUpdate).toHaveBeenCalledWith(
      'src1',
      expect.objectContaining({ status: 'processing' }),
    );
  });

  it('sets totalChunks from chunk count', async () => {
    await processIngestionJob(makeJob({ sourceId: 'src1', jobMongoId: 'job1' }), DEPS);
    expect(RagIngestionJob.findByIdAndUpdate).toHaveBeenCalledWith('job1', { totalChunks: 2 });
  });

  it('calls embed for each chunk', async () => {
    await processIngestionJob(makeJob({ sourceId: 'src1', jobMongoId: 'job1' }), DEPS);
    expect(embed).toHaveBeenCalledTimes(2);
    expect(embed).toHaveBeenCalledWith('chunk one');
    expect(embed).toHaveBeenCalledWith('chunk two');
  });

  it('calls upsertVector for each chunk with the stable id', async () => {
    await processIngestionJob(makeJob({ sourceId: 'src1', jobMongoId: 'job1' }), DEPS);
    expect(upsertVector).toHaveBeenCalledTimes(2);
    expect(upsertVector).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'src1', chunkIndex: 0 }),
    );
    expect(upsertVector).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'src1', chunkIndex: 1 }),
    );
  });

  it('writes a rag_documents record per chunk with correct fields', async () => {
    await processIngestionJob(makeJob({ sourceId: 'src1', jobMongoId: 'job1' }), DEPS);
    expect(RagDocument.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(RagDocument.findOneAndUpdate).toHaveBeenCalledWith(
      { sourceId: 'src1', chunkIndex: 0 },
      expect.objectContaining({
        content: 'chunk one',
        tokens: 10,
        sourceId: 'src1',
        chunkIndex: 0,
      }),
      { upsert: true, new: true },
    );
  });

  it('increments processedChunks via $inc for each chunk', async () => {
    await processIngestionJob(makeJob({ sourceId: 'src1', jobMongoId: 'job1' }), DEPS);
    expect(RagIngestionJob.findByIdAndUpdate).toHaveBeenCalledWith(
      'job1',
      { $inc: { processedChunks: 1 } },
      { new: true },
    );
  });

  it('marks job and source completed after all chunks', async () => {
    await processIngestionJob(makeJob({ sourceId: 'src1', jobMongoId: 'job1' }), DEPS);
    expect(RagIngestionJob.findByIdAndUpdate).toHaveBeenCalledWith(
      'job1',
      expect.objectContaining({ status: 'completed', progress: 100 }),
    );
    expect(RagSource.findByIdAndUpdate).toHaveBeenCalledWith(
      'src1',
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('marks job and source failed and throws when no chunks are produced', async () => {
    (chunkMarkdown as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);
    await expect(
      processIngestionJob(makeJob({ sourceId: 'src1', jobMongoId: 'job1' }), DEPS),
    ).rejects.toThrow('No chunks produced');
    expect(RagIngestionJob.findByIdAndUpdate).toHaveBeenCalledWith(
      'job1',
      expect.objectContaining({ status: 'failed', error: 'No chunks produced' }),
    );
    expect(RagSource.findByIdAndUpdate).toHaveBeenCalledWith(
      'src1',
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('rethrows embed errors so BullMQ can retry', async () => {
    (embed as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('embed failed'));
    await expect(
      processIngestionJob(makeJob({ sourceId: 'src1', jobMongoId: 'job1' }), DEPS),
    ).rejects.toThrow('embed failed');
  });

  it('rethrows upsertVector errors so BullMQ can retry', async () => {
    (upsertVector as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('ChromaDB unreachable'),
    );
    await expect(
      processIngestionJob(makeJob({ sourceId: 'src1', jobMongoId: 'job1' }), DEPS),
    ).rejects.toThrow('ChromaDB unreachable');
  });
});
