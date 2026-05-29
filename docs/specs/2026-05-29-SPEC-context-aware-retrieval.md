# Feature: Context-Aware Retrieval

**Status:** Approved
**Owner:** rjasino-fs
**Last Updated:** 2026-05-29

---

## Goal

Make RAG retrieval use the player's `RunContext` (game, chapter, area, sub-area, goal) — both inside the embedding query and as a soft metadata filter — so that short, vague player questions like "How to beat the boss in the sewer" pull the chunks that actually answer them instead of nearby navigation prose.

## Stakeholders

- **Requestor:** rjasino-fs
- **Users affected:** every caller of `POST /generate` on the inference service. Today the embedded query is the raw player text only, so vague questions retrieve location-adjacent but topically irrelevant chunks; after this spec, retrieval is biased toward the player's current location and goal.
- **Teams involved:** Backend (inference service + workers). No frontend changes. No DB schema changes.

---

## User Stories

### Story 1: Embedding query is enriched with RunContext

**As a** player asking a short, ambiguous question while standing in a specific game location,
**I want** my current location and goal to shape the vector search,
**So that** the top-k chunks are about _what I'm doing right now_, not just chunks that happen to mention the same words.

#### Acceptance Criteria

- **Given** a `GenerateRequest` with `gameArea: "RPD"`, `chapter: "Chapter 1"`, `subArea: "Sewer"`, `playerGoal: "progression"`, and `text: "How to beat the boss in the sewer."`, **When** the route calls `retrieveChunks(...)`, **Then** the string passed to `embedText()` is composed as `"<game.title> | Chapter 1 | RPD | Sewer | goal:progression | How to beat the boss in the sewer."` (omitting any field that is undefined; pipe-separated, single space around each pipe).
- **Given** `subArea` is omitted from the request, **When** the query string is composed, **Then** the `subArea` segment is dropped (not rendered as an empty token or "undefined").
- **Given** `retrieveChunks` is invoked, **When** it begins work, **Then** it loads `Game.title` from MongoDB by `gameId` and uses it as the first segment. If the game is not found, the function throws (existing error middleware maps to 500) — there is no silent fallback.

### Story 2: Workers parse and store structured location metadata at ingest

**As a** retrieval service,
**I want** each chunk in Chroma to carry structured `chapter`, `area`, and `sub_area` metadata derived from its markdown heading path,
**So that** I can filter the candidate set by location before similarity ranking.

#### Acceptance Criteria

- **Given** a chunk produced by `node-parser.service.ts` with `headingPath: "Leon A > Get to the RPD (Leon) > Navigate the Sewers (Leon) > Save Ada"`, **When** the ingestion processor builds the `VectorRecord` for Chroma, **Then** the metadata includes `route: "leon a"`, `chapter: "get to the rpd (leon)"`, `area: "navigate the sewers (leon)"`, `sub_area: "save ada"`. All values are lowercased and trimmed.
- **Given** a chunk with fewer than four heading segments (e.g. `"Walkthrough > Side Quests"`), **When** metadata is written, **Then** present segments are populated positionally (`route`, `chapter`) and absent segments are simply omitted from the metadata object (not written as empty strings).
- **Given** a chunk with more than four heading segments, **When** metadata is written, **Then** only the first four (`segment[0..3]`) are used; deeper segments are ignored for v1.
- **Given** a chunk whose `headingPath` is the synthetic `"Document"` fallback ([node-parser.service.ts:110](apps/workers/src/services/chunk/node-parser.service.ts:110)), **When** metadata is written, **Then** `route: "document"` is the only positional field written.
- **Given** the new metadata fields are written, **When** `VectorRecord.metadata` is type-checked, **Then** the `chroma.client.ts` `VectorRecord` interface includes the four new optional string fields.

### Story 3: Retrieval soft-filters by area with graceful fallback

**As a** retrieval service,
**I want to** prefer chunks whose `chapter`, `area`, or `sub_area` matches the player's `RunContext`, but never hard-fail a query that has no in-area matches,
**So that** location-relevant content is favored without breaking queries about content the player hasn't tagged yet.

#### Acceptance Criteria

- **Given** `RunContext` has `gameArea: "RPD"` and `subArea: "Sewer"`, **When** the Chroma query is built, **Then** the `where` clause is `{ $and: [ { game_id: <gameId> }, { $or: [ { chapter: "chapter 1" }, { area: "rpd" }, { sub_area: "sewer" } ] } ] }`, with `chapter`/`area`/`sub_area` values lowercased to match ingest normalization.
- **Given** `subArea` is omitted, **When** the `$or` clause is built, **Then** only the present fields contribute clauses (no empty/null comparators).
- **Given** the filtered query returns 0 chunks (after the existing L2 distance threshold filter), **When** the service detects the empty result, **Then** it logs `[retrieval] area_filter_miss game=<id> chapter=<c> area=<a> sub_area=<s>` and re-issues the same query with `where: { game_id: <gameId> }` (the original behavior).
- **Given** the filtered query returns at least 1 chunk above the distance threshold, **When** the service completes, **Then** no fallback query runs.
- **Given** either query path is taken, **When** the function returns, **Then** the existing `console.log` summary line still fires and includes a new `filter=hit|miss|none` token so we can read miss rate from logs.

---

## Data Requirements

No DB schema change. New Chroma chunk-metadata fields (written by workers, read by inference):

| Field      | Type   | Required                            | Constraints                      | Notes                                            |
| ---------- | ------ | ----------------------------------- | -------------------------------- | ------------------------------------------------ |
| `route`    | string | when `headingPath` has ≥ 1 segment  | lowercased, trimmed, ≤ 200 chars | `segment[0]` of `headingPath`. e.g. "leon a".    |
| `chapter`  | string | when `headingPath` has ≥ 2 segments | lowercased, trimmed, ≤ 200 chars | `segment[1]`.                                    |
| `area`     | string | when `headingPath` has ≥ 3 segments | lowercased, trimmed, ≤ 200 chars | `segment[2]`.                                    |
| `sub_area` | string | when `headingPath` has ≥ 4 segments | lowercased, trimmed, ≤ 200 chars | `segment[3]`. Deeper segments are dropped in v1. |

Backfill: no migration script. The Chroma collection is dropped and re-ingested after deploy (see Edge Cases).

---

## Flow Diagram

```mermaid
flowchart TD
    A[POST /generate body] --> B[load Game by gameId]
    B --> C[compose enriched query string<br/>title | chapter | area | subArea | goal | text]
    C --> D[embedText]
    D --> E[Chroma query with $or location filter]
    E --> F{chunks above threshold?}
    F -->|yes| G[return chunks, log filter=hit]
    F -->|no| H[log area_filter_miss]
    H --> I[Chroma query, game_id only]
    I --> J[return chunks, log filter=miss]

    subgraph workers [Workers — ingestion]
      W1[chunk headingPath]
      W1 --> W2[split on ' > ']
      W2 --> W3[lowercase + trim segments 0..3]
      W3 --> W4[write route/chapter/area/sub_area into VectorRecord.metadata]
      W4 --> W5[upsertVectors]
    end
```

---

## API Contract (for @backend-dev)

No public HTTP contract changes. `POST /generate` request/response shapes are untouched.

**Internal function signature change:**

| Function                       | Before                                                                   | After                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `retrieveChunks`               | `(queryText: string, gameId: string) => Promise<Chunk[]>`                | `(queryText: string, gameId: string, runContext: { gameArea, chapter, subArea?, playerGoal }) => Promise<Chunk[]>` |
| `VectorRecord.metadata` (type) | `{ source_id, document_id, chunk_index, game_id, heading_path, author }` | adds `route?: string`, `chapter?: string`, `area?: string`, `sub_area?: string`                                    |

Call sites:

- [generate.route.ts:132](apps/inference/src/routes/generate.route.ts:132) — passes `runContext` derived from the validated request body.
- [ingestion.processor.ts:121](apps/workers/src/processors/ingestion.processor.ts:121), [ingestion.processor.ts:169](apps/workers/src/processors/ingestion.processor.ts:169) — write the four new metadata fields alongside existing ones.

---

## Edge Cases

- **Game record missing in Mongo** — `retrieveChunks` throws; existing centralized error middleware maps to 500. We do not silently substitute an empty title (that would defeat the whole point of the enrichment).
- **Player question is already very specific** (e.g. mentions "G-Adult flamethrower") — context prefix is still prepended. Worst case it's a no-op for ranking; we accept that as cheaper than branching on query specificity.
- **`subArea` omitted from request** — segment is dropped from both the embedding string and the `$or` filter. Filter degrades to `chapter` + `area` only.
- **Heading path of an ingested chunk is the synthetic `"Document"`** — only `route: "document"` is written; the soft filter will never match it, so it's only reachable via the fallback query. That's the intended behavior for un-headed sources.
- **A guide author uses a different heading convention** (e.g. `"Side Quests > Sewer Map"` where index-2 is the area) — positional mapping mislabels the field. Documented limitation, deferred to a per-game parser when game #2 is added.
- **Re-ingest interleaves with live traffic** — operator drops the Chroma collection during a maintenance window. Inference will return zero chunks until ingestion finishes; the prompt template's `(no guide content retrieved)` path ([prompt-template.ts:23](apps/inference/src/services/prompt/prompt-template.ts:23)) handles this gracefully.
- **Soft-filter hits exactly 0 chunks after threshold filter** — fallback query runs (Story 3 AC); only the filtered query that produces no usable chunks triggers it (not a Chroma error).
- **Race between Chroma `getOrCreateCollection` and a fresh re-ingest** — out of scope; existing behavior.

---

## Out of Scope

- **Server-side spoiler filtering** based on `Profile.spoilerTolerance`. No `spoiler` flag is written at ingest today and `Profile`/`Preferences` are not yet threaded through inference. Tracked as follow-up.
- **Reranking** — fetching k=15 then re-scoring against `subArea`/`playerGoal` keywords to return top-N. Separate spec.
- **HyDE-lite query expansion** — pre-LLM rewrite of vague queries into multiple variants. Separate spec.
- **Per-game heading-path parser** — v1 hardcodes the positional mapping for the one supported game.
- **`token_normalized` fuzzy matching** (`$contains`, `$in` on token arrays). Rejected this iteration in favor of exact-equality on lowercased fields.
- **Chroma metadata backfill script.** Operator drops + re-ingests.
- **Prompt-template changes.** That's Epic 2 (a separate spec); this spec only changes what retrieval returns, not how it's formatted into the prompt.
- **Surfacing `filter=hit|miss` to a metrics backend.** Console logs only for v1.

---

## Open Questions

_All open questions resolved 2026-05-29 — decisions folded into the spec body above:_

- ✅ Embedding-query goal segment uses the raw enum (`goal:progression`).
- ✅ First segment of the embedding query is `game.title`, not `game.slug`.
- ✅ Lowercasing uses `String.prototype.toLowerCase()` (default locale) on both ingest and inference sides. English-only MVP, acceptable risk.

---

## Dependencies

- **Depends on:** existing ingestion pipeline (`apps/workers`), Chroma client, and the `Game` model ([packages/db/src/models/game.model.ts](packages/db/src/models/game.model.ts)) which must be loadable by `_id` from the inference service.
- **Blocks:** Epic 2 (profile- and goal-aware prompt assembly) benefits from richer retrieval but does not strictly require it. The two specs can ship independently; shipping this first amplifies Epic 2's measurable value.
