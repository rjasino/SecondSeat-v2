# Feature: Ingestion — Epic I-C: Worker Pipeline

**Status:** Approved
**Owner:** rjasino-fs
**Last Updated:** 2026-05-26

---

## Goal

Process queued ingestion jobs end-to-end — semantically chunk clean Markdown source content, generate embeddings via the shared `@secondseat/embedding` package, and upsert vectors into ChromaDB — so that the RAG retrieval layer has a queryable knowledge base of guide content.

## Stakeholders

- **Requestor:** rjasino-fs
- **Users affected:** Authors, Admins (indirectly — their ingested content becomes retrievable)
- **Teams involved:** Backend (`apps/workers`, `packages/embedding`, `packages/db`)

---

## User Stories

### Story 1: Semantic Chunking (Markdown)

**As a** worker process,
**I want to** semantically chunk source Markdown using LlamaIndex.TS's `MarkdownNodeParser`,
**So that** each chunk carries coherent, self-contained guide content that respects document structure.

#### Acceptance Criteria

- **Given** a `rag_sources` document with clean Markdown content (any `sourceType` — all content is normalised to Markdown by Epic I-A), **When** the worker picks up the job, **Then** the document is parsed by LlamaIndex.TS's `MarkdownNodeParser` and split into semantic nodes.
- **Given** the resulting nodes exceed 256 tokens (the `all-MiniLM-L6-v2` model hard limit), **When** a node is too large, **Then** it is further split with a `SentenceSplitter` configured to a **256-token window and 32-token overlap** so that no chunk is silently truncated by the embedding model.
- **Given** chunking produces at least one node, **When** chunking completes, **Then** `rag_ingestion_jobs.totalChunks` is set to the node count.
- **Given** chunking produces zero nodes (empty or unparseable content), **When** this is detected, **Then** the job is marked `failed` with `error: "No chunks produced"`.

### Story 2: Embedding Generation

**As a** worker process,
**I want to** embed each chunk using `@secondseat/embedding`,
**So that** vector representations are consistent between ingestion and query time.

#### Acceptance Criteria

- **Given** a chunk of text, **When** `embed(text)` is called from `@secondseat/embedding`, **Then** a `number[]` of dimension 384 is returned (from `Xenova/all-MiniLM-L6-v2` via `@xenova/transformers`).
- **Given** the embedding model has not yet been loaded, **When** `embed()` is first called, **Then** the model is loaded via a singleton pattern (one load promise, reused for all subsequent calls) before returning.
- **Given** embedding fails for a chunk, **When** the error is caught, **Then** it is rethrown so BullMQ can retry the job per `INGEST_JOB_MAX_RETRIES`.

### Story 3: ChromaDB Upsert

**As a** worker process,
**I want to** upsert each embedded chunk into ChromaDB,
**So that** the inference service can perform vector similarity search at query time.

#### Acceptance Criteria

- **Given** a chunk and its embedding, **When** the worker upserts to ChromaDB, **Then** the vector is stored in the collection named by `CHROMA_COLLECTION_NAME` (default `secondseat_guide_chunks`) with metadata `{ sourceId, chunkIndex, game, area, spoilerLevel }` and the `vectorId` returned by ChromaDB is stored in `rag_documents.vectorId`.
- **Given** the ChromaDB collection does not exist on first run, **When** the worker first attempts an upsert, **Then** the collection is created automatically before the upsert proceeds.
- **Given** a chunk with the same stable ID (`<sourceId>_<chunkIndex>`) already exists in ChromaDB (re-ingestion via retry), **When** the upsert runs, **Then** the existing vector is replaced — not duplicated.
- **Given** ChromaDB is unreachable, **When** the upsert is attempted, **Then** the error is rethrown so BullMQ can track the retry.

### Story 4: `rag_documents` Write + Job Progress

**As a** worker process,
**I want to** write one `rag_documents` record per chunk and increment job progress,
**So that** the job lifecycle layer has accurate, queryable chunk metadata.

#### Acceptance Criteria

- **Given** a chunk is successfully embedded and upserted, **When** the worker records the result, **Then** a `rag_documents` document is written (or upserted on `{ sourceId, chunkIndex }`) with `content`, `hash` (SHA-256 of content), `vectorId`, `tokens`, `metadata`, `sourceId`, `chunkIndex`.
- **Given** a chunk is recorded, **When** `processedChunks` is incremented, **Then** `rag_ingestion_jobs.processedChunks` is incremented via `$inc` and `progress` is recalculated as `Math.round(processedChunks / totalChunks * 100)`.
- **Given** all chunks are processed successfully, **When** the loop completes, **Then** `rag_ingestion_jobs.status` is set to `"completed"`, `rag_sources.status` is set to `"completed"`, and `finishedAt` is set on both.

### Story 5: `@secondseat/embedding` Package

**As a** developer,
**I want** the embedding model loaded and exposed as a typed async function in `packages/embedding`,
**So that** both `apps/workers` (ingestion) and `apps/inference` (query time) use the exact same model and vector space.

#### Acceptance Criteria

- **Given** `packages/embedding` is imported, **When** `embed(text: string)` is called, **Then** it returns `Promise<number[]>` with exactly 384 dimensions using `Xenova/all-MiniLM-L6-v2` via `@xenova/transformers`.
- **Given** the package is used in both `apps/workers` and `apps/inference`, **When** either calls `embed()`, **Then** the same model identifier and tokenizer are used — no per-app model configuration.
- **Given** the model is loading, **When** concurrent calls arrive before the first load completes, **Then** only one load is initiated; all concurrent callers await the same promise (singleton pattern).
- **Given** the model is loading for the first time, **When** this happens, **Then** a startup log message is emitted: `"[embedding] Loading model Xenova/all-MiniLM-L6-v2…"`.

---

## Data Requirements

### `rag_documents` (MongoDB — `packages/db`)

| Field        | Type     | Required | Constraints              | Notes                                                      |
| ------------ | -------- | -------- | ------------------------ | ---------------------------------------------------------- |
| `_id`        | ObjectId | auto     | —                        | Mongoose default                                           |
| `sourceId`   | ObjectId | ✅       | ref: rag_sources         | Parent source                                              |
| `chunkIndex` | Number   | ✅       | ≥ 0                      | Zero-based position in source                              |
| `content`    | String   | ✅       | non-empty                | Raw chunk text (Markdown excerpt)                          |
| `hash`       | String   | ✅       | SHA-256 hex of `content` | Used for deduplication                                     |
| `vectorId`   | String   | ✅       | —                        | ChromaDB document ID (`<sourceId>_<chunkIndex>`)           |
| `metadata`   | Mixed    | ✅       | —                        | `{ game, area, spoilerLevel }` from `rag_sources.metadata` |
| `tokens`     | Number   | ✅       | > 0, ≤ 256               | Token count of the chunk                                   |
| `createdAt`  | Date     | auto     | —                        | —                                                          |
| `updatedAt`  | Date     | auto     | —                        | —                                                          |

**Indexes:** `{ sourceId: 1, chunkIndex: 1 }` (unique), `{ hash: 1 }`

### ChromaDB collection

| Property         | Value                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Collection name  | `CHROMA_COLLECTION_NAME` env var (default: `secondseat_guide_chunks`)                                 |
| Vector dimension | 384                                                                                                   |
| Document ID      | `<sourceId>_<chunkIndex>` — stable, enables upsert semantics                                          |
| Metadata fields  | `sourceId` (string), `chunkIndex` (number), `game` (string), `area` (string), `spoilerLevel` (string) |

### `@secondseat/embedding` public API

```ts
// packages/embedding/src/index.ts

/**
 * Embed a text string using all-MiniLM-L6-v2.
 * Model is loaded once (singleton) and reused for all calls.
 * @returns 384-dimensional float array
 */
export async function embed(text: string): Promise<number[]>;
```

Model identifier: `Xenova/all-MiniLM-L6-v2`
Provider: `@xenova/transformers`
Output: `number[]`, length 384
Max input: 256 tokens (enforced by chunker upstream — the embed function does not re-validate)

### Chunking configuration

| Parameter          | Value                                | Rationale                                                     |
| ------------------ | ------------------------------------ | ------------------------------------------------------------- |
| Parser             | `MarkdownNodeParser` (LlamaIndex.TS) | Respects heading/section structure                            |
| Secondary splitter | `SentenceSplitter`                   | Applied to nodes exceeding 256 tokens                         |
| Chunk size         | **256 tokens**                       | Hard limit of `all-MiniLM-L6-v2` — prevents silent truncation |
| Chunk overlap      | **32 tokens**                        | Preserves context across chunk boundaries                     |

### Env vars introduced

| Var                      | Default                   | Description              |
| ------------------------ | ------------------------- | ------------------------ |
| `CHROMA_COLLECTION_NAME` | `secondseat_guide_chunks` | ChromaDB collection name |
| `CHROMA_URL`             | `http://localhost:8000`   | ChromaDB HTTP endpoint   |

---

## Flow Diagram

```mermaid
flowchart TD
    A[BullMQ picks up ingestion job\n{ sourceId, jobMongoId }] --> B[Load rag_sources by sourceId]
    B --> C[Update rag_ingestion_jobs: status=processing, startedAt\nUpdate rag_sources: status=processing]

    C --> D[Parse Markdown with MarkdownNodeParser]
    D --> E{Any nodes?}
    E -->|No| FAIL[Mark job + source failed\nerror: No chunks produced]
    E -->|Yes| F[Apply SentenceSplitter to nodes > 256 tokens]

    F --> G[Set rag_ingestion_jobs.totalChunks = node count]

    G --> H[For each chunk node]
    H --> I[embed chunk.text — @secondseat/embedding\nreturns number 384]
    I --> J[Upsert to ChromaDB\nid: sourceId_chunkIndex\nmetadata: game, area, spoilerLevel]
    J --> K[Write / upsert rag_documents\ncontent, hash, vectorId, tokens, metadata]
    K --> L[Increment rag_ingestion_jobs.processedChunks via $inc\nRecalculate progress]
    L --> M{More chunks?}
    M -->|Yes| H
    M -->|No| N[Set rag_ingestion_jobs: status=completed, finishedAt\nSet rag_sources: status=completed, finishedAt]

    I -->|Error| ERR[Rethrow — BullMQ retries]
    J -->|Error| ERR
    K -->|Error| ERR
    ERR --> P{Retries exhausted?}
    P -->|No| A
    P -->|Yes| Q[Set rag_ingestion_jobs: status=failed, error, finishedAt\nSet rag_sources: status=failed]
```

---

## API Contract

No HTTP endpoints are introduced in this epic. The worker consumes BullMQ jobs from the Redis queue and writes to MongoDB + ChromaDB directly.

### BullMQ Queue

| Queue name  | Job data shape                             | Produced by                                |
| ----------- | ------------------------------------------ | ------------------------------------------ |
| `ingestion` | `{ sourceId: string; jobMongoId: string }` | `apps/web` — `POST /api/ingest` (Epic I-A) |

Workers register in `apps/workers/src/index.ts` and consume jobs from the `ingestion` queue.

---

## Edge Cases

- **Chunk exactly at 256-token boundary:** Accepted as-is — the secondary `SentenceSplitter` only fires for nodes that exceed 256 tokens.
- **Single large section that cannot be split at sentence boundaries:** The `SentenceSplitter` will hard-cut at 256 tokens. The resulting chunk may end mid-sentence. Acceptable for MVP — log a warning but do not fail the job.
- **Re-ingestion via retry:** Upsert semantics on `{ sourceId, chunkIndex }` (MongoDB) and `<sourceId>_<chunkIndex>` (ChromaDB) ensure old vectors and documents are replaced. If the retry produces fewer chunks than the original, orphaned `rag_documents` rows from the old run remain — deferred cleanup.
- **Model download on first boot:** `@xenova/transformers` downloads model weights on first `embed()` call if not cached. Cold-start latency is expected in development. Log the download but do not treat it as an error.
- **Worker crashes mid-job:** BullMQ's job lock ensures the job is re-queued. The retry's upsert semantics prevent duplicate `rag_documents` rows for already-processed chunks. `processedChunks` may restart from 0 on retry — `$inc` is idempotent with upserts.
- **ChromaDB collection creation race (multiple workers):** ChromaDB's `getOrCreateCollection` is atomic — safe for concurrent workers.

---

## Out of Scope

- Multi-model embedding support — `Xenova/all-MiniLM-L6-v2` only in MVP.
- GPU acceleration — CPU inference only via `@xenova/transformers`.
- Spoiler-level filtering at the chunk level — `spoilerLevel` is stored as metadata but not used to gate retrieval in this epic.
- Parallel chunk processing within a single job — sequential per-chunk loop only in MVP.
- `url` source type ingestion — deferred; workers only handle `file` and `text` sources (both normalised to Markdown by Epic I-A).
- Cleanup of orphaned `rag_documents` rows when a retry produces fewer chunks.

---

## Open Questions

N/A — all questions resolved during clarification.

---

## Dependencies

- **Depends on:** Epic I-A (`rag_sources` written with clean Markdown content, BullMQ `ingestion` queue created, `packages/db` wired), Epic I-B (job lifecycle fields on `rag_ingestion_jobs` defined and expected)
- **Blocks:** Inference Epic II-A (RAG retrieval requires ChromaDB vectors and `rag_documents` records); `@secondseat/embedding` is also consumed by `apps/inference` at query time
