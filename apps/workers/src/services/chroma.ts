import { ChromaClient, type Collection } from 'chromadb';

export interface VectorMetadata {
  sourceId: string;
  chunkIndex: number;
  game: string;
  area: string;
  spoilerLevel: string;
}

// ─── Singleton collection cache ───────────────────────────────────────────────

const _collections = new Map<string, Collection>();
let _client: ChromaClient | null = null;

function getClient(chromaUrl: string): ChromaClient {
  if (!_client) {
    _client = new ChromaClient({ path: chromaUrl });
  }
  return _client;
}

async function getCollection(chromaUrl: string, collectionName: string): Promise<Collection> {
  const cached = _collections.get(collectionName);
  if (cached) return cached;

  const client = getClient(chromaUrl);
  // getOrCreateCollection is atomic — safe for concurrent workers
  const collection = await client.getOrCreateCollection({
    name: collectionName,
    metadata: { 'hnsw:space': 'cosine' },
  });
  _collections.set(collectionName, collection);
  return collection;
}

/**
 * Delete all vectors for a source by metadata filter.
 * Treats a missing or empty collection as a no-op (idempotent).
 *
 * Throws on ChromaDB errors so BullMQ can track retries.
 */
export async function deleteVectorsBySourceId(params: {
  chromaUrl: string;
  collectionName: string;
  sourceId: string;
}): Promise<void> {
  const { chromaUrl, collectionName, sourceId } = params;

  let collection: Collection;
  try {
    collection = await getCollection(chromaUrl, collectionName);
  } catch {
    // Collection does not exist — no vectors to delete
    return;
  }

  await collection.delete({ where: { sourceId } });
}

/**
 * Upsert a single chunk vector into ChromaDB.
 * The stable ID `<sourceId>_<chunkIndex>` ensures re-ingestion replaces rather than duplicates.
 *
 * Throws on ChromaDB errors so BullMQ can track retries.
 */
export async function upsertVector(params: {
  chromaUrl: string;
  collectionName: string;
  sourceId: string;
  chunkIndex: number;
  embedding: number[];
  document: string;
  metadata: VectorMetadata;
}): Promise<string> {
  const { chromaUrl, collectionName, sourceId, chunkIndex, embedding, document, metadata } = params;
  const id = `${sourceId}_${chunkIndex}`;

  const collection = await getCollection(chromaUrl, collectionName);
  await collection.upsert({
    ids: [id],
    embeddings: [embedding],
    documents: [document],
    metadatas: [metadata as unknown as Record<string, string | number>],
  });

  return id;
}
