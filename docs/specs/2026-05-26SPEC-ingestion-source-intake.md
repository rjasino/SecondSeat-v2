# Feature: Ingestion — Epic I-A: Source Intake

**Status:** Approved
**Owner:** rjasino-fs
**Last Updated:** 2026-05-26

---

## Goal

Enable authors and admins to ingest guide content into SecondSeat — either by uploading an MD/HTML file or writing directly in a rich-text editor — so that the RAG pipeline has clean, consistently formatted Markdown source material to chunk and embed.

## Stakeholders

- **Requestor:** rjasino-fs
- **Users affected:** Authors, Admins (ingestion); Regular users are redirected away from this surface
- **Teams involved:** Backend (Next.js API routes, `packages/db`), Frontend (Next.js App Router, TipTap)

---

## User Stories

### Story 1: File Upload

**As an** author or admin,
**I want to** upload a Markdown or HTML guide file,
**So that** its content is extracted, converted to clean Markdown, and queued for embedding without manual copy-paste.

#### Acceptance Criteria

- **Given** I am logged in as author or admin and on `/ingest`, **When** I select a `.md` or `.html` file and submit the form, **Then** the content is extracted server-side, converted to clean Markdown (HTML files converted via `turndown`), stored in `rag_sources.content`, a `rag_sources` document is created with `status: "queued"`, a `rag_ingestion_jobs` document is created, a BullMQ job is enqueued, and I am redirected to `/ingest/status/:jobId`.
- **Given** I am not logged in, **When** I navigate to `/ingest`, **Then** I am redirected to the landing page (`/`).
- **Given** I am logged in as a regular user, **When** I navigate to `/ingest`, **Then** I am redirected to the landing page (`/`).
- **Given** I upload a file with an unsupported extension (not `.md` or `.html`), **When** I submit, **Then** I receive a validation error and no document is created.
- **Given** I upload a file exceeding 5 MB (`INGEST_MAX_FILE_BYTES`), **When** the API receives the request, **Then** it returns `422` with a file-size error.
- **Given** the form is submitted with a missing required field (title, game, area), **When** the API receives the request, **Then** it returns `422` with the field-level error message.

### Story 2: Rich-Text Editor Input

**As an** author or admin,
**I want to** write guide content directly in a rich-text editor,
**So that** I can ingest manually written or pasted content without needing a separate file.

#### Acceptance Criteria

- **Given** I select "Write in form" mode, **When** the editor loads, **Then** a TipTap editor is shown with the toolbar: Italic, Underline, Strikethrough, Inline Code, Code Block, H1, H2, H3, Bullet List, Ordered List, Blockquote, Superscript, Subscript.
- **Given** I fill in the editor and submit, **When** the API receives the request, **Then** TipTap's output is serialised to Markdown server-side (via `turndown`) and stored as `rag_sources.content` with `sourceType: "text"`. No raw HTML is persisted.
- **Given** I submit an empty editor body, **When** the API validates the request, **Then** it returns `422`.

### Story 3: Auth Shell + Navigation Banner

**As any** authenticated user,
**I want to** see a persistent banner showing my account and a logout option,
**So that** I know who I am logged in as and can sign out.

#### Acceptance Criteria

- **Given** I am logged in, **When** I visit any page, **Then** the banner shows my display name and a Logout button.
- **Given** I click Logout, **When** the action completes, **Then** my `iron-session` cookie is cleared and I am redirected to `/`.
- **Given** I am not logged in, **When** I visit `/ingest`, **Then** the banner shows a Login link (pointing to `/`) and I am redirected to `/`.

---

## Data Requirements

### Content storage format — Markdown always

All content stored in `rag_sources.content` is **clean Markdown**, regardless of source format:

| Input                       | Server-side conversion                     | Stored as |
| --------------------------- | ------------------------------------------ | --------- |
| `.md` file                  | None — already Markdown                    | Markdown  |
| `.html` file                | `turndown` HTML → Markdown                 | Markdown  |
| TipTap editor (`text` mode) | TipTap HTML output → `turndown` → Markdown | Markdown  |

This ensures the worker always receives Markdown and can use `MarkdownNodeParser` without branching on `sourceType`.

### `rag_sources` (MongoDB — `packages/db`)

| Field        | Type                                                            | Required | Constraints              | Notes                                                  |
| ------------ | --------------------------------------------------------------- | -------- | ------------------------ | ------------------------------------------------------ |
| `_id`        | ObjectId                                                        | auto     | —                        | Mongoose default                                       |
| `title`      | String                                                          | ✅       | non-empty                | Human label for the source                             |
| `sourceType` | `"file" \| "url" \| "text"`                                     | ✅       | enum                     | `"url"` not used in this epic                          |
| `sourceUri`  | String                                                          | ❌       | —                        | Auto-set to filename for `file` type; empty for `text` |
| `content`    | String                                                          | ✅       | non-empty                | Always clean Markdown after server-side conversion     |
| `createdBy`  | ObjectId                                                        | ✅       | ref: users               | Set from session                                       |
| `metadata`   | Mixed                                                           | ❌       | —                        | `{ game, area, spoilerLevel }`                         |
| `status`     | `"idle" \| "queued" \| "processing" \| "completed" \| "failed"` | ✅       | enum, default `"queued"` | Set to `"queued"` on creation                          |
| `startedAt`  | Date                                                            | ❌       | —                        | Set by worker                                          |
| `finishedAt` | Date                                                            | ❌       | —                        | Set by worker                                          |
| `createdAt`  | Date                                                            | auto     | —                        | Mongoose timestamps                                    |
| `updatedAt`  | Date                                                            | auto     | —                        | Mongoose timestamps                                    |

**Index:** `{ status: 1, createdBy: 1 }`

### `rag_ingestion_jobs` (MongoDB — `packages/db`)

| Field             | Type                                                  | Required | Constraints              | Notes                                             |
| ----------------- | ----------------------------------------------------- | -------- | ------------------------ | ------------------------------------------------- |
| `_id`             | ObjectId                                              | auto     | —                        | Mongoose default                                  |
| `sourceId`        | ObjectId                                              | ✅       | ref: rag_sources         | FK to the source                                  |
| `queueJobUuid`    | String                                                | ✅       | —                        | BullMQ job ID                                     |
| `status`          | `"queued" \| "processing" \| "completed" \| "failed"` | ✅       | enum, default `"queued"` | —                                                 |
| `totalChunks`     | Number                                                | ❌       | —                        | Populated by worker                               |
| `processedChunks` | Number                                                | ❌       | default 0                | Incremented by worker                             |
| `progress`        | Number                                                | ❌       | 0–100                    | Derived field (processedChunks/totalChunks × 100) |
| `error`           | String                                                | ❌       | —                        | Populated on failure                              |
| `startedAt`       | Date                                                  | ❌       | —                        | Set by worker                                     |
| `finishedAt`      | Date                                                  | ❌       | —                        | Set by worker                                     |
| `createdAt`       | Date                                                  | auto     | —                        | —                                                 |
| `updatedAt`       | Date                                                  | auto     | —                        | —                                                 |

**Index:** `{ sourceId: 1, createdAt: -1 }`

### `packages/db` — Phase 0 prerequisite

Wire real Mongoose `connect()` and export models for all six collections:
`User`, `Game`, `PlaySession`, `HintInteraction`, `RagSource`, `RagIngestionJob`, `RagDocument`.
Models are shared by `apps/web`, `apps/inference`, and `apps/workers`.

---

## Flow Diagram

```mermaid
flowchart TD
    A[User navigates to /ingest] --> B{Session valid?\nrole: author | admin}
    B -->|No| C[Redirect to /]
    B -->|Yes| D[Render intake form]

    D --> E{Source mode}
    E -->|File upload| F[Select .md or .html file]
    E -->|Write in form| G[TipTap rich-text editor]

    F --> H[Fill metadata: title, game, area, spoilerLevel]
    G --> H

    H --> I[Submit form]
    I --> J[POST /api/ingest]

    J --> K{Validate with Zod\nsize, extension, required fields}
    K -->|Invalid| L[Return 422 — field errors shown in UI]
    K -->|Valid| M{sourceType}

    M -->|file .md| N[Read buffer as UTF-8 Markdown]
    M -->|file .html| O[Read buffer → turndown → Markdown]
    M -->|text| P[TipTap HTML from body → turndown → Markdown]

    N --> Q[Write rag_sources to MongoDB\ncontent: clean Markdown, status: queued]
    O --> Q
    P --> Q

    Q --> R[Enqueue BullMQ job]
    R -->|enqueue fails| S[Mark rag_sources status: failed → return 500]
    R -->|enqueue ok| T[Write rag_ingestion_jobs to MongoDB\nstatus: queued, queueJobUuid set]
    T --> U[Return 201 { jobId }]
    U --> V[Redirect to /ingest/status/:jobId]
```

---

## API Contract

### Next.js Route Handlers (`apps/web`)

| Method | Endpoint           | Auth               | Description                                                                                  |
| ------ | ------------------ | ------------------ | -------------------------------------------------------------------------------------------- |
| `POST` | `/api/ingest`      | ✅ author \| admin | Upload file or text content; converts to Markdown; creates source + job; returns `{ jobId }` |
| `GET`  | `/api/auth/logout` | ✅ any             | Clears `iron-session` cookie; redirects to `/`                                               |

#### `POST /api/ingest` — Request

`multipart/form-data` for file upload; `application/json` for text mode.

**File mode fields:**

| Field                   | Type                                    | Required |
| ----------------------- | --------------------------------------- | -------- |
| `title`                 | string                                  | ✅       |
| `sourceType`            | `"file"`                                | ✅       |
| `file`                  | File (`.md` \| `.html`, max 5 MB)       | ✅       |
| `metadata.game`         | string                                  | ✅       |
| `metadata.area`         | string                                  | ✅       |
| `metadata.spoilerLevel` | `"none" \| "low" \| "medium" \| "high"` | ✅       |

**Text mode fields:**

| Field                   | Type                                                     | Required |
| ----------------------- | -------------------------------------------------------- | -------- |
| `title`                 | string                                                   | ✅       |
| `sourceType`            | `"text"`                                                 | ✅       |
| `content`               | string (TipTap HTML — converted server-side to Markdown) | ✅       |
| `metadata.game`         | string                                                   | ✅       |
| `metadata.area`         | string                                                   | ✅       |
| `metadata.spoilerLevel` | `"none" \| "low" \| "medium" \| "high"`                  | ✅       |

#### `POST /api/ingest` — Response

```json
// 201 Created
{ "jobId": "<rag_ingestion_jobs._id>" }

// 422 Unprocessable Entity
{ "errors": [{ "field": "title", "message": "Required" }] }

// 401 Unauthorized
{ "error": "Not authenticated" }

// 403 Forbidden
{ "error": "Insufficient role" }

// 500 Internal Server Error
{ "error": "Failed to enqueue ingestion job" }
```

---

## Edge Cases

- **Double submission:** The submit button is disabled after first click; the API is idempotent at the network boundary (duplicate requests create separate jobs — dedup is not required at MVP).
- **File too large:** Enforce server-side file size cap via `INGEST_MAX_FILE_BYTES` (default `5242880` — 5 MB). Return `422` if exceeded. Do not rely solely on client-side validation.
- **Unsupported MIME type:** Validate by both file extension (`.md`, `.html`) and MIME type (`text/markdown`, `text/html`) on the server — do not trust the client's `Content-Type` alone.
- **TipTap empty body:** Zero-length or whitespace-only content after `turndown` conversion returns `422`.
- **`turndown` produces empty output from HTML:** If an `.html` file or TipTap submission yields an empty Markdown string after conversion, return `422` with message `"No content extracted"`.
- **Session expires mid-form:** Next.js middleware redirects on next request; form data is lost (no draft-save in MVP).
- **MongoDB write succeeds but BullMQ enqueue fails:** Mark `rag_sources.status` as `"failed"` and return `500`. Do not leave an orphaned source with no job.

---

## Out of Scope

- `url` source type — data model field exists; UI option not rendered in this epic.
- Full login page / registration flow — `iron-session` cookie is set but the login UI is a placeholder (Login link redirects to `/`).
- Draft saving / auto-save for the TipTap editor.
- File preview or content diff before submission.
- Bulk upload (multiple files in one request).
- Admin user management UI.

---

## Open Questions

N/A — all questions resolved during clarification.

---

## Dependencies

- **Depends on:** `packages/db` Mongoose wiring (Phase 0, part of this epic's implementation), Redis + MongoDB running via `docker-compose.yml`, `turndown` npm package for HTML → Markdown conversion
- **Blocks:** Epic I-B (job lifecycle reads `rag_ingestion_jobs` written here), Epic I-C (worker reads `rag_sources.content` as clean Markdown)
