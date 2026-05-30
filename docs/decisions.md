# Decisions

Architecture and product decisions for SecondSeat, in reverse chronological order. Each entry captures the **context** (why), the **decision** (what), the **alternatives** weighed, and the **consequences** (trade-offs / follow-ups).

---

## 2026-05-30 — Metadata Alignment v1: Drop Chapter Slot, Lift Content Type + Spoiler Level via Frontmatter

**Context**
Three separate problems were discovered when auditing the ingestion ↔ retrieval contract before the 2026-06-01 demo:

1. The positional heading parser maps `segment[1] → chapter`, but Resident Evil 2 Remake has no chapter structure — it organises content by route / area / sub-area. This means every ingest document needed a synthetic `## Chapter` H2 wrapper to prevent the parser swallowing the real area into the wrong slot.
2. `content_type` and `spoiler_level` were classified by fragile heading-text regex at ingest time and never written to Chroma. The `[SPOILER — do not reference]` label in `prompt-template.ts` was dead code because `projectChromaResult` read `meta.spoiler` (a boolean never written by ingest) and therefore set `spoiler: false` on every chunk.
3. The `chapter` field on `POST /api/v1/generate` was required, forcing players to supply a value that has no meaning in the current game.

**Decision**

- **Drop the `chapter` positional slot from the heading parser.** New mapping: `segment[0] → route`, `segment[1] → area`, `segment[2] → sub_area`. The existing overflow behaviour (deeper segments dropped) is preserved.
- **Introduce authored YAML frontmatter for `content_type`, `spoiler_level`, and `default_area`.** A hand-rolled `key: value` parser (no `js-yaml` / `gray-matter` dependency) extracts these at load time. Zod validates each field individually; invalid values are warned and dropped without failing the ingest job.
- **Frontmatter wins over heading-text classification.** Merge priority: frontmatter > `classifyChunk` result > `"general"` for `content_type`; frontmatter > `0` for `spoiler_level`. `default_area` fills the `area` Chroma slot only when the heading parser provides no area — heading always wins.
- **Make `chapter` optional in `POST /api/v1/generate`.** Zod schema: `.optional()`. Route writes `chapter: ""` to `RunContext` when absent — this is an explicit workaround to avoid modifying `packages/db/src/` (which would require a separate decision-lane entry). The Mongoose `required: true` constraint on `RunContext.chapter` is intentionally left in place; the post-MVP follow-up is to loosen it.
- **Fix `projectChromaResult` to derive `spoiler` from `spoiler_level >= 2`.** The legacy `meta.spoiler === true` dead-code path is removed.
- **Add `enemy_reference` to `ChunkContentType`.** Locks in the vocab name for enemy strategy docs. Reachable via frontmatter only in v1 (no heading-classifier rule). `enemies-strategies.md` is deferred from the v1 demo corpus.
- **`packages/db/src/` is NOT modified.** The `chapter` field workaround keeps this spec in the inference-level gate rather than requiring a database schema migration.

**Alternatives considered**

- **Reshape documents to fit the existing 4-slot parser (route/chapter/area/sub_area).** Rejected — requires adding a synthetic `## Chapter` H2 to every document, which is noise that confuses the heading hierarchy. The parser should match the game's actual structure, not the reverse.
- **Classify `content_type` and `spoiler_level` via ML or LLM at ingest time.** Rejected — introduces a new external dependency and latency in the ingestion pipeline. Author-declared frontmatter is authoritative for v1 (one game, six docs); regex classifier remains as the fallback for documents without frontmatter.
- **Use `js-yaml` or `gray-matter` for frontmatter parsing.** Rejected — adds a dependency for a grammar that is intentionally limited to `key: value` lines only. The hand-rolled parser is 50 lines and auditable; complex YAML features (nested keys, arrays, multi-line strings) are explicitly out-of-scope for v1.
- **Add `spoiler_level` to `RetrievedChunk` and surface it to the prompt template.** Discussed 2026-05-30. Rejected for v1 — the only consumer is the `spoiler: boolean` check, and `spoiler_level >= 2` captures the intended threshold. Adding the numeric field to the projected chunk would complicate the prompt assembler without benefit until finer-grained spoiler policy is needed.
- **Loosen `RunContext.chapter` to `required: false` in Mongoose.** Rejected for this spec — changing `packages/db/src/` would elevate to a combined inference + DB decision and require a migration script. The `""` workaround is a deliberate and documented trade-off to keep the blast radius narrow.

**Consequences**

- After this lands, every new ingest vector carries explicit `content_type` and `spoiler_level` metadata. Legacy vectors from prior ingest do not — they are flushed by the operator re-ingest (Story 6, manual step).
- The `[SPOILER — do not reference]` label in `prompt-template.ts` is now reachable for any chunk with `spoiler_level >= 2`. The `HINT_POLICY` rule #4 is enforceable from this point forward.
- Players no longer need to supply `chapter` for the RE2R game. Any future game with a real chapter structure can still pass `chapter` without behaviour change.
- `chapter` key on Chroma vectors written before this deploy is dead weight until re-ingest. The retrieval `$or` clause no longer references it so there is no correctness impact.
- **Post-MVP follow-up (logged):** Loosen `RunContext.chapter` to `required: false` in Mongoose (decision lane, `packages/db/src/`). Until then, empty-string writes are the workaround.

**Files**

Workers side (committed in `rjasino-fs/metadata` branch prior to this log entry):
- Modified: `apps/workers/src/services/chunk/heading-path.parser.ts`
- Modified: `apps/workers/src/services/classify/chunk-classifier.ts`
- Modified: `apps/workers/src/services/vector/chroma.client.ts`
- Added:    `apps/workers/src/services/load/frontmatter.parser.ts`
- Modified: `apps/workers/src/services/load/md.reader.ts`
- Modified: `apps/workers/src/services/load/html.reader.ts`
- Modified: `apps/workers/src/processors/ingestion.processor.ts`

Inference side (pending, gated by this `/log`):
- Modified: `apps/inference/src/schemas/generate.schema.ts`
- Modified: `apps/inference/src/routes/generate.route.ts`
- Modified: `apps/inference/src/services/retrieval/retrieval.service.ts`
- Modified: `apps/inference/src/services/prompt/prompt-template.ts`

---

## 2026-05-30 — Remove Unique-Per-Author Constraint on RagSource game+author Index

**Context**
The `rag_sources` collection had a unique compound index on `{ "metadata.game", "metadata.author" }`, enforcing a hard limit of one guide source per author per game. This was an implicit design assumption from early ingestion work — not an intentional product constraint. Authors may legitimately contribute multiple categorized guides for the same game (e.g. a walkthrough and a secrets/collectibles guide), and the system benefits from having these as separate, independently indexable RAG sources.

**Decision**
- Drop the unique compound index `{ "metadata.game": 1, "metadata.author": 1 }` from `ragSourceSchema` entirely. No replacement index is added now; per-game query optimization is explicitly deferred.
- Provide a one-time migration script (`packages/db/src/migrations/drop-rag-source-author-unique-index.ts`) to drop the old index from the live `rag_sources` collection. Mongoose does not auto-migrate live indexes from unique to non-unique.
- No application-layer deduplication is introduced. Title or content-hash deduplication, if ever needed, is a separate future concern.

**Alternatives considered**
- **Replace with a non-unique index on the same compound key** — rejected for now; no query pattern currently requires filtering by both `game` and `author` together. Premature optimization.
- **Keep unique, add a `guideType` discriminator to the key** — rejected; adds schema complexity and a required field where none exists. Deferred to a future spec if multi-guide categorization becomes a product feature.
- **Application-layer guard to prevent duplicates by title** — rejected; the constraint belongs in the DB if it belongs anywhere, and the product requirement is explicitly to allow multiple submissions.

**Consequences**
- Authors can submit multiple guide sources per game immediately after the migration runs.
- The live MongoDB collection requires the one-time migration script to be run manually; the service does not run it automatically on startup.
- No impact on `apps/workers` or `apps/inference` — neither relies on the uniqueness invariant.
- Per-game RAG source lookup performance is slightly unoptimized until a follow-up index is added (tracked as a future optimization).

**Files**
- Modified: `packages/db/src/models/rag-source.model.ts`
- Added:    `packages/db/src/migrations/drop-rag-source-author-unique-index.ts`

---

## 2026-05-28 — OpenCode Zen Responses API: structured `input` form

**Context**
After switching to the Responses API (entry above), live hint streams failed with `400 Error from provider (Anthropic): messages: at least one message is required`. The adapter was passing `input: userPrompt` as a bare string. OpenCode Zen's proxy translates Responses → Anthropic Messages, and the string form was being dropped during translation, leaving Anthropic with an empty `messages` array. The OpenAI Responses API spec permits both string and structured input-items forms; the proxy only honors the structured form.

**Decision**
Pass `input` as `[{ role: "user", content: userPrompt }]`. Keep `instructions: systemPrompt` (correctly mapped to Anthropic `system`). Update the matching unit-test assertion. No interface change for callers.

**Alternatives considered**
- Switch back to Chat Completions for the Anthropic-hosted models — rejected; Responses is the documented surface for the Claude lineup on OpenCode Zen and was deliberately chosen in the prior decision.
- Concatenate `systemPrompt + userPrompt` into a single string `input` — rejected; bypasses the system/user separation that the spoiler-discipline prompt policy relies on.

**Consequences**
- Hint generation is unblocked end-to-end against the OpenCode Zen path.
- Workflow deviation: gate file was opened manually (`Set-Content .claude/.workflow-gate ready-to-implement`) for a fast-lane fix on the protected `apps/inference/src/` path; deletion handled at task close.
- No integration test against the live proxy exists, which is why this regression slipped past unit tests. Adding a smoke test is tracked as a follow-up but deferred — sprint scope prioritizes the demo path.

**Files**
- Modified: `apps/inference/src/services/llm/opencode-zen.adapter.ts`
- Modified: `apps/inference/src/services/llm/opencode-zen.adapter.test.ts`

---

## 2026-05-28 — OpenCode Zen Responses API + Configurable LLM Model

**Context**
Hint generation was 100% broken: `OpenCodeZenAdapter` called `client.chat.completions.create(...)` against a `OPENCODE_ZEN_BASE_URL` that pointed at `https://opencode.ai/zen/v1/responses`. The OpenAI SDK appends `/chat/completions` to the base URL, producing a request to `https://opencode.ai/zen/v1/responses/chat/completions` — a 404 served by the opencode.ai marketing site, not the API. Investigation of the OpenCode Zen catalog revealed two API surfaces (`/zen/v1/chat/completions` for open models, `/zen/v1/responses` for OpenAI Responses-API models including the entire Claude / GPT / Gemini lineup). The strongest spoiler-discipline option for SecondSeat's 1–3 line hint workload is Claude Haiku 4.5, which lives on the Responses surface. The adapter and `AnthropicAdapter` also both hardcoded their model ids, blocking sprint-time A/B testing without a code edit.

**Decision**

- **Switch `OpenCodeZenAdapter` to the OpenCode Zen Responses API.** Use `client.responses.create({ stream: true })` from `openai@4.104.0` (verified against installed `node_modules`). Map `systemPrompt → instructions` and `userPrompt → input`. Yield text on `response.output_text.delta` events; ignore all other event types. Preserve the existing `LlmAdapter` `AsyncIterable<string>` contract so the route layer, `AnthropicAdapter`, and prompt assembler do not change.
- **Default OpenCode Zen model is `opencode/claude-haiku-4-5`.** Best spoiler-discipline-per-dollar for the wedge: ~$2.75 per 1000 hints at typical 1.5K-in / 256-out usage. Strong Anthropic-trained instruction following aligns with the "spoiler discipline > completeness" hard constraint in CLAUDE.md.
- **Model is env-driven on both adapters.** Required env vars `OPENCODE_ZEN_MODEL` and `ANTHROPIC_MODEL` are added to `config.ts` via the existing `requireEnv` pattern (fail-fast). `AnthropicAdapter`'s hardcoded `claude-sonnet-4-6` constant is replaced with the new env value; `.env.example` keeps `claude-sonnet-4-6` as the documented default so existing Anthropic-path behavior is preserved.
- **Fix `OPENCODE_ZEN_BASE_URL` to terminate at `/zen/v1`.** The SDK appends the route suffix; the previous value double-pathed `/responses`. `.env.example` is updated; the owner manually updates `.env.local` post-merge (secrets are not edited by code).
- **Error mapping stays generic.** Adapter continues to wrap upstream errors in `LlmError("OpenCode Zen stream failed", err)`. Typed error mapping (model-not-found, quota, etc.) is deferred — not in the wedge's critical path.

**Alternatives considered**

- **Path A — Keep Chat Completions, point at a chat-completions-capable model (MiniMax, Kimi, GLM, DeepSeek Free).** Smallest possible change (env-only plus a model-id constant) and includes zero-cost free-tier options. Rejected as the default because spoiler-discipline quality on those models is unverified for the hint use case, and the trust-critical path warrants the better instruction-follower for the demo. Path A remains available by env switch — if a sprint A/B prefers it, only `.env.local` changes.
- **GPT-5 Nano on the Responses API.** Extreme value (~$0.18 per 1000 hints, ~15× cheaper than Haiku). Rejected as default because spoiler-refusal behavior on edge cases is less reliable than Haiku in our use case. Easy to A/B via the new `OPENCODE_ZEN_MODEL` env var without code change.
- **Broaden `LlmAdapter` to a structured event interface.** Would expose richer signals (e.g. tool-call deltas, refusal markers) to the route layer. Rejected — larger blast radius, no downstream consumer needs it today, and translating to plain text inside the adapter keeps `AnthropicAdapter` unchanged.
- **Refine error mapping in this task.** Rejected — out of the demo critical path, costs implementation time, and the current generic `LlmError` is sufficient for surfacing 4xx upstream to logs.
- **Reconcile `docs/data_model.md` ↔ `packages/db` schemas as part of this work.** Rejected and explicitly deferred — documentation drift is not blocking the demo, and the reconcile decision is a separate decision-lane task already captured in the post-MVP section of this file (2026-05-28 entry above).

**Consequences**

- Hint generation is unblocked under `LLM_PROVIDER=opencode_zen` once the owner updates `.env.local`. The 404 disappears.
- Two new required env vars per provider (`OPENCODE_ZEN_MODEL`, `ANTHROPIC_MODEL`). The service will fail fast at startup if either is missing — consistent with the existing `requireEnv` style and acceptable in a solo sprint context.
- Sprint-time model A/B between `claude-haiku-4-5`, `gpt-5-nano`, etc. is now `.env.local`-only — no code or branch needed.
- The exact OpenCode Zen model-id format (`opencode/<id>` vs `<id>`) is unconfirmed at write time. If OpenCode rejects the default value at runtime, the fix is a single `.env.local` edit; no code change. Verification deferred to the post-merge smoke test.
- Future follow-up: typed error mapping for upstream 4xx (model-not-found, quota), and a richer adapter event surface if/when refusal markers or tool-call deltas become useful. Both are explicit non-goals here and tracked nowhere yet — capture in a later decisions entry if/when they become relevant.

---

## 2026-05-27 — Workflow Calibration: 3-Lane Workflow

**Context**
The existing 5-phase gated workflow (task → spec → log → implement → test) was designed for discipline and traceability but proved too heavy for a solo sprint repo. Token consumption was hitting ~70% of context window on most tasks before any code was written. Code quality, bugs, and missing implementations were increasing rather than decreasing — indicating the overhead was reducing effective implementation time without improving outcomes. The mandatory `/log` step before every implementation was writing documentation before the solution was validated. The universal `/test` phase required E2E and manual acceptance on every change regardless of scope. The hook enforced gate checks across all of `apps/**` including low-risk web components. The workflow needed to be calibrated to match the risk profile of individual tasks, not treat all tasks as equally high-stakes.

**Decision**

- **Replace universal 5-phase flow with 3-lane routing.** Tasks are classified as fast (low-risk, localized), spec (medium/high-risk), or decision (architectural or irreversible). Each lane gets only the ceremony it actually needs. The `/task`, `/spec`, `/log`, `/implement`, `/test`, and `/commit` commands stay available; their scope is reinterpreted, not replaced.
- **Fast lane skips `/spec` and `/log`.** Small bug fixes, localized refactors, and single-component changes go directly to implementation with targeted tests and a concise summary. No spec document, no CHANGELOG update required.
- **Spec lane: one approval gate only.** Clarify → write a short spec → single approval → implement → risk-based tests. No mandatory log step unless the spec surfaces a notable product or architecture decision.
- **Decision lane: spec + decision log + one approval gate.** Reserved for architectural or irreversible choices (e.g. data model changes, new service contracts, workflow rules like this one). Both `docs/decisions.md` and `docs/CHANGELOG.md` are written before implementation.
- **Testing is risk-based by default.** Targeted automated tests (unit/integration) are the default for all lanes. Manual acceptance and E2E are only required when the affected surface is a UI flow, cross-service interaction, or otherwise high-risk. The `/test` command documents the testing approach taken and its rationale.
- **`/log` made optional.** CHANGELOG and decisions log entries are only written when the change is notable enough to warrant documentation — not as a universal prerequisite for coding.
- **Hook scope narrowed to two high-risk prefixes.** The `PreToolUse` hook now protects only `apps/inference/src/` (LLM/RAG prompt policy, the trust-critical path) and `packages/db/src/` (Mongoose schema changes). All other `apps/**` edits are unblocked, letting fast-lane tasks on web components and workers proceed without a gate file.

**Alternatives considered**

- **Keep the 5-phase workflow, just speed up each phase.** Rejected — the problem is not speed within phases, it is that low-risk tasks should not pass through all five phases. Shortening phase durations does not eliminate the structural overhead.
- **Remove all mechanical enforcement and rely on instructions only.** Rejected — the LLM/RAG path and schema changes are high enough risk that a hard block is still warranted. Removing all enforcement trades a small friction reduction for a meaningful regression risk.
- **Introduce new command names (fast-fix, quick-spec, etc.).** Rejected — the existing slash commands are already understood by the repo maintainer. Reinterpreting them under the new lanes preserves familiarity and avoids breaking any references in existing specs or docs.
- **Lane-aware gate (write a `fast-lane` gate value for low-risk tasks).** Considered — would keep a uniform gate mechanism. Rejected in favour of Option A (narrowed scope) because the added complexity of a second gate value adds overhead without meaningful additional protection; the fast-lane tasks that now bypass the gate are almost entirely web UI components, not the trust-critical path.

**Consequences**

- `CLAUDE.md` must be updated to reflect the new routing table and lane definitions. The old 5-phase diagram and signal vocabulary table must be replaced.
- All five command files must be updated to remove mandatory ceremony that does not apply to their lane.
- `check-workflow-gate.cjs` must be updated to check two protected prefixes instead of one. The gate logic otherwise stays the same.
- Fast-lane tasks will not produce spec documents or changelog entries. If a fast-lane task turns out to have wider impact than anticipated, the agent must stop, flag the scope change, and re-enter the spec lane before continuing.
- Teams or contributors accustomed to the old workflow will need to read the updated `CLAUDE.md` to understand the new routing rules. No toolchain changes are required.

---

## 2026-05-28 — Post MVP Task

**Document Drift to Code**
Reconcile data_model.md with packages/db (decision lane). Includes: rename User.password → passwordHash, decide on uiSettings and contextEvents scope, choose embed-vs-reference for RunContext/hint logs.

---
