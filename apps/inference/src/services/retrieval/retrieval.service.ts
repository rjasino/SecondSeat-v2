import { ChromaClient } from "chromadb";
import { embedText } from "@secondseat/embedding";
import { inferenceConfig, RETRIEVAL_MAX_L2_DISTANCE } from "../../config/config.js";

export interface RetrievedChunk {
  id: string;
  sourceId: string;
  documentId: string;
  chunkIndex: number;
  headingPath: string;
  content: string;
  similarityScore: number; // cosine similarity (0–1)
  spoiler: boolean;
}

let _client: ChromaClient | null = null;

function getClient(): ChromaClient {
  if (!_client) {
    _client = new ChromaClient({ path: inferenceConfig.CHROMA_URL });
  }
  return _client;
}

/**
 * Embeds the player query, queries ChromaDB for the top-k matching chunks
 * scoped to the given gameId, and filters out results below the minimum
 * similarity threshold.
 *
 * Distance metric: L2 (ChromaDB default). For normalized embeddings (all-MiniLM-L6-v2)
 * the conversion is: cosine_similarity = 1 - (l2_distance² / 2).
 */
export async function retrieveChunks(
  queryText: string,
  gameId: string
): Promise<RetrievedChunk[]> {
  const start = Date.now();

  const queryEmbedding = await embedText(queryText);

  const client = getClient();
  const collection = await client.getOrCreateCollection({
    name: inferenceConfig.CHROMA_COLLECTION,
  });

  const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: inferenceConfig.RETRIEVAL_K,
    where: { game_id: gameId },
  });

  const ids = results.ids[0] ?? [];
  const distances = results.distances?.[0] ?? [];
  const metadatas = results.metadatas[0] ?? [];
  const documents = results.documents[0] ?? [];

  const chunks: RetrievedChunk[] = [];

  for (let i = 0; i < ids.length; i++) {
    const l2Distance = distances[i] ?? Infinity;

    // Filter below similarity threshold
    if (l2Distance > RETRIEVAL_MAX_L2_DISTANCE) continue;

    // Cosine similarity from L2 distance (normalized vectors)
    const cosineSimilarity = 1 - (l2Distance * l2Distance) / 2;

    const meta = metadatas[i] ?? {};
    const rawSpoiler = (meta as Record<string, unknown>)["spoiler"];

    chunks.push({
      id: ids[i] ?? "",
      sourceId: String((meta as Record<string, unknown>)["source_id"] ?? ""),
      documentId: String((meta as Record<string, unknown>)["document_id"] ?? ""),
      chunkIndex: Number((meta as Record<string, unknown>)["chunk_index"] ?? 0),
      headingPath: String((meta as Record<string, unknown>)["heading_path"] ?? ""),
      content: documents[i] ?? "",
      similarityScore: Math.max(0, Math.min(1, cosineSimilarity)),
      // metadata.spoiler === undefined is treated as false (safe — see decisions.md)
      spoiler: rawSpoiler === true,
    });
  }

  const ms = Date.now() - start;
  console.log(
    `[retrieval] query="${queryText.slice(0, 40)}…" game=${gameId} k=${inferenceConfig.RETRIEVAL_K} returned=${chunks.length} chunks in ${ms}ms`
  );

  return chunks;
}
