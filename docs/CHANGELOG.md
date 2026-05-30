# Changelog

All notable changes to SecondSeat are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

---

## Unreleased

### Changed (metadata-alignment-v1 — in progress)

- **Workers / Heading parser:** `ParsedHeadingPath` drops the `chapter` slot; positional map is now `route → area → sub_area` (3 fields, down from 4). All existing callers that spread `parsedHeading` into Chroma metadata receive the new shape automatically.
- **Workers / Chroma metadata:** `VectorRecord.metadata` removes `chapter?` and adds required `content_type: string` and `spoiler_level: number`. Every ingested chunk now carries explicit classification and spoiler signal.
- **Workers / Ingestion processor:** `content_type` and `spoiler_level` are written to every Chroma vector and to `RagDocument.metadata`. Frontmatter wins; `classifyChunk` result is the fallback for `content_type`; `0` is the fallback for `spoiler_level`. The back-fill upsert now carries all metadata fields (previously lost `content_type`/`spoiler_level` on the second write).
- **Workers / Markdown reader:** `loadMarkdown` now strips the frontmatter block before returning the body and before the heading-presence check. `LoadedDocument` adds a `frontmatter: ParsedFrontmatter` field.
- **Workers / HTML reader:** `loadHtml` imports `LoadedDocument` from `md.reader` (removed duplicate definition) and returns `frontmatter: {}` — HTML sources have no v1 frontmatter contract.
- **Inference / Generate schema:** `chapter` made optional (`z.string().min(1).max(100).optional()`). Callers that omit `chapter` now pass validation.
- **Inference / Generate route:** When `chapter` is absent in the request, `chapter: ""` is written to the `RunContext` document to satisfy the existing Mongoose `required: true` constraint without a schema migration.
- **Inference / Retrieval service:** `RetrievalRunContext.chapter` typed as `string | undefined`. `buildEnrichedQuery` already filters falsy values; `buildLocationOrClause` already guards `if (ctx.chapter)` — both are verified, not modified.
- **Inference / Retrieval service:** `projectChromaResult` derives `spoiler: boolean` from `spoiler_level >= 2` instead of the dead `meta.spoiler === true` check (which was always false because ingestion never wrote `spoiler`).
- **Inference / Prompt template:** `formatRunContext` omits the `Chapter:` line when `ctx.chapter` is absent or empty.

### Added (metadata-alignment-v1 — in progress)

- **Workers / Frontmatter parser:** New `apps/workers/src/services/load/frontmatter.parser.ts` — hand-rolled `key: value` parser (no `js-yaml` / `gray-matter` dep). Validates `content_type`, `spoiler_level`, and `default_area` via Zod. Invalid values are logged at `warn` and dropped; ingest continues with the remaining valid fields.
- **Workers / Demo corpus:** `docs/ingestion-docs/leon-a-map.md` (renamed from `map.md`), `birkin-g1-knife.md`, `birkin-g1-run-gun.md`, `core-progression.md` — all carry frontmatter blocks (`content_type`, `spoiler_level`). `enemies-strategies.md` and `game-guide.md` are excluded from v1 ingest (area-slot semantics deferred; `enemy_reference` vocab entry added to union anyway).
- **Workers / `ChunkContentType`:** Added `"enemy_reference"` member. Reachable only via frontmatter override in v1; no heading-classifier rule for it.

### Files (metadata-alignment-v1 — workers side, committed)

- Modified: `apps/workers/src/services/chunk/heading-path.parser.ts`
- Modified: `apps/workers/src/services/chunk/heading-path.parser.test.ts`
- Modified: `apps/workers/src/services/classify/chunk-classifier.ts`
- Modified: `apps/workers/src/services/vector/chroma.client.ts`
- Added:    `apps/workers/src/services/load/frontmatter.parser.ts`
- Added:    `apps/workers/src/services/load/frontmatter.parser.test.ts`
- Modified: `apps/workers/src/services/load/md.reader.ts`
- Modified: `apps/workers/src/services/load/html.reader.ts`
- Modified: `apps/workers/src/processors/ingestion.processor.ts`
- Added:    `docs/ingestion-docs/leon-a-map.md` (renamed from `map.md`)
- Added:    `docs/ingestion-docs/birkin-g1-knife.md`
- Added:    `docs/ingestion-docs/birkin-g1-run-gun.md`
- Added:    `docs/ingestion-docs/core-progression.md`

### Files (metadata-alignment-v1 — inference side, pending gate)

- Modified: `apps/inference/src/schemas/generate.schema.ts`
- Modified: `apps/inference/src/routes/generate.route.ts`
- Modified: `apps/inference/src/services/retrieval/retrieval.service.ts`
- Modified: `apps/inference/src/services/prompt/prompt-template.ts`

### Notes

- **Manual re-ingest required:** After both sides land, the operator must delete and re-upload the 4 demo corpus docs via the web UI at `/ingest` to flush legacy Chroma vectors that carry the old `chapter` metadata key.
- **`packages/db/src/` not modified:** `RunContext.chapter` stays `required: true`; the workaround (`chapter: ""` on omitted requests) is intentional and documented as a post-MVP follow-up.

---

### Changed

- **DB / Schema:** Removed the unique compound index `{ "metadata.game": 1, "metadata.author": 1 }` from `ragSourceSchema`. An author can now submit multiple guide sources for the same game. The index is dropped entirely (no replacement) — per-game query optimization is deferred.

### Added

- **DB / Migration:** One-time migration script `packages/db/src/migrations/drop-rag-source-author-unique-index.ts` drops the old unique index from the live `rag_sources` collection.

### Files

- Modified: `packages/db/src/models/rag-source.model.ts`
- Added:    `packages/db/src/migrations/drop-rag-source-author-unique-index.ts`

---

### Fixed

- **Inference / LLM:** `OpenCodeZenAdapter` now passes `input` to OpenCode Zen's Responses API as a structured input-items array (`[{ role: "user", content: userPrompt }]`) instead of a bare string. The proxy's translation to Anthropic Messages dropped the user turn when `input` was a string, surfacing as `400 Error from provider (Anthropic): messages: at least one message is required` at hint stream time. Unit test assertion updated to match the array form. No public API change.

### Changed

- **Inference / LLM:** `OpenCodeZenAdapter` rewritten to use OpenCode Zen's Responses API (`client.responses.create({ stream: true })`) instead of the Chat Completions endpoint, fixing a 404 against `https://opencode.ai/zen/v1/responses/chat/completions`. The adapter now maps `systemPrompt → instructions`, `userPrompt → input`, and translates `response.output_text.delta` events into plain text chunks, preserving the existing `AsyncIterable<string>` `LlmAdapter` interface.
- **Inference / Config:** LLM model is now env-driven on both adapters. Added required env vars `OPENCODE_ZEN_MODEL` (default `opencode/claude-haiku-4-5`) and `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`). Replaced the hardcoded `MODEL_ID` constant in `AnthropicAdapter`.
- **Inference / Config:** `OPENCODE_ZEN_BASE_URL` semantic clarified — must end at `/zen/v1`; the OpenAI SDK appends the route suffix. `.env.example` updated accordingly.

### Added

- **Inference / Tests:** New `apps/inference/src/services/llm/opencode-zen.adapter.test.ts` covering text-delta yielding, non-text-event ignoring, abort-signal clean return, and `LlmError` wrapping. Mocks the OpenAI SDK at the boundary per `.claude/rules/testing.md`.

### Files

- Modified: `apps/inference/src/services/llm/opencode-zen.adapter.ts`
- Modified: `apps/inference/src/services/llm/anthropic.adapter.ts`
- Modified: `apps/inference/src/config/config.ts`
- Modified: `apps/inference/.env.example`
- Added:    `apps/inference/src/services/llm/opencode-zen.adapter.test.ts`

### Notes

- No HTTP contract change. `generate.route.ts`, prompt assembly, and RAG retrieval are untouched.
- Owner must update `apps/inference/.env.local` post-merge: set `OPENCODE_ZEN_BASE_URL=https://opencode.ai/zen/v1` and add `OPENCODE_ZEN_MODEL=opencode/claude-haiku-4-5`.

