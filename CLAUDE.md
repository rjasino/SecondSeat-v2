# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

SecondSeat is a second-screen AI companion for gamers. The product wedge: deliver **1–3 line, spoiler-safe micro-hints** via voice or text without breaking gameplay flow. It is _not_ a walkthrough engine, not a chatbot, not a solver — it is a restrained guide.

Built for a **5-week competition sprint** (SG Tech Week product challenge, submission deadline **2026-06-01**). Solo project, spare-time only, no real customer data. LLM provider: Anthropic Claude (development) + OpenCode Zen (production) — see [docs/decisions.md](docs/decisions.md).

---

## 🚦 Workflow — Read This First

Every task is routed through one of three lanes based on risk and scope. **Choose the lane first, then follow only its required steps.** The slash commands still exist; their applicability is now lane-dependent.

### Lane routing table

| Lane         | Use when                                                                                       | Required steps                                                                                    |
| :----------- | :--------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| **Fast**     | Small bug fix, localized refactor, single-component change, no schema/API/cross-service impact | `/task` classify → implement → targeted tests → summary                                           |
| **Spec**     | New feature, API change, multi-file work, medium or high-risk change                           | `/task` clarify → `/spec` → **spec approval** → implement → risk-based tests                      |
| **Decision** | Architectural or irreversible choice (schema, service contract, workflow rule)                 | `/task` clarify → `/spec` → `/log` → **spec approval + gate file** → implement → risk-based tests |

```
Fast lane:
  ┌──────────┐   classify   ┌─────────────┐   targeted tests   ┌─────────┐
  │  /task   │ ───────────► │  /implement │ ─────────────────► │ /commit │
  └──────────┘              └─────────────┘                    └─────────┘

Spec lane:
  ┌──────────┐   clarify   ┌──────────┐   approved   ┌─────────────┐   risk-based tests   ┌───────┐   all clear   ┌─────────┐
  │  /task   │ ──────────► │  /spec   │ ───────────► │  /implement │ ───────────────────► │ /test │ ────────────► │ /commit │
  └──────────┘             └──────────┘              └─────────────┘                      └───────┘               └─────────┘

Decision lane:
  ┌──────────┐   clarify   ┌──────────┐   approved   ┌────────┐   proceed   ┌─────────────┐   risk-based tests   ┌───────┐   all clear   ┌─────────┐
  │  /task   │ ──────────► │  /spec   │ ───────────► │  /log  │ ──────────► │  /implement │ ───────────────────► │ /test │ ────────────► │ /commit │
  └──────────┘             └──────────┘              └────────┘             └─────────────┘                      └───────┘               └─────────┘
```

### Fast lane

- **Trigger:** task is small, localized, and self-contained — no schema changes, no new API endpoints, no cross-service impact.
- **Action:** state the lane, briefly summarize the change, ask "Ready to implement?" then implement with targeted tests.
- **No `/spec`, no `/log` required.** Write a concise end-of-task summary instead.
- **If scope expands mid-implementation**, STOP and re-classify to the spec or decision lane before continuing.

### Spec lane

- **`/task`:** ask clarifying questions (behavior, edge cases, dependencies, constraints, existing patterns). Summarize and ask: _"Is this correct? Should I proceed to write the spec?"_
- **`/spec`:** write spec to `docs/specs/<YYYY-MM-DD>-SPEC-<slug>.md`. Output: `Spec saved to docs/specs/SPEC-<slug>.md. Please review and reply 'approved' to proceed.`
- **Gate:** user replies `approved` → move to `/implement`. One gate only. No `/log` required unless the spec surfaces a notable product or architecture decision.
- **`/implement`:** cut branch, implement, risk-based tests. Output: `Ready for acceptance testing.`
- **`/test`:** risk-based (see Testing section below).

### Decision lane

Same as spec lane, with `/log` inserted between `/spec` approval and `/implement`:

- **`/log`:** append to `docs/CHANGELOG.md` and `docs/decisions.md`, write `.claude/.workflow-gate`. Output: `Logs written to docs/CHANGELOG.md and docs/decisions.md. Gate opened. Reply 'proceed' to begin implementation.`
- **Gate:** user replies `proceed` → `/implement`.

### When to skip the workflow entirely

Skip all lanes (go straight to the change) only for:

- Pure questions ("what does X do?", "where is Y defined?")
- One-line typo fixes in docs or comments
- Read-only exploration

If you are unsure which lane applies, **default to spec lane**.

### Signal vocabulary

| Gate                               | User says one of…                                     |
| :--------------------------------- | :---------------------------------------------------- |
| After `/task` (fast lane)          | "yes", "ready", "go", "implement"                     |
| After `/task` (spec/decision lane) | "yes", "correct", "proceed to spec", "write the spec" |
| After `/spec`                      | "approved", "approve", "lgtm"                         |
| After `/log`                       | "proceed", "go", "implement"                          |
| After `/implement`                 | any confirmation that implementation is done          |
| After `/test`                      | any confirmation that acceptance checks passed        |

### Testing (risk-based)

Default for all lanes: **targeted automated tests** (unit and/or integration) for the changed code.

Require manual acceptance and/or E2E only when:

- The change affects a player-facing UI flow
- The change crosses service boundaries (web ↔ inference ↔ workers)
- The affected code path already has E2E coverage that would regress

If no E2E coverage exists for a new flow, note it explicitly but do not block the commit on it.

### Mechanical enforcement (the hook)

A `PreToolUse` hook (`.claude/hooks/check-workflow-gate.cjs`, registered in `.claude/settings.json`) **physically blocks** `Write`/`Edit`/`NotebookEdit` on the two highest-risk surfaces unless `.claude/.workflow-gate` contains `ready-to-implement`:

- `apps/inference/src/` — LLM/RAG prompt policy (trust-critical path)
- `packages/db/src/` — Mongoose schema changes

All other paths (including other `apps/**`) are unblocked and do not require the gate. Fast-lane tasks on web components and workers proceed without any gate write.

The gate file is managed by the workflow:

- `/log` writes it (decision lane).
- `/implement` deletes it when finished, so the next task re-enters the routing step cleanly.
- Edits to `docs/`, `.claude/`, and root config files are never blocked.

To unblock manually for a genuine one-off: `Set-Content .claude/.workflow-gate ready-to-implement` (PowerShell) — note the deviation in the next `/log` run.

---

## Repository State

Monorepo with three apps under `apps/` (web, inference, workers) and shared libraries under `packages/`. Ingestion pipeline is implemented. Inference stream is not yet started.

- `apps/web/` — Next.js player-facing UI
- `apps/inference/` — Express LLM/RAG hot path (prompt policy, streaming, spoiler enforcement)
- `apps/workers/` — BullMQ ingestion and embedding workers
- `packages/db/` — Mongoose schemas and shared DB client (protected path — decision lane required)
- `packages/**/` — shared TypeScript types, utilities, constants, embedding functions, etc.
- `docs/` — source of truth for product and architecture decisions. Read before guessing.
- `docs/specs/` — approved and draft spec documents (one per feature/task).
- `.claude/commands/` — `/task`, `/spec`, `/log`, `/implement`, `/test`, `/commit`, `/bug-triage` slash commands. The first three drive the 3-lane workflow routing; `/implement` and `/test` close each lane; `/bug-triage` handles ad-hoc investigation; `/commit` writes conventional-commit messages.
- `.claude/rules/` — coding, security, and testing standards.

## Source-of-Truth Documents

| Question is about…                                                     | Read                                                                      |
| :--------------------------------------------------------------------- | :------------------------------------------------------------------------ |
| Product scope, personas, MVP boundaries, monetization                  | [docs/prd.md](docs/prd.md)                                                |
| Tech stack, system architecture, API surface, folder layout, data flow | [docs/sdd.md](docs/sdd.md)                                                |
| Entities, fields, relationships                                        | [docs/data_model.md](docs/data_model.md)                                  |
| Pitch narrative, positioning                                           | [docs/pitch/](docs/pitch/) (prefer `reference-` files over `deprecated-`) |
| What decisions were made and why                                       | [docs/decisions.md](docs/decisions.md)                                    |
| What has shipped                                                       | [docs/CHANGELOG.md](docs/CHANGELOG.md)                                    |
| Per-feature specs                                                      | [docs/specs/](docs/specs/)                                                |

[docs/data_model.md](docs/data_model.md) uses MongoDB collection/schema notation aligned to Mongoose. Use it directly when implementing models under `packages/db/src/`.

## Architecture

Three Node.js processes, unified TypeScript stack. See [docs/sdd.md §6](docs/sdd.md) for the full diagram and folder layout.

**Why three processes:**

- Next.js stays non-blocking — ingestion is offloaded to BullMQ workers, inference to Express.
- Express owns the LLM/RAG hot path so streaming (SSE), prompt policy, and retrieval can evolve independently of the UI.
- Workers are CPU-bound (embedding) and benefit from being scalable separately.

## Hard Product Constraints

These are decided — not negotiable without explicit user signoff:

- **Hint length cap:** 1–3 lines. Enforce at the prompt-policy layer in LlamaIndex.TS, not just in the UI.
- **Default mode:** _vague nudge_ — minimum directional hint. **No exact-answer mode in MVP.**
- **Wake phrase:** `"Hey SS"` — opens voice input window; stops on VAD silence or timeout.
- **Spoiler discipline > completeness.** When in doubt, refuse with a reason (`hint_responses.refused = true`, `refusal_reason` populated) rather than over-explaining.
- **Session memory is lightweight** — per-session context only, not cross-session user modeling.
- **MVP scope:** one game, one area. Do not generalize to multi-game until validated.

## Domain Vocabulary

- **Run context** — where the player currently is (`game_area`, `chapter`, `sub_area`) plus their `player_goal` (progression/exploration/confirmation/completion) and `confidence_level` (confident/uncertain/stuck).
- **Hint request / hint response** — the ask/answer log. Responses carry `line_count` and `refused`/`refusal_reason` for spoiler blocks.
- **RAG source → RAG document → vector** — pipeline stages: a source (file/url/text) is chunked into documents, each gets a `vector_id` in ChromaDB.
- **Ingestion job** — BullMQ job tracked in `rag_ingestion_jobs` with `progress`, `total_chunks`, `processed_chunks`.
- **Hint philosophy** — a user preference (`minimal` / `directional` / `confirm_only` / `explicit_opt_in`) stored on the profile, separate from the global "vague nudge" default.

## Rules

Read the relevant file before writing code in that area:

- [`.claude/rules/coding.md`](.claude/rules/coding.md) — TypeScript standards for Next.js, Express, and BullMQ workers
- [`.claude/rules/security.md`](.claude/rules/security.md) — secrets handling, backend hardening (`argon2`, `helmet`, rate-limiting), frontend auth (`iron-session`, `httpOnly` cookies)
- [`.claude/rules/testing.md`](.claude/rules/testing.md) — Vitest + Supertest + Playwright stack, file conventions, mocking rules, coverage targets

## Claude Code Skills

- `/frontend-design` — use when building player-facing UI. Bias toward **dark mode**, high-contrast hint overlays, and minimal interaction overhead. UI should _disappear_ when not needed.
