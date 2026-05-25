---
name: testing
description: Testing standards for SecondSeat — stack choices, conventions, and coverage targets per app layer
---

## Testing Stack

| Layer              | Tool           | Purpose                                                                     |
| :----------------- | :------------- | :-------------------------------------------------------------------------- |
| Unit + Integration | **Vitest**     | TypeScript-native, Jest-compatible API, fast. Used across all three apps.   |
| Express API routes | **Supertest**  | In-process HTTP assertions against the Express app — no real server needed. |
| E2E (UI flows)     | **Playwright** | Browser automation for the Next.js second-screen UI.                        |

Install Vitest per app workspace (`apps/web`, `apps/inference`, `apps/workers`) with a shared `vitest.config.ts` at the root for common settings.

## File Conventions

- Unit and integration tests: co-located as `*.test.ts` next to the source file they test.
- E2E tests: `apps/web/e2e/*.spec.ts` — kept separate from source, run by Playwright only.
- Test utilities and shared fixtures: `apps/<name>/src/__tests__/helpers/`.
- Never mix unit and E2E assertions in the same file.

## What to Test Per Layer

### `apps/inference` — highest priority (hint generation is the trust-critical path)

- **Unit:** LangChain prompt assembly — assert that spoiler-safety policy is present in the prompt template; assert that session memory is correctly injected.
- **Unit:** Zod schemas — assert that invalid request shapes are rejected with the correct error structure.
- **Integration (Supertest):** Each Express route — happy path response shape, auth enforcement (assert `401` with no token), rate-limit headers present.
- **Unit:** RAG retrieval service — mock ChromaDB client, assert that retrieved chunks are passed to the prompt assembler.
- Coverage target: **80%** on `apps/inference/src/services/`.

### `apps/workers`

- **Unit:** Chunking processor — assert chunk count, chunk size bounds, and metadata fields for a known input document.
- **Unit:** Embedding processor — mock the embedding model, assert that ChromaDB upsert is called with correctly shaped vectors.
- **Unit:** Job failure handling — assert that errors are rethrown so BullMQ tracks retries.

### `apps/web`

- **Unit:** Server Actions and Route Handlers — mock downstream Express calls, assert response shapes.
- **E2E (Playwright):** Core player flow — load game, submit a text hint request, assert hint appears in ≤3 lines. Voice flow is out of scope for E2E until the push-to-talk UI is stable.

## Test Naming

Use readable `describe` / `it` sentences — test names should read as plain English specifications:

```ts
describe('generateHint', () => {
  it('returns a refused response when the query exceeds the spoiler threshold', async () => { ... });
  it('caps the response at 3 lines regardless of LLM output length', async () => { ... });
});
```

## Mocking Rules

- Mock at the service boundary, not at the implementation detail. Mock ChromaDB, MongoDB, and Ollama clients — never mock internal helper functions.
- Use Vitest's `vi.mock()` for module-level mocks; prefer `vi.spyOn()` for asserting side effects on real objects.
- Never make real network calls in unit or integration tests — CI has no access to Ollama, MongoDB, or ChromaDB.

## Coverage

Run coverage with `vitest --coverage` (uses `@vitest/coverage-v8`). Enforce thresholds in `vitest.config.ts`:

```ts
coverage: {
  thresholds: {
    'apps/inference/src/services/**': { lines: 80, functions: 80 },
  }
}
```

Coverage is a floor, not a goal — a passing test that asserts nothing is worse than no test.
