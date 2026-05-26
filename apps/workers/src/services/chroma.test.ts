import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture mock fns so we can inspect calls directly
const mockUpsert = vi.fn().mockResolvedValue(undefined);
const mockGetOrCreateCollection = vi.fn().mockResolvedValue({ upsert: mockUpsert });

vi.mock('chromadb', () => ({
  ChromaClient: vi.fn().mockImplementation(() => ({
    getOrCreateCollection: mockGetOrCreateCollection,
  })),
}));

const { upsertVector } = await import('./chroma.js');

const BASE_PARAMS = {
  chromaUrl: 'http://localhost:8000',
  collectionName: 'test_collection',
  sourceId: 'abc123',
  chunkIndex: 0,
  embedding: new Array(384).fill(0.1) as number[],
  document: 'chunk text',
  metadata: {
    sourceId: 'abc123',
    chunkIndex: 0,
    game: 'Elden Ring',
    area: 'Limgrave',
    spoilerLevel: 'none',
  } as const,
};

describe('upsertVector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set return value after clearAllMocks resets it
    mockGetOrCreateCollection.mockResolvedValue({ upsert: mockUpsert });
    mockUpsert.mockResolvedValue(undefined);
  });

  it('returns the stable id <sourceId>_<chunkIndex>', async () => {
    const id = await upsertVector(BASE_PARAMS);
    expect(id).toBe('abc123_0');
  });

  it('calls collection.upsert with the correct shape', async () => {
    await upsertVector(BASE_PARAMS);
    expect(mockUpsert).toHaveBeenCalledWith({
      ids: ['abc123_0'],
      embeddings: [BASE_PARAMS.embedding],
      documents: [BASE_PARAMS.document],
      metadatas: [BASE_PARAMS.metadata],
    });
  });

  it('uses a different stable id for a different chunkIndex', async () => {
    const id = await upsertVector({ ...BASE_PARAMS, chunkIndex: 5 });
    expect(id).toBe('abc123_5');
  });

  it('rethrows ChromaDB errors so BullMQ can retry', async () => {
    mockUpsert.mockRejectedValueOnce(new Error('ChromaDB unreachable'));
    await expect(upsertVector(BASE_PARAMS)).rejects.toThrow('ChromaDB unreachable');
  });
});
