# Decisions

Architecture and product decisions for SecondSeat, in reverse chronological order. Each entry captures the **context** (why), the **decision** (what), the **alternatives** weighed, and the **consequences** (trade-offs / follow-ups).

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
