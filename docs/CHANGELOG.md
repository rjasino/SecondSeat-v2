# Changelog

All notable changes to SecondSeat are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

---

## Unreleased

### Added — Ingestion Pipeline: Source Intake, Job Lifecycle, Worker Pipeline (specs: [I-A](specs/2026-05-26SPEC-ingestion-source-intake.md) · [I-B](specs/2026-05-26SPEC-ingestion-job-lifecycle.md) · [I-C](specs/2026-05-26SPEC-ingestion-worker-pipeline.md))

#### Phase 0 — `packages/db` (shared Mongoose wiring)

- `packages/db/src/index.ts` — real `connect()` replacing the no-op stub; exports all six Mongoose models
- `packages/db/src/models/user.model.ts` — `User` schema (`name`, `email`, `passwordHash`, `role`, `profile`, `uiSettings`, timestamps)
- `packages/db/src/models/game.model.ts` — `Game` schema (`title`, `slug`, `developer`, `releaseYear`, `genre`, `supported`, timestamps)
- `packages/db/src/models/play-session.model.ts` — `PlaySession` schema with `currentContext` and `contextEvents` sub-documents
- `packages/db/src/models/hint-interaction.model.ts` — `HintInteraction` schema with merged `request`/`response` sub-documents
- `packages/db/src/models/rag-source.model.ts` — `RagSource` schema (`title`, `sourceType`, `sourceUri`, `content`, `createdBy`, `metadata`, `status`, `startedAt`, `finishedAt`, timestamps); index `{ status, createdBy }`
- `packages/db/src/models/rag-ingestion-job.model.ts` — `RagIngestionJob` schema (`sourceId`, `queueJobUuid`, `status`, `totalChunks`, `processedChunks`, `progress`, `error`, `startedAt`, `finishedAt`, timestamps); index `{ sourceId, createdAt }`
- `packages/db/src/models/rag-document.model.ts` — `RagDocument` schema (`sourceId`, `chunkIndex`, `content`, `hash`, `vectorId`, `metadata`, `tokens`, timestamps); indexes `{ sourceId, chunkIndex }` unique + `{ hash }`

#### Epic I-A — Source Intake (`apps/web`)

**New files**

- `apps/web/src/app/ingest/page.tsx` — intake form (Server Component shell; delegates to client form component)
- `apps/web/src/app/ingest/layout.tsx` — layout enforcing author/admin role gate; redirects regular users and unauthenticated visitors to `/`
- `apps/web/src/components/ingest/intake-form.tsx` — client component: source mode toggle (file upload / write in form), metadata fields (title, game, area, spoilerLevel), TipTap editor, submit handler
- `apps/web/src/components/ingest/tiptap-editor.tsx` — TipTap rich-text editor component with toolbar: Italic, Underline, Strikethrough, Inline Code, Code Block, H1/H2/H3, Bullet List, Ordered List, Blockquote, Superscript, Subscript; uses `@tiptap/extension-markdown` for Markdown serialisation
- `apps/web/src/components/layout/nav-banner.tsx` — persistent top banner: shows `displayName` + Logout when authenticated; Login link (→ `/`) when not
- `apps/web/src/app/api/ingest/route.ts` — `POST /api/ingest`; Zod validation; `turndown` HTML→Markdown conversion; writes `RagSource` + `RagIngestionJob` to MongoDB; enqueues BullMQ `ingestion` job; returns `201 { jobId }`
- `apps/web/src/app/api/auth/logout/route.ts` — `GET /api/auth/logout`; clears `iron-session` cookie; redirects to `/`
- `apps/web/src/lib/turndown.ts` — shared `turndown` instance with consistent rule configuration
- `apps/web/src/lib/session.ts` — `iron-session` config and `getSession` helper
- `apps/web/src/schemas/ingest.ts` — Zod schemas for `POST /api/ingest` (file mode and text mode)

**Modified files**

- `apps/web/src/app/layout.tsx` — adds `<NavBanner />` to root layout
- `apps/web/src/lib/config.ts` — adds `INGEST_MAX_FILE_BYTES`, `REDIS_URL`, `MONGODB_URI`, `SESSION_SECRET`
- `apps/web/.env.example` — adds `INGEST_MAX_FILE_BYTES`, `REDIS_URL`, `MONGODB_URI`, `SESSION_SECRET`
- `apps/web/package.json` — adds `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-*` (underline, strike, code-block, heading, bullet-list, ordered-list, blockquote, superscript, subscript), `@tiptap/extension-markdown`, `turndown`, `@types/turndown`, `iron-session`, `bullmq`

**Endpoints added**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/ingest` | ✅ author \| admin | Create source + job; returns `{ jobId }` |
| `GET` | `/api/auth/logout` | ✅ any | Clear session cookie; redirect to `/` |

#### Epic I-B — Job Lifecycle (`apps/web`)

**New files**

- `apps/web/src/app/ingest/status/[jobId]/page.tsx` — status page; polls `GET /api/ingest/status/:jobId` every 3 s; shows progress bar, status badge, error message, "Edit & Retry" button on failure
- `apps/web/src/app/ingest/[sourceId]/edit/page.tsx` — edit & retry page; loads `RagSource` content into TipTap via `@tiptap/extension-markdown`; submits `PATCH /api/ingest/:sourceId/retry`
- `apps/web/src/app/api/ingest/status/[jobId]/route.ts` — `GET /api/ingest/status/:jobId`; reads `RagIngestionJob` + `RagSource.title` from MongoDB; enforces creator-or-admin access
- `apps/web/src/app/api/ingest/[sourceId]/retry/route.ts` — `PATCH /api/ingest/:sourceId/retry`; validates `status === "failed"` gate; updates `RagSource`; creates new `RagIngestionJob`; enqueues new BullMQ job; returns `201 { jobId }`
- `apps/web/src/schemas/retry.ts` — Zod schema for `PATCH` retry request body

**Endpoints added**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/ingest/status/:jobId` | ✅ creator \| admin | Poll job status and progress |
| `PATCH` | `/api/ingest/:sourceId/retry` | ✅ creator \| admin | Update source; enqueue new job |

**Env vars**

| Var | Default | Description |
|-----|---------|-------------|
| `INGEST_JOB_MAX_RETRIES` | `3` | BullMQ `attempts` per job |
| `INGEST_JOB_BACKOFF_MS` | `5000` | BullMQ exponential backoff delay (ms) |

#### Epic I-C — Worker Pipeline (`apps/workers`, `packages/embedding`)

**`packages/embedding`**

- `packages/embedding/src/index.ts` — real `embed(text: string): Promise<number[]>` replacing the no-op stub; singleton model load via `@xenova/transformers`; model: `Xenova/all-MiniLM-L6-v2`; output: 384-dim `number[]`
- `packages/embedding/package.json` — adds `@xenova/transformers`

**`apps/workers`**

- `apps/workers/src/queues/ingestion.queue.ts` — BullMQ `ingestion` queue definition and `JobData` interface (`{ sourceId: string; jobMongoId: string }`)
- `apps/workers/src/processors/ingestion.processor.ts` — main job processor: loads `RagSource`; updates job/source status; runs chunking → embedding → ChromaDB upsert loop; increments `processedChunks` via `$inc`; sets terminal status on completion or failure
- `apps/workers/src/services/chunker.ts` — `chunkMarkdown(content: string): TextNode[]`; `MarkdownNodeParser` → `SentenceSplitter` (256-token window, 32-token overlap) for oversized nodes
- `apps/workers/src/services/chroma-client.ts` — ChromaDB client wrapper; `getOrCreateCollection()`; `upsertChunk()` with stable ID `<sourceId>_<chunkIndex>`
- `apps/workers/src/db.ts` — worker-side Mongoose connection (delegates to `@secondseat/db`)
- `apps/workers/src/index.ts` — updated to register the `ingestion` queue worker on startup

**Modified files**

- `apps/workers/src/config/index.ts` — adds `MONGODB_URI`, `CHROMA_URL`, `CHROMA_COLLECTION_NAME` (default `secondseat_guide_chunks`), `INGEST_JOB_MAX_RETRIES`, `INGEST_JOB_BACKOFF_MS`
- `apps/workers/.env.example` — adds new vars
- `apps/workers/package.json` — adds `bullmq`, `llamaindex`, `@secondseat/db`, `@secondseat/embedding`, `chromadb`

**Env vars**

| Var | Default | Description |
|-----|---------|-------------|
| `CHROMA_COLLECTION_NAME` | `secondseat_guide_chunks` | ChromaDB collection name |
| `CHROMA_URL` | `http://localhost:8000` | ChromaDB HTTP endpoint |

#### Tests added

- `packages/db/src/models/*.test.ts` — Mongoose schema shape and index assertions (Vitest, in-memory Mongo)
- `apps/web/src/app/api/ingest/route.test.ts` — Supertest: happy path (file + text modes), `401`/`403` auth enforcement, `422` validation errors, BullMQ-failure rollback → `500`
- `apps/web/src/app/api/ingest/status/[jobId]/route.test.ts` — Supertest: `200` progress shape, `403` cross-user access, `404` not found
- `apps/web/src/app/api/ingest/[sourceId]/retry/route.test.ts` — Supertest: `201` new job, `409` non-failed source guard, `422` invalid body
- `apps/workers/src/services/chunker.test.ts` — chunk count, 256-token ceiling, empty-content failure path
- `apps/workers/src/processors/ingestion.processor.test.ts` — mocks ChromaDB + embedding; asserts `$inc` calls, terminal status writes, error rethrow for BullMQ retry
- `packages/embedding/src/index.test.ts` — mocks `@xenova/transformers`; asserts singleton load, 384-dim output shape

---

### Added — Monorepo scaffold with health checks (spec: [2026-05-26](specs/2026-05-26SPEC-monorepo-scaffold-health-checks.md))

**Root**

- `package.json` — npm workspaces manifest (`apps/*`, `packages/*`), shared scripts (`dev`, `build`, `test`).
- `tsconfig.base.json` — strict TypeScript baseline extended by every workspace.
- `vitest.config.ts` — root Vitest config; per-app configs extend it.
- `docker-compose.yml` — local MongoDB, Redis, ChromaDB services (apps themselves are not containerized in this scaffold).
- `.gitignore` updates as needed for `node_modules`, `.env`, `.next`, build artifacts, and `.claude/.workflow-gate`.

**`apps/web` (Next.js 14+ App Router, TS, TailwindCSS 4)**

- App Router skeleton: `src/app/layout.tsx`, `src/app/page.tsx` (placeholder root page styled with one Tailwind utility class for the smoke test).
- `src/app/api/health/route.ts` — `GET /api/health` returning `{ status: "ok", service: "web", timestamp }`.
- `src/lib/config.ts` — Zod-validated env loader (`WEB_PORT`).
- TailwindCSS 4 wiring: `tailwind.config.ts`, `postcss.config.mjs`, `src/app/globals.css` with `@import "tailwindcss";`.
- `.env.example`, `tsconfig.json`, `vitest.config.ts`, `next.config.ts`.
- Smoke test: `src/app/api/health/route.test.ts`.

**`apps/inference` (Express + TS)**

- `src/index.ts` — boot entrypoint; parses config, binds `INFERENCE_PORT`.
- `src/app.ts` — Express app assembly: `helmet` → `express-rate-limit` → JSON body parser → routes → centralized error handler (registered last).
- `src/config/index.ts` — Zod-validated env (`INFERENCE_PORT`, `NODE_ENV`).
- `src/lib/catch-async.ts` — `RequestHandler` wrapper for async errors.
- `src/middleware/error-handler.ts` — strips internals when `NODE_ENV === 'production'`.
- `src/middleware/rate-limit.ts`, `src/middleware/security.ts` — middleware factories.
- `src/routes/health.ts` — `GET /api/v1/health`, wrapped by `catchAsync`, response shaped by Zod.
- `src/schemas/health.ts` — Zod response schema.
- `src/types/express.d.ts` — module-augmentation placeholder (no fields yet).
- `.env.example`, `tsconfig.json`, `vitest.config.ts`.
- Smoke test: `src/routes/health.test.ts` (Supertest, in-process app).

**`apps/workers` (BullMQ + tiny HTTP probe)**

- `src/index.ts` — boots a minimal HTTP server bound to `WORKER_HEALTH_PORT` exposing `GET /health`; no BullMQ queues registered yet.
- `src/config/index.ts` — Zod-validated env (`WORKER_HEALTH_PORT`, `REDIS_URL` required for forward compatibility but not consumed yet).
- `.env.example`, `tsconfig.json`, `vitest.config.ts`.
- Smoke test: `src/health.test.ts`.

**`packages/db` (`@secondseat/db`)**

- Stub `package.json`, `tsconfig.json`, `src/index.ts` exporting a placeholder `connect()` no-op. No Mongoose connection logic yet.

**`packages/embedding` (`@secondseat/embedding`)**

- Stub `package.json`, `tsconfig.json`, `src/index.ts` exporting a placeholder `embed()` no-op. No `@xenova/transformers` model load yet.

### Endpoints added

| Method | Endpoint           | App              |
| ------ | ------------------ | ---------------- |
| GET    | `/api/health`      | `apps/web`       |
| GET    | `/api/v1/health`   | `apps/inference` |
| GET    | `/health`          | `apps/workers`   |

All return `200 { status: "ok", service, timestamp }`. No auth.

### Not included (deferred to later specs)

Auth, ingestion, generation, SSE, LlamaIndex wiring, LLM adapters, ChromaDB client, Mongoose models, embedding model load, voice (Web Speech / TTS), Playwright E2E, CI workflows, app Dockerfiles, ESLint/Prettier.
