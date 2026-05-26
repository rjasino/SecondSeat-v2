# Feature: Ingestion — Epic I-B: Job Lifecycle

**Status:** Approved
**Owner:** rjasino-fs
**Last Updated:** 2026-05-26

---

## Goal

Track every ingestion job from enqueue through completion or failure — persisting state in both BullMQ/Redis and MongoDB — and expose a status page where authors and admins can monitor progress, read failure reasons, and retry failed jobs.

## Stakeholders

- **Requestor:** rjasino-fs
- **Users affected:** Authors, Admins (job creator sees their own jobs; admins see all)
- **Teams involved:** Backend (Next.js API routes, `packages/db`), Frontend (Next.js App Router status page)

---

## User Stories

### Story 1: Monitor Job Progress

**As an** author or admin,
**I want to** see the progress of an ingestion job after I submit a source,
**So that** I know when content is ready for the inference pipeline.

#### Acceptance Criteria

- **Given** I was redirected to `/ingest/status/:jobId` after upload, **When** the page loads, **Then** it shows the job's current status (`queued`, `processing`, `completed`, `failed`), a progress bar (`processedChunks / totalChunks`), and the source title.
- **Given** the job is in `queued` or `processing` state, **When** the page is open, **Then** the UI polls `GET /api/ingest/status/:jobId` every 3 seconds and updates the progress bar without a full page reload.
- **Given** the job reaches `completed`, **When** the next poll returns that state, **Then** polling stops and a success message is displayed.
- **Given** the job reaches `failed`, **When** the next poll returns that state, **Then** polling stops, the error reason is displayed, and an "Edit & Retry" button appears.
- **Given** I try to access `/ingest/status/:jobId` for a job I did not create (and I am not an admin), **When** the API receives the request, **Then** it returns `403`.

### Story 2: Retry a Failed Job

**As an** author or admin,
**I want to** edit a failed source's content and metadata in the same TipTap editor and resubmit,
**So that** I can correct errors without re-uploading from scratch — regardless of whether the original source was a file upload or typed content.

#### Acceptance Criteria

- **Given** a job has `status: "failed"`, **When** I click "Edit & Retry", **Then** I am taken to an edit form at `/ingest/:sourceId/edit` with:
  - Title, game, area, and spoilerLevel pre-populated.
  - A TipTap editor (same toolbar as intake) loaded with the existing `rag_sources.content` (clean Markdown) rendered as formatted rich text via the `@tiptap/extension-markdown` extension.
- **Given** the original source was a file upload (`.md` or `.html`), the Markdown stored in MongoDB is loaded into TipTap identically to text-mode sources — no distinction in the edit UI.
- **Given** I correct the content or metadata and submit, **When** the API processes the request (`PATCH /api/ingest/:sourceId/retry`), **Then**:
  - `rag_sources.content` is updated with the new Markdown (TipTap output → `turndown` → Markdown).
  - `rag_sources.metadata` is updated.
  - `rag_sources.status` is reset to `"queued"`.
  - A new `rag_ingestion_jobs` document is created with `status: "queued"`.
  - A new BullMQ job is enqueued.
  - I am redirected to `/ingest/status/:newJobId`.
- **Given** I submit the edit form with invalid data, **When** the API validates, **Then** it returns `422` with field-level errors and no new job is created.
- **Given** the source is not in `status: "failed"`, **When** `PATCH /api/ingest/:sourceId/retry` is called, **Then** it returns `409`.

### Story 3: Job State Persisted in MongoDB

**As a** developer,
**I want** job lifecycle events written to `rag_ingestion_jobs` in MongoDB,
**So that** durable job history exists independent of Redis TTL.

#### Acceptance Criteria

- **Given** a BullMQ job is created, **When** the worker picks it up, **Then** `rag_ingestion_jobs.status` transitions to `"processing"` and `startedAt` is set.
- **Given** a BullMQ job completes, **When** the worker finishes, **Then** `status` is set to `"completed"`, `finishedAt` is set, and `processedChunks === totalChunks`.
- **Given** a BullMQ job fails after exhausting retries, **When** BullMQ emits the `failed` event, **Then** `status` is set to `"failed"`, `error` is populated with the failure message, and `finishedAt` is set.

---

## Data Requirements

### `rag_ingestion_jobs` (read/write — defined in Epic I-A)

Fields written or updated in this epic:

| Field             | Written by                                 | When                                                          |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------- |
| `status`          | Next.js API (create), Worker (transitions) | On enqueue, on pickup, on completion/failure                  |
| `queueJobUuid`    | Next.js API                                | On enqueue                                                    |
| `totalChunks`     | Worker                                     | After chunking                                                |
| `processedChunks` | Worker                                     | After each chunk embedded                                     |
| `progress`        | Worker                                     | After each chunk (derived: processedChunks/totalChunks × 100) |
| `error`           | Worker / BullMQ event handler              | On failure                                                    |
| `startedAt`       | Worker                                     | On pickup                                                     |
| `finishedAt`      | Worker                                     | On completion or failure                                      |

### `rag_sources` (read/update — defined in Epic I-A)

| Field       | Updated when                                                  |
| ----------- | ------------------------------------------------------------- |
| `status`    | Mirror of job status — updated alongside `rag_ingestion_jobs` |
| `content`   | On Edit & Retry (new Markdown replaces old)                   |
| `metadata`  | On Edit & Retry                                               |
| `updatedAt` | On any update                                                 |

### Retry configuration (env vars)

| Var                      | Default | Description                                |
| ------------------------ | ------- | ------------------------------------------ |
| `INGEST_JOB_MAX_RETRIES` | `3`     | BullMQ `attempts` setting per job          |
| `INGEST_JOB_BACKOFF_MS`  | `5000`  | BullMQ `backoff.delay` in ms (exponential) |

---

## Flow Diagram

```mermaid
flowchart TD
    A[POST /api/ingest creates job] --> B[rag_ingestion_jobs: status=queued]
    B --> C[BullMQ picks up job]
    C --> D[Worker updates: status=processing, startedAt]
    D --> E{Processing chunks}
    E -->|chunk embedded| F[Increment processedChunks, recalculate progress]
    F --> E
    E -->|all chunks done| G[status=completed, finishedAt\nrag_sources status=completed]
    E -->|error, retries left| H[BullMQ retries with exponential backoff]
    H --> C
    E -->|error, retries exhausted| I[status=failed, error, finishedAt\nrag_sources status=failed]

    subgraph "Status Page — polls every 3 seconds"
        J[GET /api/ingest/status/:jobId]
        J --> K{status?}
        K -->|queued / processing| L[Update progress bar → wait 3s → poll again]
        K -->|completed| M[Show success banner — stop polling]
        K -->|failed| N[Show error message + Edit & Retry button]
    end

    N --> O[Navigate to /ingest/:sourceId/edit]
    O --> P[TipTap loads rag_sources.content as Markdown\nvia @tiptap/extension-markdown]
    P --> Q[User edits and submits]
    Q --> R[PATCH /api/ingest/:sourceId/retry]
    R --> S[Validate: source must be status=failed]
    S -->|not failed| T[Return 409]
    S -->|ok| U[Update rag_sources content + metadata\nreset status=queued]
    U --> V[New rag_ingestion_jobs doc\nNew BullMQ job]
    V --> W[Return 201 { jobId }]
    W --> X[Redirect to /ingest/status/:newJobId]
```

---

## API Contract

### Next.js Route Handlers (`apps/web`)

| Method  | Endpoint                      | Auth                | Description                                          |
| ------- | ----------------------------- | ------------------- | ---------------------------------------------------- |
| `GET`   | `/api/ingest/status/:jobId`   | ✅ creator \| admin | Poll job status and progress                         |
| `PATCH` | `/api/ingest/:sourceId/retry` | ✅ creator \| admin | Update source content/metadata and enqueue a new job |

#### `GET /api/ingest/status/:jobId` — Response

```json
// 200 OK
{
  "jobId": "<ObjectId>",
  "sourceId": "<ObjectId>",
  "sourceTitle": "Water Temple Walkthrough",
  "status": "processing",
  "totalChunks": 42,
  "processedChunks": 17,
  "progress": 40,
  "error": null,
  "startedAt": "2026-05-26T10:00:00Z",
  "finishedAt": null
}

// 404 Not Found
{ "error": "Job not found" }

// 401 Unauthorized
{ "error": "Not authenticated" }

// 403 Forbidden
{ "error": "Access denied" }
```

#### `PATCH /api/ingest/:sourceId/retry` — Request

```json
{
  "title": "Updated title",
  "content": "# Corrected Markdown content\n\nParagraph text...",
  "metadata": {
    "game": "Zelda OoT",
    "area": "Water Temple",
    "spoilerLevel": "low"
  }
}
```

Note: `content` is Markdown — the client converts TipTap output to Markdown via `@tiptap/extension-markdown` before sending (or server converts via `turndown` — implementation detail to decide at Phase 4).

#### `PATCH /api/ingest/:sourceId/retry` — Response

```json
// 201 Created
{ "jobId": "<new rag_ingestion_jobs._id>" }

// 404 Not Found
{ "error": "Source not found" }

// 409 Conflict
{ "error": "Source is not in a failed state" }

// 422 Unprocessable Entity
{ "errors": [{ "field": "content", "message": "Required" }] }

// 401 / 403
{ "error": "Not authenticated" } | { "error": "Access denied" }
```

---

## Edge Cases

- **Polling a job that expired from Redis but exists in MongoDB:** The status endpoint reads from MongoDB only — Redis TTL expiry does not break the status page.
- **Concurrent retries:** `PATCH /api/ingest/:sourceId/retry` checks `rag_sources.status === "failed"` before creating a new job. If a job is already `queued` or `processing`, return `409`.
- **Job ID not owned by session user:** The status endpoint checks `rag_ingestion_jobs → rag_sources.createdBy` against the session user; return `403` if mismatch. Admins may view all jobs.
- **Progress field before `totalChunks` is set:** Return `progress: null` and `totalChunks: null` until the worker sets them. The UI renders an indeterminate progress indicator until these are available.
- **Edit & Retry on a non-failed source:** Return `409` — only `failed` sources may be retried via this endpoint.
- **TipTap Markdown round-trip fidelity:** The `@tiptap/extension-markdown` extension serialises the editor state back to Markdown. Edge cases (e.g. nested lists, inline HTML) may not round-trip perfectly — acceptable for MVP.

---

## Out of Scope

- Real-time push (SSE/WebSocket) for job updates — polling only in MVP.
- Job cancellation — not required in MVP.
- Bulk retry or bulk status view.
- Job history list page (listing all past jobs for a user) — deferred.
- Admin-level job queue inspection UI.

---

## Open Questions

N/A — all questions resolved during clarification.

---

## Dependencies

- **Depends on:** Epic I-A (source intake — `rag_sources` and `rag_ingestion_jobs` models and BullMQ job creation; `turndown` conversion establishes Markdown storage contract)
- **Blocks:** Epic I-C (worker pipeline updates `rag_ingestion_jobs` fields tracked here and reads the clean Markdown from `rag_sources.content`)
