# Changelog

All notable changes to SecondSeat are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

---

## Unreleased

### Added — Guide Writer UI Polish & Source Delete Pipeline (spec: [guide-writer-ui-and-source-delete-pipeline](specs/2026-05-26-SPEC-guide-writer-ui-and-source-delete-pipeline.md))

Replaces the floating bubble-menu editor toolbar with a fixed static toolbar, adds a persistent autosave indicator, introduces a confirmed draft-delete flow, and swaps the instant source-record wipe for an async soft-delete pipeline that cleanly removes ChromaDB vectors before hard-deleting MongoDB records.

#### New component (`apps/web`)

- `apps/web/src/components/ui/confirm-dialog.tsx` — reusable `ConfirmDialog` modal component. Props: `open`, `title`, `message`, `confirmLabel`, `onConfirm`, `onCancel`, `loading?`. Closes on Escape or backdrop click. Confirm + cancel buttons disabled while `loading={true}`; confirm shows a spinner. Nothing is mounted when `open={false}`.

#### Modified files (`apps/web`)

- `apps/web/src/components/ingest/guide-writer-editor.tsx` (or equivalent TipTap editor component) — `BubbleMenu` removed from render tree. Static formatting toolbar added above the editor card, always visible. Toolbar buttons: Bold, Italic, Underline, Strike, Inline Code, H1, H2, H3, Bullet List, Ordered List, Blockquote, Code Block, Superscript, Subscript — grouped with dividers. Active-state styling applied (accent border + tinted background) when the corresponding mark/node is active at the cursor. Editor focus is retained after toolbar button clicks.
- `apps/web/src/components/ingest/guide-writer-client.tsx` — autosave indicator added below the editor: shows `"Autosaved at HH:MM AM/PM"` (local time) after each successful autosave; hidden before the first save. Header save indicator states updated: `"Saving…"` during save, `"Saved ✓"` (with checkmark, not ephemeral) on success, `"Save failed — retrying…"` in danger colour on error. "Delete Draft" button added to the action row, visible only when `sourceId` is set. On click, opens `ConfirmDialog`; on confirm, calls `DELETE /api/ingest/drafts/:sourceId`; on `204` redirects to `/dashboard/ingest`; on error shows inline error message in the action area.
- `apps/web/src/app/ingest/[sourceId]/page.tsx` (source detail page) — "Delete" button wired to `ConfirmDialog`. On confirm calls `DELETE /api/ingest/sources/:sourceId`; on `202` starts polling for `"deleting"` status. Button disabled when `status === "deleting"` or `status === "processing"`. Shows `"Deleting…"` status badge (amber, `badge--deleting` CSS class: `#d97706` text, `rgba(217,119,6,0.15)` background) while async delete is in progress. On `404` during polling, redirects to `/dashboard/ingest`.

#### New API routes (`apps/web`)

- `apps/web/src/app/api/ingest/drafts/[sourceId]/route.ts` — `DELETE /api/ingest/drafts/:sourceId`. Auth: admin. Validates `status === "draft"`. Hard-deletes the `RagSource` document. Returns `204`. Errors: `401`, `403`, `404`, `409` (status not draft).
- `apps/web/src/app/api/ingest/sources/[sourceId]/route.ts` — `DELETE /api/ingest/sources/:sourceId`. Auth: admin. Sets `source.status = "deleting"` and saves `previousStatus`. Enqueues a `delete-source` BullMQ job. Returns `202 { jobId }`. Idempotent if already `"deleting"` (returns `202`, no duplicate enqueue). Returns `409` if `status === "processing"`. Errors: `401`, `403`, `404`.

#### New worker processor (`apps/workers`)

- `apps/workers/src/queues/delete-source.queue.ts` — BullMQ `delete-source` queue definition and `DeleteSourceJobData` interface (`{ sourceId: string }`).
- `apps/workers/src/processors/delete-source.processor.ts` — job processor: queries ChromaDB for vectors by metadata filter `{ source_id: sourceId }` and deletes them (no-op if no vectors found — idempotent). Hard-deletes the `RagSource` document and all associated `RagIngestionJob` documents from MongoDB. On BullMQ retry exhaustion, resets `source.status` to `previousStatus` (stored on the document), logs the error, and rethrows so BullMQ tracks the failure correctly.
- `apps/workers/src/index.ts` — updated to register the `delete-source` queue worker on startup.

#### Schema changes (`packages/db`)

- `packages/db/src/models/rag-source.model.ts` — `status` field extended with `"deleting"` as a valid enum value. New optional field `previousStatus: string | null` — written when transitioning to `"deleting"`, used by the worker to restore status on failure, moot after hard-delete.

#### CSS additions (`apps/web`)

- `badge--deleting` CSS class added (amber: `#d97706` text, `rgba(217,119,6,0.15)` background) to the shared badge style sheet — distinct from green (completed), blue (processing), and red (failed).

#### Endpoints added

| Method | Endpoint                               | Auth     | Description                                                                                                     |
| ------ | -------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| DELETE | `/api/ingest/drafts/:sourceId`         | ✅ admin | Hard-delete a draft source (`status === "draft"`). Returns `204`.                                               |
| DELETE | `/api/ingest/sources/:sourceId`        | ✅ admin | Soft-delete: set `status="deleting"`, enqueue worker. Returns `202 { jobId }`. Idempotent. `409` if processing. |

#### Tests added

- `apps/web/src/components/ui/confirm-dialog.test.tsx` — Escape/backdrop close, `loading` disables buttons, `open={false}` mounts nothing.
- `apps/web/src/app/api/ingest/drafts/[sourceId]/route.test.ts` — `204` happy path, `409` non-draft guard, `401`/`403` auth enforcement, `404` not found.
- `apps/web/src/app/api/ingest/sources/[sourceId]/route.test.ts` — `202` accepted, `202` idempotent (already deleting), `409` processing guard, `401`/`403` auth enforcement, `404` not found.
- `apps/workers/src/processors/delete-source.processor.test.ts` — vectors deleted then MongoDB hard-delete, no-vector no-op, status reset on retry exhaustion, error rethrow.

---

### Changed — Auth Module Alignment to Spec 2 Contract (spec: [auth-alignment](specs/2026-05-26SPEC-auth-alignment.md))

Reconciles the existing auth implementation with the approved Spec 2 contract. No new Mongoose fields; the only type change is `SessionUser` in `apps/web/src/lib/session.ts`.

#### Modified files (`apps/web`)

- `apps/web/src/lib/session.ts` — `SessionUser` type slimmed to `{ userId: string; role: "user" | "author" | "admin" }`. Fields `id`, `email`, and `displayName` removed. Session consumers updated.
- `apps/web/src/schemas/auth.ts` — `RegisterSchema`: `confirmPassword` field removed; password minimum raised from 8 → 12 characters; `role` field stripped (Zod `.strip()` default prevents privilege escalation). `LoginSchema`: unchanged shape.
- `apps/web/src/app/api/auth/register/route.ts` — success response shape changed to `201 { ok: true, role: "user" }`. Session write updated to new `SessionUser` shape (`userId` not `id`, no `email`/`displayName`).
- `apps/web/src/app/api/auth/login/route.ts` — success response shape changed to `200 { ok: true, role }`. Session write updated to new `SessionUser` shape.
- `apps/web/src/app/api/auth/logout/route.ts` — handler converted from `GET` to `POST`. Old `GET` route removed.
- `apps/web/src/middleware.ts` — updated access rules:
  - `role: "user"` on `/api/ingest/**` → `403 { error: "forbidden" }` JSON (was redirect)
  - `role: "user"` on `/ingest/**` UI route → redirect `/` (was `/login`)
  - Authenticated users on `/login` or `/register` → `user` → `/`, `author`/`admin` → `/ingest`
  - `/` always passes through; no auto-redirect for any role
- `apps/web/src/components/layout/nav-banner.tsx` — converted to use slim session + `GET /api/auth/me` for display name. Role badges added: `Player` (user), `Author`, `Admin`. Login + Register links shown when unauthenticated; Ingestion link shown for `author`/`admin` only. Logout button converted from `<a href="/api/auth/logout">` to `POST /api/auth/logout` via `<form method="post">` or `fetch`.
- `apps/web/src/app/ingest/layout.tsx` — session field references updated from `session.user.id` / `session.user.email` / `session.user.displayName` to `session.user.userId`.
- `apps/web/src/app/api/ingest/route.ts` — session field updated (`id` → `userId`).
- `apps/web/src/app/api/ingest/status/[jobId]/route.ts` — session field updated (`id` → `userId`).
- `apps/web/src/app/api/ingest/[sourceId]/retry/route.ts` — session field updated (`id` → `userId`).

#### New file (`apps/web`)

- `apps/web/src/app/api/auth/me/route.ts` — `GET /api/auth/me`; reads `session.user.userId`; calls `User.findById()`; returns `{ userId, name, email, role }`. Returns `401 { error: "unauthenticated" }` if no session or user document not found (also destroys session in latter case).
- `apps/web/src/lib/user.ts` — `getUserById(userId: string)` helper wrapped with Next.js `cache()` to deduplicate `User.findById` calls within a single render tree.

#### Modified files (`packages/db`)

- `packages/db/scripts/seed-privileged-users.ts` — renamed from `seed-admins.ts`. New env vars: `SEED_ADMIN_NAME`, `SEED_AUTHOR_NAME`. Startup validation now checks all 6 required vars and exits early if any are missing. Password length checked (min 12) before DB connection. Idempotent: logs `"already exists — skipping"` on duplicate email.
- `packages/db/package.json` — `seed:default` alias renamed to `seed:privileged`; script path updated to `seed-privileged-users.ts`.

#### Root `package.json`

- `seed:privileged` alias added (delegates to `packages/db` script).

#### Endpoints changed

| Method | Endpoint             | Auth     | Change                                               |
| ------ | -------------------- | -------- | ---------------------------------------------------- |
| POST   | `/api/auth/register` | No       | Response body → `{ ok: true, role: "user" }` (was full `SessionUser`) |
| POST   | `/api/auth/login`    | No       | Response body → `{ ok: true, role }` (was full `SessionUser`)         |
| POST   | `/api/auth/logout`   | Any role | **Changed from GET to POST**                         |
| GET    | `/api/auth/me`       | Any role | **New** — returns `{ userId, name, email, role }`    |

#### Session type change

| Field         | Before                          | After                           |
| ------------- | ------------------------------- | ------------------------------- |
| `id`          | `string`                        | — removed; replaced by `userId` |
| `userId`      | — absent                        | `string`                        |
| `role`        | `"user" \| "author" \| "admin"` | unchanged                       |
| `email`       | `string`                        | — removed                       |
| `displayName` | `string`                        | — removed                       |

#### Seed env vars added

| Var                | Required | Notes          |
| ------------------ | -------- | -------------- |
| `SEED_ADMIN_NAME`  | Yes      | New — admin display name  |
| `SEED_AUTHOR_NAME` | Yes      | New — author display name |

#### Tests updated

- `apps/web/src/app/api/auth/login/route.test.ts` — updated response shape assertions
- `apps/web/src/app/api/auth/register/route.test.ts` — updated response shape assertions; removed `confirmPassword` from test bodies; added 12-char password min test
- `apps/web/src/app/api/auth/me/route.test.ts` — **new**: `200` happy path, `401` no session, `401` deleted user (session destroyed)
- `apps/web/src/app/api/auth/logout/route.test.ts` — updated from GET to POST assertions

---

### Added — Auth Module: User Roles, Route Protection & Seed Script (spec: [auth-module](specs/2026-05-26SPEC-auth-module.md))

#### New pages (`apps/web`)

- `apps/web/src/app/login/page.tsx` — public login page; email + password form; redirects `"user"` → `/`, `"author"`/`"admin"` → `/ingest` on success
- `apps/web/src/app/register/page.tsx` — public registration page; name, email, password, confirm-password form; always creates `role: "user"`; redirects to `/` on success
- `apps/web/src/app/page.tsx` — upgraded from scaffold placeholder to role-aware landing: logged-in `"user"` sees display name banner + logout button; unauthenticated visitors see a login prompt

#### New middleware (`apps/web`)

- `apps/web/src/middleware.ts` — Next.js Edge middleware enforcing route protection:
  - `/ingest/*` — unauthenticated or `role: "user"` → redirect `/login`; `"author"`/`"admin"` → pass through
  - `/login`, `/register` — already-authenticated users redirected to their role's home (`"user"` → `/`, `"author"`/`"admin"` → `/ingest`)
  - `/` — passes through unconditionally; page handles role-conditional rendering server-side

#### New API routes (`apps/web`)

- `apps/web/src/app/api/auth/login/route.ts` — `POST /api/auth/login`; Zod-validated body; `argon2.verify`; writes `iron-session`; returns `SessionUser`
- `apps/web/src/app/api/auth/register/route.ts` — `POST /api/auth/register`; Zod-validated body with password-match refinement; `argon2.hash`; inserts `User` with `role: "user"`; writes both `user.name` and `user.profile.displayName`; writes `iron-session`; returns `201 SessionUser`

#### New Zod schemas (`apps/web`)

- `apps/web/src/schemas/auth.ts` — `LoginSchema` and `RegisterSchema` (shared by route handlers and client-side form validation)

#### New seed script (`packages/db`)

- `packages/db/scripts/seed-admins.ts` — provisions one `"admin"` and one `"author"` account from env vars (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_AUTHOR_EMAIL`, `SEED_AUTHOR_PASSWORD`); idempotent (skips if email exists); hashes passwords via `argon2`; run via `tsx --env-file=.env packages/db/scripts/seed-admins.ts`

#### New dependencies

- `apps/web/package.json` — adds `argon2`
- `packages/db/package.json` — adds `argon2` (runtime), `tsx` (devDependency)

#### Modified files

- `apps/web/.env.example` — adds `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_AUTHOR_EMAIL`, `SEED_AUTHOR_PASSWORD`
- `packages/db/.env.example` — created; adds `MONGODB_URI`, `SEED_*` vars for seed script context

#### Endpoints added

| Method | Endpoint               | Auth | Description |
|--------|------------------------|------|-------------|
| `POST` | `/api/auth/login`      | No   | Verify credentials, write session, return `SessionUser` |
| `POST` | `/api/auth/register`   | No   | Create `role: "user"` account, write session, return `201 SessionUser` |

_(Logout `GET /api/auth/logout` was already implemented in Epic I-A.)_

#### Tests added

- `apps/web/src/app/api/auth/login/route.test.ts` — Supertest: `200` happy path, `401` bad credentials, `422` invalid body
- `apps/web/src/app/api/auth/register/route.test.ts` — Supertest: `201` happy path (session written, `profile.displayName` synced), `409` duplicate email, `422` password mismatch, `422` invalid body

---

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
