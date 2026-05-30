import { ChromaClient, type Where } from "chromadb";
import { embedText } from "@secondseat/embedding";
import { GameModel } from "@secondseat/db";
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

/**
 * Run-context fields used to bias retrieval toward the player's current
 * location and goal. Mirrors the subset of `GenerateRequest` that the
 * retrieval service consumes.
 */
export interface RetrievalRunContext {
  gameArea: string;
  chapter?: string;
  subArea?: string;
  playerGoal: string;
}

/**
 * Reserved `subArea` value meaning "no sub-area / whole area". Required at the
 * request boundary, but treated as absent for retrieval so it never narrows the
 * location filter or pollutes the embedding query. Matched case-insensitively.
 */
const SUBAREA_NONE = "none";

/** Returns the sub-area if it is a usable location, or `undefined` for the `"none"` sentinel / empty. */
function usableSubArea(subArea?: string): string | undefined {
  if (!subArea || subArea.trim().toLowerCase() === SUBAREA_NONE) return undefined;
  return subArea;
}

let _client: ChromaClient | null = null;

function getClient(): ChromaClient {
  if (!_client) {
    _client = new ChromaClient({ path: inferenceConfig.CHROMA_URL });
  }
  return _client;
}

/**
 * Composes the embedding query string per SPEC-context-aware-retrieval Story 1:
 *   "<gameTitle> | <chapter> | <gameArea> | <subArea> | goal:<playerGoal> | <rawQuery>"
 *
 * Missing optional segments (currently only `subArea`) are dropped, not rendered
 * as empty tokens. Casing is preserved here — Chroma metadata is the only place
 * we lowercase for exact-equality filtering.
 */
export function buildEnrichedQuery(
  gameTitle: string,
  ctx: RetrievalRunContext,
  rawQuery: string
): string {
  return [
    gameTitle,
    ctx.chapter,
    ctx.gameArea,
    usableSubArea(ctx.subArea),
    `goal:${ctx.playerGoal}`,
    rawQuery,
  ]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join(" | ");
}

/**
 * Builds the `$or` clause that prefers chunks in the player's current location.
 * Returns `null` if no location fields are usable (caller should skip the
 * filter and query by `game_id` alone).
 */
function buildLocationOrClause(ctx: RetrievalRunContext): Where | null {
  const clauses: Where[] = [];
  const subArea = usableSubArea(ctx.subArea);
  if (ctx.chapter) clauses.push({ chapter: ctx.chapter.toLowerCase() });
  if (ctx.gameArea) clauses.push({ area: ctx.gameArea.toLowerCase() });
  if (subArea) clauses.push({ sub_area: subArea.toLowerCase() });
  if (clauses.length === 0) return null;
  if (clauses.length === 1) return clauses[0]!;
  return { $or: clauses } as Where;
}

interface ChromaQueryResult {
  ids: string[][];
  distances?: (number | null)[][] | null;
  metadatas: (Record<string, unknown> | null)[][];
  documents: (string | null)[][];
}

interface CollectionLike {
  query: (args: {
    queryEmbeddings: number[][];
    nResults: number;
    where: Where;
  }) => Promise<ChromaQueryResult>;
}

/**
 * Maps a raw Chroma query result through the L2 threshold filter and into
 * the typed `RetrievedChunk[]` shape.
 */
function projectChromaResult(result: ChromaQueryResult): RetrievedChunk[] {
  const ids = result.ids[0] ?? [];
  const distances = result.distances?.[0] ?? [];
  const metadatas = result.metadatas[0] ?? [];
  const documents = result.documents[0] ?? [];

  const chunks: RetrievedChunk[] = [];

  for (let i = 0; i < ids.length; i++) {
    const l2Distance = distances[i] ?? Infinity;
    if (l2Distance > RETRIEVAL_MAX_L2_DISTANCE) continue;

    const cosineSimilarity = 1 - (l2Distance * l2Distance) / 2;
    const meta = metadatas[i] ?? {};
    const spoilerLevel = Number((meta as Record<string, unknown>)["spoiler_level"] ?? 0);

    chunks.push({
      id: ids[i] ?? "",
      sourceId: String((meta as Record<string, unknown>)["source_id"] ?? ""),
      documentId: String((meta as Record<string, unknown>)["document_id"] ?? ""),
      chunkIndex: Number((meta as Record<string, unknown>)["chunk_index"] ?? 0),
      headingPath: String((meta as Record<string, unknown>)["heading_path"] ?? ""),
      content: documents[i] ?? "",
      similarityScore: Math.max(0, Math.min(1, cosineSimilarity)),
      spoiler: spoilerLevel >= 2,
    });
  }

  return chunks;
}

/**
 * Embeds an enriched player query, queries ChromaDB for top-k matching chunks
 * scoped by `game_id` and softly filtered by the player's current location
 * (`chapter`/`area`/`sub_area`). If the location-filtered query returns zero
 * usable chunks, the query is re-issued without the location `$or` so the
 * player flow never hard-fails on unindexed regions.
 *
 * Distance metric: L2 (ChromaDB default). For normalized embeddings
 * (all-MiniLM-L6-v2) the conversion is: cosine_similarity = 1 - (l2² / 2).
 */
export async function retrieveChunks(
  queryText: string,
  gameId: string,
  runContext: RetrievalRunContext
): Promise<RetrievedChunk[]> {
  const start = Date.now();

  // Load the game so we can prefix its title onto the embedding query.
  // Throws if missing — there is no silent fallback (per spec Story 1 AC).
  const game = await GameModel.findById(gameId).select("title").lean();
  if (!game) {
    throw new Error(`[retrieval] Game not found for id=${gameId}`);
  }

  const enrichedQuery = buildEnrichedQuery(game.title, runContext, queryText);
  const queryEmbedding = await embedText(enrichedQuery);

  const client = getClient();
  const collection = (await client.getOrCreateCollection({
    name: inferenceConfig.CHROMA_COLLECTION,
  })) as unknown as CollectionLike;

  const baseGameFilter: Where = { game_id: gameId };
  const locationClause = buildLocationOrClause(runContext);

  // --- 1. Primary: filtered by location ---
  let chunks: RetrievedChunk[] = [];
  let filterStatus: "hit" | "miss" | "none" = "none";

  if (locationClause) {
    const filteredWhere: Where = {
      $and: [baseGameFilter, locationClause],
    } as Where;

    const filteredResult = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: inferenceConfig.RETRIEVAL_K,
      where: filteredWhere,
    });
    chunks = projectChromaResult(filteredResult);
    filterStatus = chunks.length > 0 ? "hit" : "miss";
  }

  // --- 2. Fallback: game-only filter if the location filter found nothing ---
  if (chunks.length === 0) {
    if (locationClause) {
      console.log(
        `[retrieval] area_filter_miss game=${gameId} chapter=${runContext.chapter ?? ""} area=${runContext.gameArea} sub_area=${runContext.subArea ?? ""}`
      );
    }
    const fallbackResult = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: inferenceConfig.RETRIEVAL_K,
      where: baseGameFilter,
    });
    chunks = projectChromaResult(fallbackResult);
  }

  const ms = Date.now() - start;
  console.log(
    `[retrieval] query="${queryText.slice(0, 40)}…" game=${gameId} k=${inferenceConfig.RETRIEVAL_K} filter=${filterStatus} returned=${chunks.length} chunks in ${ms}ms`
  );

  return chunks;
}
