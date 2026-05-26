# Decisions

Architecture and product decisions for SecondSeat, in reverse chronological order. Each entry captures the **context** (why), the **decision** (what), the **alternatives** weighed, and the **consequences** (trade-offs / follow-ups).

---

## 2026-05-27 — Guide Writer UI Polish & Source Delete Pipeline

**Context**
The guide writer editor relies on a TipTap `BubbleMenu` (appears only on text selection) as its sole formatting surface, which forces authors to select text before applying any style — disruptive for keyboard-heavy guide writing. There is also no persistent autosave feedback, so authors cannot tell whether their work is saved. More critically, the only source-record deletion mechanism is an instant hard-delete that leaves orphaned vectors in ChromaDB; stale vectors will silently pollute RAG retrievals until a manual ChromaDB cleanup is run. Both the UX gaps and the vector-consistency gap need to be closed before the inference stream is wired against the knowledge base. Spec: [guide-writer-ui-and-source-delete-pipeline](specs/2026-05-26-SPEC-guide-writer-ui-and-source-delete-pipeline.md).

**Decision**

- **Static formatting toolbar replaces BubbleMenu.** A fixed toolbar rendered above the editor card at all times removes the selection requirement and gives authors a persistent, discoverable formatting surface. Active-state highlighting (accent border + tinted background) communicates the current mark/node state without needing a separate status area. The `BubbleMenu` component is removed entirely — having two competing formatting surfaces would create conflicting UX.
- **Autosave indicator below the editor.** The timestamp label (`"Autosaved at HH:MM AM/PM"`) is separate from the header save-state indicator (`"Saving…"` / `"Saved ✓"` / `"Save failed — retrying…"`). The header tracks the in-flight state of the current save cycle; the timestamp records the last known-good write. The two are complementary and avoid conflating "save in progress" with "last known saved time." The indicator is hidden before the first successful save to avoid showing a misleading zero-state.
- **`ConfirmDialog` as a shared component.** Both draft delete and source delete require a confirmation step with the same visual pattern. A single reusable `ConfirmDialog` component with a `loading` prop (disables both buttons, shows spinner on confirm) prevents duplicate confirmation UX and ensures both flows handle double-click protection identically. The component is co-located in `apps/web/src/components/ui/` — it is not domain-specific to ingestion.
- **Draft delete as a synchronous hard-delete (`DELETE /api/ingest/drafts/:sourceId`, `204`).** Drafts by definition have never been ingested, so there are no ChromaDB vectors to clean up. A synchronous hard-delete is the correct approach — no async pipeline needed, no `"deleting"` status required. The API gate (`status === "draft"`) prevents this endpoint from accidentally deleting ingested sources.
- **Source delete as an async soft-delete pipeline.** Ingested sources have associated ChromaDB vectors that must be removed to maintain vector-space consistency. An instant hard-delete would leave orphaned vectors. The chosen flow: API sets `status = "deleting"` + saves `previousStatus`, enqueues a `delete-source` BullMQ worker job, returns `202 { jobId }` immediately. The worker deletes ChromaDB vectors (metadata filter `{ source_id: sourceId }`), then hard-deletes the MongoDB `RagSource` + `RagIngestionJob` documents. This pattern mirrors the existing ingestion pipeline shape and reuses the same BullMQ/worker infrastructure.
- **`previousStatus` field on `RagSource` for failure recovery.** If the worker exhausts BullMQ retries (e.g. ChromaDB unreachable), the source must return to a stable, user-actionable state. Storing `previousStatus` at the moment of the API's `status = "deleting"` transition gives the worker the information needed to roll back without a separate event log. The field is cleared on successful hard-delete (moot at that point).
- **Idempotent `DELETE /api/ingest/sources/:sourceId`.** If the client retries the delete (network blip, double-click), the API returns `202` without enqueuing a duplicate worker job. This prevents multiple workers from racing to delete the same vectors and MongoDB records.
- **`409` when source is `"processing"`.** Deleting a source mid-ingestion would leave the worker writing vectors for a document that no longer exists in MongoDB. The `409` response keeps the delete button disabled during active ingestion.
- **`badge--deleting` in amber.** The existing badge palette uses green (completed), blue (processing), and red (failed). Amber signals "destructive in-progress" — distinct from all three and consistent with conventional amber-as-warning colour semantics. Implemented as a dedicated `badge--deleting` CSS class to avoid a magic inline-style.
- **Source detail page redirects to `/dashboard/ingest` on `404` during polling.** Once the worker hard-deletes the `RagSource` document, `GET /api/ingest/sources/:sourceId` returns `404`. A redirect on `404` during the polling loop gives a clean exit without showing an error page for an expected terminal state.

**Alternatives considered**

- **Keep BubbleMenu alongside a new fixed toolbar.** Rejected — two overlapping formatting surfaces create ambiguity about which is the canonical tool and which keyboard shortcuts apply. One surface is cleaner.
- **Single autosave indicator in the header (no separate timestamp label).** Rejected — the header indicator is ephemeral during save cycles; without a persistent timestamp, authors have no record of the last successful save.
- **Inline confirm without a modal (e.g. two-step button: "Delete" → "Confirm delete?").** Rejected — inline two-step buttons are subtler than a modal and more easily missed, especially for a destructive operation. A modal with explicit "Delete" / "Cancel" and a clear consequence message is the safer default for permanent deletion.
- **Synchronous vector delete at API time (block on ChromaDB call).** Rejected — ChromaDB deletes can be slow for large vector sets; a blocking API call would produce poor UX (spinner for seconds) and timeouts under load. The async pipeline decouples API responsiveness from ChromaDB availability.
- **Soft-delete flag on `RagSource` (never hard-delete).** Rejected — soft-deletes require every downstream query (especially RAG retrieval) to filter out deleted records, adding complexity and the risk of accidental inclusion. A hard-delete after vector cleanup is the correct final state for a deleted source.
- **Store `previousStatus` in a separate collection or Redis.** Rejected — `previousStatus` is a transient field on the source document itself; adding it inline avoids a separate lookup and is self-contained within the existing Mongoose schema. It carries no semantic meaning after the delete pipeline completes.
- **Separate retry UI for failed deletes in this task.** Deferred per spec — the "Delete failed" message tells the user to retry manually via the source detail page's existing Delete button. A dedicated retry flow is a follow-up task.

**Consequences**

- `RagSource` model gets a new optional `previousStatus` field. The migration is additive (no existing documents are affected; `null` default is safe). Any code that reads `source.status` should remain unaffected; only the delete pipeline reads `previousStatus`.
- The `delete-source` BullMQ queue is a new queue registered in `apps/workers`. The worker process must be restarted to pick up the new processor registration.
- ChromaDB vector cleanup runs synchronously within the BullMQ job (no parallel batch delete). For sources with thousands of vectors, a single metadata-filter delete call may be slow. Acceptable for MVP; a paginated or batched delete strategy can be introduced if latency is observed.
- The source detail page's polling loop now has a `404`-triggered redirect as a terminal condition alongside the existing `"completed"` / `"failed"` checks. This is a new polling exit path that must be covered in E2E tests.
- Draft delete (`DELETE /api/ingest/drafts/:sourceId`) is a distinct endpoint from source delete (`DELETE /api/ingest/sources/:sourceId`). The split is intentional — the two operations have different semantics and different preconditions. Future callers should not conflate them.
- The `ConfirmDialog` component is in `apps/web/src/components/ui/` — a shared UI layer, not the ingestion domain. If other admin flows (e.g. game management) need confirmation dialogs in future, they can reuse this component without touching the ingestion namespace.

---

## 2026-05-26 — Auth alignment: Spec 2 contract reconciliation

**Context**
The initial auth implementation (login, register, logout, middleware, NavBanner, seed script) shipped against an earlier spec draft. Spec 2 (`2026-05-26SPEC-auth-module-2.md`) tightened the API contract in several ways: leaner session payload (no PII in the encrypted cookie), machine-readable response shapes, a missing `/api/auth/me` identity endpoint, logout via POST (not GET) to prevent CSRF-style prefetch triggering, a stricter 12-character password minimum, role-aware NavBanner with login/register links and an ingestion link for elevated roles, and seed script improvements (display name env vars, early password validation). All of these were confirmed in task clarification as in-scope for this alignment task. Spec: [auth-alignment](specs/2026-05-26SPEC-auth-alignment.md).

**Decision**

- **Slim `SessionUser` to `{ userId, role }` only.** PII (email, displayName) baked into an encrypted cookie is unnecessary risk — if the cookie is ever mis-configured (not `httpOnly`, wrong `secure` flag), PII leaks. Consumers that need name/email now call `GET /api/auth/me` or do a DB lookup directly. Field `id` → `userId` to make the semantics explicit (MongoDB `_id.toString()`).
- **New `GET /api/auth/me` endpoint backed by a `cache()`-wrapped helper.** Rather than embedding display data in the session, components fetch it on demand. Next.js `cache()` deduplicates the `User.findById` call within a single server render tree, so NavBanner and any layout component reading the same user pay only one DB round-trip per request. If the user document is missing (deleted after session was issued), the endpoint destroys the stale session and returns `401`.
- **Logout converted to `POST`.** A `GET /api/auth/logout` can be triggered by link prefetching, an `<img>` tag, a CSRF probe, or any browser that eagerly fetches `href` values. `POST` cannot. NavBanner logout is implemented via `<form method="post" action="/api/auth/logout">` — no client JS required, works with Server Components.
- **Response bodies stripped to `{ ok, role }` for login/register.** The previous implementation returned the full `SessionUser` object in the JSON body. Nothing on the client actually needed `email` or `displayName` from the body (they were being read from the session or re-fetched). Lean bodies reduce the surface for accidental logging of PII in server logs.
- **Password minimum raised to 12 characters (schema + seed).** Matches the Spec 2 contract. Applied at the Zod schema boundary for new registrations and validated in the seed script before DB connection. Existing users are unaffected.
- **`confirmPassword` removed from the server-side Zod schema.** The field adds no security value at the API layer (only one password field is ever hashed). The register UI retains a client-side confirm field for UX, but the API call sends only `{ name, email, password }`, eliminating a field that the backend was previously required to validate and discard.
- **Middleware rules tightened to match Spec 2.** Key changes: `role: "user"` on API routes returns `403` JSON (not a redirect, so `fetch()` callers receive a parseable error); `role: "user"` on UI routes redirects to `/` (not `/login`, which implied the user could gain access by logging in again — they can't); `/` always passes through unconditionally.
- **Seed script renamed and extended.** `seed-admins.ts` → `seed-privileged-users.ts` to better communicate its purpose (provisions any privileged role, not just admins). Display name vars (`SEED_ADMIN_NAME`, `SEED_AUTHOR_NAME`) are now required; the script validates all 6 vars and password length before opening a DB connection — fail-fast prevents partial seeding.

**Alternatives considered**

- **Keep PII in session, skip `/api/auth/me`.** Rejected — PII in encrypted cookies is a security smell regardless of the encryption strength. The `/api/auth/me` endpoint is a one-time DB lookup on navigation render, which is negligible overhead.
- **Use server-side `redirect()` for logout instead of a form POST.** Rejected — a Server Action that calls `redirect()` would work, but a plain `<form method="post">` is simpler, requires no client bundle, and expresses intent clearly in HTML semantics.
- **Raise password minimum only for new features (leave seed at 8 chars).** Rejected — inconsistent minimums in the same codebase create confusion. The seed script provisions accounts that log into the same system; they should meet the same policy.
- **Return `{ user: { userId, role } }` wrapper in login/register response.** Rejected — Spec 2 defines the flat `{ ok, role }` shape; wrapping adds nesting for no benefit and would break any future client that reads the spec directly.
- **Client Component NavBanner that fetches `/api/auth/me` on mount.** Considered — would enable real-time name updates without a page reload. Deferred: the Server Component + `cache()` approach avoids a loading flash and is simpler for MVP. Can switch to client-side if the display name becomes editable in-session.

**Consequences**

- All existing consumers of `session.user.id`, `session.user.email`, `session.user.displayName` (ingest layout, ingest route handlers) must be updated in this task — no phased migration. This is a breaking internal change contained entirely within `apps/web`.
- `GET /api/auth/logout` is removed. Any bookmark, browser history entry, or external link pointing to the GET endpoint will receive a `404`. Acceptable for a development-phase app with no real users.
- NavBanner now issues a DB read (`User.findById`) on every server render that requires the user's display name. The `cache()` wrapper deduplicates within a request but not across requests. For MVP traffic this is negligible; add a short-lived in-memory cache or Redis layer if it becomes a bottleneck.
- The seed script `npm run seed:default` alias no longer exists; operators must use `npm run seed:privileged`. Update any local runbooks or onboarding docs.
- Epic IF-A (inference stream / player identity) must be built on the new `{ userId, role }` session shape. This alignment task is a prerequisite for IF-A; it must land first.

---

## 2026-05-26 — Auth module: user roles, route protection & seed script

**Context**
The ingestion pipeline (Epic I) is in place but every route is effectively open — the `ingest/layout.tsx` performs a basic role check but there is no login flow, no session-creation endpoint, and no middleware to enforce route access. Regular users, authors, and admins all have distinct access boundaries, and a seed script is required because privileged accounts cannot self-register. Before any inference or player-facing work begins, authenticated identity must be a first-class concern. Spec: [auth-module](specs/2026-05-26SPEC-auth-module.md).

**Decision**

- **`iron-session` for session management.** The session infrastructure (`lib/session.ts`, `SessionUser` type, `sessionOptions`) was already scaffolded in Epic I-A. The auth module builds directly on it with two new Route Handlers (`POST /api/auth/login`, `POST /api/auth/register`). No JWT, no NextAuth — `iron-session` provides signed-and-encrypted `httpOnly` cookies with minimal surface area, matching the security rules.
- **`argon2` for password hashing.** Per `security.md`, `argon2` is the mandated hashing library (memory-hard, PHC winner, more GPU-resistant than bcrypt). Added to both `apps/web` (route handlers) and `packages/db` (seed script).
- **No self-registration for `"author"` or `"admin"`.** The `/register` endpoint hard-codes `role: "user"`. Privileged accounts are provisioned exclusively via the seed script using env vars. This eliminates a privilege-escalation surface with zero config overhead.
- **`profile.displayName` synced on register and seed.** Both the top-level `user.name` and `user.profile.displayName` are written to the same value at account creation time. The session and banner use `user.name` (required, always present); `profile.displayName` is kept in sync so future profile pages do not need a migration.
- **Next.js Edge middleware for route protection.** A single `middleware.ts` at the `apps/web` root intercepts all relevant routes. `/ingest/*` redirects both unauthenticated visitors and `role: "user"` sessions to `/login`. `/login` and `/register` redirect already-authenticated users to their role's home, preventing double-session states.
- **`role: "user"` on `/ingest/*` redirects to `/login` (not `/`).** Consistent redirect target for any unauthorized access to the ingest area — simpler mental model than role-conditional redirect targets, and avoids confusion where a regular user might think they should be on `/`.
- **Seed script in `packages/db/scripts/`** with `tsx` as the runner (already used in `apps/workers`). Idempotent by design: checks email existence before insert and skips with a log line. Exits with non-zero code if any required env var is missing — fail-fast before touching the database.
- **`packages/db` gets `tsx` as a devDependency.** The package had no devDependencies previously. Adding `tsx` here keeps the seed script self-contained and avoids requiring a workspace-level runner install.

**Alternatives considered**

- **NextAuth / Auth.js.** Rejected — significant abstraction overhead for a solo MVP sprint. `iron-session` + custom Route Handlers gives full control with ~50 lines of code and zero magic. Can be layered on later if OAuth providers are added.
- **JWT stored in `localStorage`.** Rejected — `security.md` explicitly prohibits storing auth tokens in `localStorage`. `iron-session` `httpOnly` cookies are the mandated approach.
- **bcrypt for password hashing.** Rejected — `security.md` mandates `argon2`.
- **Redirect `role: "user"` on `/ingest/*` to `/` rather than `/login`.** Rejected — the user confirmed `/login` is the correct redirect for both unauthenticated and unauthorized-role access to the ingest area. A single redirect target is simpler.
- **Seed script in root `scripts/` folder.** Rejected — the seed script's only concern is the `@secondseat/db` package (Mongoose connection, User model). Collocating it in `packages/db/scripts/` makes the dependency boundary explicit.
- **Admin-creates-users UI.** Out of scope for MVP — env-var seed is sufficient for the competition sprint timeline.

**Consequences**

- `argon2` is a native addon (compiles on install). Adds a compile step to CI and requires build tools (`node-gyp`) in the environment. Acceptable trade-off for the security benefit; the Docker-based CI/dev setup already has build tools available.
- The ingest layout's existing role check (`ingest/layout.tsx`) becomes partially redundant once middleware is in place. It should be kept as a defence-in-depth layer, but the middleware is now the authoritative enforcement point.
- `/api/auth/login` and `/api/auth/register` are rate-limit candidates — not wired in this task (no rate-limit middleware on `apps/web` Route Handlers yet). Follow-up: add `express-rate-limit` equivalent (or a Next.js middleware rate-limit) to auth endpoints before any public deployment.
- Seed accounts use names defaulting to `"Admin"` and `"Author"`. If operators need custom display names, they must update the MongoDB document directly after seeding — env vars for names were explicitly out of scope.

---

## 2026-05-26 — Ingestion pipeline: source intake, job lifecycle, worker pipeline

**Context**
The monorepo scaffold is in place but no content can enter the system. The RAG retrieval layer — and therefore the entire inference path — requires a vector knowledge base built from ingested guide documents. The ingestion pipeline is the critical path blocker for every downstream epic (inference stream, hint generation). Three coordinated epics are needed: a Next.js intake UI and API for accepting guide content (Epic I-A), a job tracking layer that persists BullMQ state durably in MongoDB (Epic I-B), and a BullMQ worker that chunks, embeds, and upserts content into ChromaDB (Epic I-C). Specs: [I-A](specs/2026-05-26SPEC-ingestion-source-intake.md), [I-B](specs/2026-05-26SPEC-ingestion-job-lifecycle.md), [I-C](specs/2026-05-26SPEC-ingestion-worker-pipeline.md).

**Decision**

- **Markdown as the single storage format.** All content stored in `rag_sources.content` is clean Markdown regardless of input format. `.html` files and TipTap HTML output are converted server-side via `turndown` before MongoDB write. The worker therefore always receives Markdown and can use `MarkdownNodeParser` unconditionally — no branching on `sourceType`.
- **TipTap with `@tiptap/extension-markdown` for both intake and Edit & Retry.** TipTap serialises editor state to Markdown (not HTML) on submit, and loads stored Markdown back into the editor for editing. This means the Edit & Retry form is identical for file-upload sources and text-mode sources — no distinction in the UI.
- **256-token chunk ceiling to match `all-MiniLM-L6-v2`.** MiniLM silently truncates inputs beyond its 256-token context window. The chunker is configured to 256-token max (down from a naïve 512 default) with 32-token overlap. `MarkdownNodeParser` runs first to preserve section structure; `SentenceSplitter` is applied only to nodes that exceed the ceiling.
- **Dual state persistence: BullMQ/Redis + MongoDB.** `rag_ingestion_jobs` in MongoDB provides durable job history independent of Redis TTL. The status page reads from MongoDB only — Redis expiry never breaks the UI.
- **`@secondseat/embedding` singleton.** The package loads `Xenova/all-MiniLM-L6-v2` once via a module-level promise and reuses it. Both `apps/workers` (ingestion) and `apps/inference` (query time) import the same package, guaranteeing vector-space parity.
- **Auth: creator-scoped job visibility.** Only the author who created a source (or an admin) can view or retry that job. Regular users are redirected to `/` from all `/ingest` routes.
- **`CHROMA_COLLECTION_NAME` is configurable.** Defaults to `secondseat_guide_chunks` but can be overridden per environment to isolate dev/staging data on a shared ChromaDB instance.

**Alternatives considered**

- **Store raw HTML in MongoDB, convert at chunk time.** Rejected — the worker would need to branch on `sourceType` and carry an HTML-stripping dependency. Centralising conversion at intake simplifies the worker and guarantees the stored content is always human-readable Markdown.
- **Use DOMPurify for HTML sanitisation (client-side).** Rejected — DOMPurify is browser-only; server-side conversion via `turndown` achieves both sanitisation and format normalisation in one step.
- **Single TipTap mode (no file upload).** Rejected — authors need to ingest existing guide files (MD/HTML from GameFAQs, wikis, etc.) without manual copy-paste.
- **SSE/WebSocket for real-time job progress.** Rejected for MVP — polling every 3 s is sufficient for a 30–120 s ingestion job and avoids the complexity of persistent connections in the Next.js App Router layer.
- **Redis-only job state (no MongoDB mirror).** Rejected — Redis TTL would eventually expire job records, breaking the status page and audit trail for long-running jobs.
- **512-token chunk size.** Rejected — MiniLM's 256-token hard limit means inputs beyond that are silently truncated, producing worse embeddings without any error signal. The chunker must respect the model's actual capacity.
- **`@huggingface/transformers` (the renamed fork).** Rejected — SDD specifies `@xenova/transformers` and the fork's API surface is still stabilising. Stay on the SDD-specified package for now; migration is a one-line change when the time comes.
- **Parallel chunk processing within a job.** Rejected for MVP — sequential processing is simpler to reason about for progress tracking and error recovery. Parallelism can be added if ingestion latency becomes a bottleneck.

**Consequences**

- `turndown` is a new runtime dependency in `apps/web`. It is a stable, widely-used library but adds ~20 KB to the server bundle.
- `@tiptap/extension-markdown` Markdown round-trip is not lossless for all Markdown constructs (e.g. nested lists, raw HTML blocks). Content with complex formatting may be subtly altered on Edit & Retry. Acceptable for MVP guide content.
- The 256-token chunk ceiling produces more chunks per document than a 512-token window. This increases ChromaDB write volume and embedding computation time but improves retrieval quality by keeping chunks within the model's lossless range.
- Orphaned `rag_documents` rows from a retry that produces fewer chunks than the original are not cleaned up in MVP. This is flagged in I-C's Out of Scope and can be addressed with a cleanup job later.
- Workers must connect to MongoDB on startup (via `@secondseat/db`). This couples the worker process to Mongo availability — acceptable since both run under the same `docker-compose.yml` in development and the same platform in production.
- The `@secondseat/embedding` singleton pattern means the model is loaded in-process in both `apps/workers` and `apps/inference`. Each process carries the model weights in memory (~90 MB for MiniLM). This is acceptable for the MVP scale; a shared embedding microservice could be introduced if memory pressure becomes an issue.

---

## 2026-05-26 — Monorepo scaffold with liveness-only health checks

**Context**
The repo had docs (PRD, SDD, data model) but no runnable code. Every subsequent feature — ingestion, inference stream, voice — assumes the npm-workspaces monorepo layout in [docs/sdd.md §6](sdd.md), the security/coding/testing rules in `.claude/rules/`, and shared packages (`@secondseat/db`, `@secondseat/embedding`). Without a scaffold in place first, each new feature would either re-litigate the structure or grow inconsistencies. Spec: [2026-05-26SPEC-monorepo-scaffold-health-checks.md](specs/2026-05-26SPEC-monorepo-scaffold-health-checks.md).

**Decision**
Stand up the full workspace layout — three apps (`web`, `inference`, `workers`) and two shared packages — exposing only liveness health checks. Apply the rule-compliant baseline (helmet, express-rate-limit, centralized error handler, `catchAsync`, Zod validation) on `apps/inference` from the first commit so feature work doesn't retrofit security later. Include `docker-compose.yml` for Mongo + Redis + Chroma, per-app `.env.example`, per-app Zod-validated `lib/config.ts` that fails fast on missing keys, and one Vitest + Supertest smoke test per app. TailwindCSS 4 is configured in `apps/web` with a one-utility-class placeholder so the build pipeline is provably wired.

**Alternatives considered**

- **Skip scaffold, build features ad-hoc.** Rejected — guarantees structural drift and rework, and the workflow's PreToolUse gate already presumes the layout exists.
- **Liveness + readiness (Mongo/Redis/Chroma pings).** Rejected for now — dev infra is often not running; readiness probes would false-alarm and obscure real failures. Add when monitoring is wired.
- **Single `/health` with per-dependency reachability.** Rejected — conflates liveness and readiness semantics in one endpoint, harder to interpret in a future ops dashboard.
- **Minimal Express setup (no helmet/rate-limit yet).** Rejected — security.md/coding.md mandate them; adding them retroactively is exactly the drift this scaffold is meant to prevent.
- **Defer shared packages until a real consumer exists.** Rejected — stubs cost almost nothing and they anchor the import paths every later feature will use.
- **Add Playwright + ESLint/Prettier now.** Rejected — premature before any UI exists. Tailwind is in because SDD §1 names it in the stack; lint/format tooling is not mentioned anywhere and adds maintenance without immediate payoff.

**Consequences**

- All three apps boot independently and respond to a health probe before any feature exists — useful as a sanity check during early development and as a future deploy-readiness baseline.
- Workers process must run a tiny HTTP server (bound to `WORKER_HEALTH_PORT`) purely for the probe; this is dead-weight cycles today but matches the shape any future health/metrics/admin surface will need.
- `express-rate-limit` applies its global default to `/api/v1/health`. A future monitoring integration will need a health-specific bypass — flagged in the spec's Edge Cases.
- Shared packages ship as no-op stubs. First real consumer (likely ingestion) will replace `connect()` and `embed()` with working logic; until then, importing them is safe but produces nothing.
- `.env` is required at startup for every app (Zod fails fast). Developers must copy `.env.example` and fill values before `npm run dev`; this is intentional friction to prevent silent `undefined` propagation.
- No ESLint/Prettier yet — code style is enforced only by `tsc --strict` and review. Revisit if drift becomes painful.
- The Epic I-A/I-B/I-C ingestion work referenced in CLAUDE.md is treated as superseded by this scaffold; re-anchoring it on the new structure is a follow-up spec, not part of this task.
