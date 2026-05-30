import { ChromaClient } from "chromadb";
import { workerConfig } from "../../config/worker.config.js";

export interface VectorRecord {
  id: string;
  embedding: number[];
  metadata: {
    source_id: string;
    document_id: string;
    chunk_index: number;
    game_id: string;
    heading_path: string;
    author: string;
    // Structured location fields parsed from heading_path at ingest.
    // Used by inference as a soft Chroma `where` filter.
    route?: string;
    area?: string;
    sub_area?: string;
    // Content classification — frontmatter wins; else classifier; else "general".
    content_type: string;
    // Spoiler level 0–3 — frontmatter wins; else 0. Retrieval sets spoiler: true when >= 2.
    spoiler_level: number;
  };
  document: string;
}

let _client: ChromaClient | null = null;

function getClient(): ChromaClient {
  if (!_client) {
    _client = new ChromaClient({ path: workerConfig.CHROMA_URL });
  }
  return _client;
}

export async function upsertVectors(records: VectorRecord[]): Promise<void> {
  if (records.length === 0) return;

  const client = getClient();
  const collection = await client.getOrCreateCollection({
    name: workerConfig.CHROMA_COLLECTION,
  });

  await collection.upsert({
    ids: records.map((r) => r.id),
    embeddings: records.map((r) => r.embedding),
    metadatas: records.map((r) => r.metadata),
    documents: records.map((r) => r.document),
  });
}

export async function deleteVectors(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const client = getClient();
  const collection = await client.getOrCreateCollection({
    name: workerConfig.CHROMA_COLLECTION,
  });
  await collection.delete({ ids });
}

export async function deleteVectorsBySourceId(sourceId: string): Promise<void> {
  const client = getClient();
  const collection = await client.getOrCreateCollection({
    name: workerConfig.CHROMA_COLLECTION,
  });
  await collection.delete({ where: { source_id: sourceId } });
}
