import type { Job } from "bullmq";
import { randomUUID } from "crypto";
import type { IngestionJobData } from "../queues/ingestion-queue.js";
import { RagSourceModel } from "../models/rag-source.model.js";
import { RagDocumentModel } from "../models/rag-document.model.js";
import { loadMarkdown, IngestionError } from "../services/load/md.reader.js";
import { loadHtml } from "../services/load/html.reader.js";
import { cleanMarkdown } from "../services/load/clean.js";
import { chunkText } from "../services/chunk/node-parser.service.js";
import { parseHeadingPath } from "../services/chunk/heading-path.parser.js";
import { embedText } from "../services/embed/embedding.service.js";
import { upsertVectors, deleteVectors } from "../services/vector/chroma.client.js";
import { classifyChunk } from "../services/classify/chunk-classifier.js";
import {
  markJobProcessing,
  setTotalChunks,
  incrementProgress,
  markJobCompleted,
  markJobFailed,
} from "../services/progress.service.js";

const ERROR_CODE_MAP: Record<string, string> = {
  empty_content: "empty_content",
  extraction_failed: "extraction_failed",
  embedding_failed: "embedding_failed",
  vector_store_failed: "vector_store_failed",
};

function toStableErrorCode(err: unknown): string {
  if (err instanceof IngestionError) {
    return ERROR_CODE_MAP[err.code] ?? "unknown";
  }
  return "unknown";
}

function toSafeMessage(err: unknown): string {
  if (err instanceof IngestionError) return err.message;
  if (err instanceof Error) return err.message.slice(0, 512);
  return "An unexpected error occurred";
}

export async function processIngestionJob(
  job: Job<IngestionJobData>
): Promise<void> {
  const { sourceId, jobDocId, gameId, author } = job.data;

  await markJobProcessing(jobDocId, sourceId);

  try {
    // 1. Load source content
    const source = await RagSourceModel.findById(sourceId);
    if (!source?.content) {
      throw new IngestionError("empty_content", "Source has no content to process");
    }

    // 2. Load and validate document
    const filename = source.sourceUri?.split(/[\\/]/).pop() ?? "content.md";
    const isHtml = /\.(html|htm)$/i.test(filename);
    const loaded = isHtml
      ? loadHtml(source.content, filename)
      : loadMarkdown(source.content, filename);

    // 3. Clean — strip URLs, images, HTML tags, frontmatter noise
    const cleaned = cleanMarkdown(loaded.content);

    // 4. Chunk the content
    const chunks = chunkText(cleaned);
    if (chunks.length === 0) {
      throw new IngestionError("empty_content", "Chunking produced no results");
    }

    await setTotalChunks(jobDocId, chunks.length);

    // 5. Dedup — find already-embedded chunks for this source
    const existingDocs = await RagDocumentModel.find({
      sourceId,
      hash: { $in: chunks.map((c) => c.hash) },
    })
      .select("hash vectorId")
      .lean();

    const existingByHash = new Map<string, string | undefined>(
      existingDocs.map((d) => [d.hash, d.vectorId])
    );

    // 6. Embed + write each chunk
    const writtenVectorIds: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;

      if (existingByHash.has(chunk.hash)) {
        await incrementProgress(jobDocId, i + 1, chunks.length);
        continue;
      }

      // Classify chunk content
      const { contentType, chapterNumber } = classifyChunk(
        chunk.headingPath,
        chunk.content
      );

      // Parse heading path into structured location metadata for soft filtering
      // at retrieval time (SPEC-context-aware-retrieval, Story 2).
      const parsedHeading = parseHeadingPath(chunk.headingPath);

      // Generate embedding. We pass `embeddingInput` (heading prefix + body)
      // so retrieval recall keeps benefiting from the heading signal, while
      // `content` (body only) is what gets stored and later shown in prompts.
      let embedding: number[];
      try {
        embedding = await embedText(chunk.embeddingInput);
      } catch (err) {
        throw new IngestionError(
          "embedding_failed",
          err instanceof Error ? err.message : "Embedding failed"
        );
      }

      const vectorId = `${sourceId}-${i}-${randomUUID()}`;

      // Write to ChromaDB
      try {
        await upsertVectors([
          {
            id: vectorId,
            embedding,
            metadata: {
              source_id: sourceId,
              document_id: "",
              chunk_index: chunk.chunkIndex,
              game_id: gameId,
              heading_path: chunk.headingPath,
              author,
              ...parsedHeading,
            },
            document: chunk.content,
          },
        ]);
        writtenVectorIds.push(vectorId);
      } catch (err) {
        if (writtenVectorIds.length > 0) {
          try {
            await deleteVectors(writtenVectorIds);
          } catch (cleanupErr) {
            console.error("[processor] cleanup failed:", cleanupErr);
          }
        }
        throw new IngestionError(
          "vector_store_failed",
          err instanceof Error ? err.message : "ChromaDB write failed"
        );
      }

      // Persist RagDocument
      const doc = await RagDocumentModel.create({
        sourceId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        hash: chunk.hash,
        vectorId,
        metadata: {
          headingPath: chunk.headingPath,
          contentType,
          chapterNumber,
          author,
        },
        tokens: chunk.tokens,
      });

      // Back-fill document_id in Chroma metadata (best-effort, non-fatal)
      try {
        await upsertVectors([
          {
            id: vectorId,
            embedding,
            metadata: {
              source_id: sourceId,
              document_id: doc._id.toString(),
              chunk_index: chunk.chunkIndex,
              game_id: gameId,
              heading_path: chunk.headingPath,
              author,
              ...parsedHeading,
            },
            document: chunk.content,
          },
        ]);
      } catch {
        // Non-fatal — document_id is a convenience field
      }

      await incrementProgress(jobDocId, i + 1, chunks.length);
    }

    await markJobCompleted(jobDocId, sourceId);
  } catch (err) {
    const code = toStableErrorCode(err);
    const message = toSafeMessage(err);
    await markJobFailed(jobDocId, sourceId, code, message);
    throw err;
  }
}
