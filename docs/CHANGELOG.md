# Changelog

All notable changes to SecondSeat are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

---

## Unreleased

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
