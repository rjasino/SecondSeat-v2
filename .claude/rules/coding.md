---
name: coding
description: TypeScript coding standards for SecondSeat — applies to all apps in the monorepo (Next.js, Express, BullMQ workers)
---

## TypeScript — General (All Apps)

- Strict mode is always on (`"strict": true` in every `tsconfig.json`).
- No `any` types — use `unknown` and narrow explicitly if needed.
- Export types and interfaces from a co-located `.types.ts` file next to the module that owns them.
- Use TypeScript `enum` only for fixed UI states; prefer `as const` objects for string unions everywhere else.

## TypeScript — Frontend (`apps/web`, Next.js)

- Define all prop interfaces with explicit types — no implicit `{}` objects.
- Use the App Router conventions: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` — no mixing with Pages Router patterns.
- Server Components are the default — only add `"use client"` when the component requires browser APIs, event handlers, or client state.
- Fetch data in Server Components or Route Handlers; never expose backend credentials to client components.
- Type all `fetch` responses explicitly — do not cast to `any` after `json()`.

## TypeScript — Backend (`apps/inference`, Express.js)

- Type all route handlers with Express generics: `RequestHandler<Params, ResBody, ReqBody, Query>`.
- Validate all incoming request bodies and query params with **Zod** at the route boundary — never trust `req.body` raw downstream.
- Extend the Express `Request` type (e.g. `req.user`) via module augmentation in `apps/inference/src/types/express.d.ts` — never use type assertion to bolt on properties.
- Wrap all async route handlers with a `catchAsync` utility to forward errors to the centralized error middleware:
  ```ts
  // lib/catchAsync.ts
  export const catchAsync =
    (fn: RequestHandler): RequestHandler =>
    (req, res, next) =>
      Promise.resolve(fn(req, res, next)).catch(next);
  ```
- Separate concerns strictly: `routes/` → `controllers/` → `services/`. Controllers only orchestrate — no business logic. Services have no knowledge of `req`/`res`.
- Use a single centralized error handler middleware (registered last in `app.ts`) that maps known error types to HTTP responses.
- Use `zod` schemas as the single source of truth for request/response shapes — derive TypeScript types from schemas with `z.infer<>`.

## TypeScript — Workers (`apps/workers`, BullMQ)

- Type all job data payloads explicitly — define a `JobData` interface per queue and pass it as the BullMQ `Job<T>` generic.
- Processors must be pure functions of their job input — no side effects beyond the queue contract (chunking → ChromaDB write).
- Always handle job failure explicitly and rethrow so BullMQ can track retries correctly.
