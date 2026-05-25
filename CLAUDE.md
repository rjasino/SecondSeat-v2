# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

SecondSeat is a second-screen AI companion for gamers. The product wedge: deliver **1–3 line, spoiler-safe micro-hints** via voice or text without breaking gameplay flow. It is _not_ a walkthrough engine, not a chatbot, not a solver — it is a restrained guide.

Built for a **5-week competition sprint** (SG Tech Week product challenge, submission deadline **2026-05-31**). Solo project, spare-time only, no real customer data. LLM provider: Anthropic Claude (production) + OpenCode Zen (development) — see [docs/decisions.md](docs/decisions.md).

---

## 🚦 Mandatory Workflow — Read This First

Every non-trivial request (new feature, bug fix, refactor, schema change) follows the **5-phase gated workflow** below. Do NOT skip phases. Do NOT bundle them. Each phase ends at a hard gate that requires an explicit human signal before the next phase begins.

```
  ┌──────────┐   clarify   ┌──────────┐   approve   ┌────────┐   proceed   ┌─────────────┐   acceptance   ┌───────┐   all clear   ┌─────────┐
  │  /task   │ ──────────► │  /spec   │ ──────────► │  /log  │ ──────────► │  /implement │ ─────────────► │ /test │ ────────────► │ /commit │
  └──────────┘             └──────────┘             └────────┘             └─────────────┘                └───────┘               └─────────┘
   Clarify Q&A              Spec doc                 CHANGELOG +              Backend →                     E2E (automated)         Commit
   No code                  No code                  decisions.md             Frontend →                    + manual
                            No code                  No code                  Unit tests +                  integration &
                                                                              integration tests              acceptance
```

### Phase 1 — Clarify (`/task`)

- **Trigger:** user asks for a feature/fix/refactor without invoking a slash command, OR types `/task`.
- **Action:** ask the clarifying questions from `.claude/commands/task.md` (behavior, edge cases, dependencies, constraints, existing patterns). Summarize understanding. Ask: _"Is this correct? Should I proceed to write the spec?"_
- **Gate:** user must say yes / approve / "proceed to spec". No spec, no code yet.

### Phase 2 — Spec (`/spec`)

- **Trigger:** user confirms clarifications.
- **Action:** write the spec to `docs/specs/SPEC-<slug>.md` using the **exact template in `.claude/commands/spec.md`** (Feature/Goal/Stakeholders/User Stories with Given-When-Then/Data Requirements/Mermaid Flow Diagram/API Contract/Edge Cases/Out of Scope/Open Questions/Dependencies). Populate **Open Questions** with anything still ambiguous or assumed.
- **Output exactly:** `Spec saved to docs/specs/SPEC-<slug>.md. Please review and reply 'approved' to proceed.`
- **Gate:** user must reply `approved`. No logs, no code yet.

### Phase 3 — Log (`/log`)

- **Trigger:** user approves the spec.
- **Action:** append to `docs/CHANGELOG.md` (under `## Unreleased` — the **What**) and `docs/decisions.md` (Date/Context/Decision/Alternatives/Consequences — the **Why**).
- **Output exactly:** `Logs written to docs/CHANGELOG.md and docs/decisions.md. Reply 'proceed' to begin implementation.`
- **Gate:** user must reply `proceed`. No implementation yet.

### Phase 4 — Implement (`/implement`)

- **Trigger:** user replies `proceed`.
- **First action:** cut a fresh working branch from `main` named `<normalized git config user.name>/<task_word>` for the task being implemented. This is the agent working branch; the human creates the PR separately.
- **Order:** Backend → Frontend → Unit tests → automated integration tests. Follow `.claude/rules/coding.md`, `.claude/rules/security.md`, `.claude/rules/testing.md`.
- **Stay in scope.** If something requires a scope change, STOP and flag it — do not silently expand.
- **End-of-phase output:** files changed, tests written, deviations from spec (or "none"), then signal: `Ready for acceptance testing.`
- **Gate:** user must confirm before moving to Phase 5.

### Phase 5 — Test (`/test`)

- **Trigger:** user confirms Phase 4 is done.
- **Action:** run automated E2E tests where they exist; perform manual integration and acceptance testing against the running app.
- **End-of-phase output:** what was tested, pass/fail status, then signal: `All acceptance checks passed. Ready to commit.`
- **Gate:** user must confirm before running `/commit`. This is the final sign-off that the task is done.

### When to skip the workflow

The workflow is mandatory for anything that touches behavior, schema, contracts, or UI. Skip it only for:

- Pure questions ("what does X do?", "where is Y defined?")
- One-line typo fixes in docs/comments
- Read-only exploration

If you are unsure whether something qualifies as trivial, **default to running `/task`**.

### Signal vocabulary (what the gates listen for)

| Gate               | User says one of…                                     |
| :----------------- | :---------------------------------------------------- |
| After `/task`      | "yes", "correct", "proceed to spec", "write the spec" |
| After `/spec`      | "approved", "approve", "lgtm"                         |
| After `/log`       | "proceed", "go", "implement"                          |
| After `/implement` | any confirmation that implementation is done          |
| After `/test`      | any confirmation that acceptance checks passed        |

Anything ambiguous → ask, don't assume. A wrong-phase action (e.g. coding before the log gate) is worse than a clarifying question.

### Mechanical enforcement (the hook)

A `PreToolUse` hook (`.claude/hooks/check-workflow-gate.cjs`, registered in `.claude/settings.json`) **physically blocks** `Write`/`Edit`/`NotebookEdit` under `apps/**` unless `.claude/.workflow-gate` contains `ready-to-implement`. The file is gitignored and managed by the workflow itself:

- `/log` writes the gate at the end of Phase 3.
- `/implement` deletes the gate when it finishes, so the next task re-enters Phase 1.
- Edits to `docs/`, `.claude/`, and root config files are never blocked.

If the hook blocks you and the change is genuinely trivial (one-line fix, no spec needed), you can unblock manually for that one edit: `Set-Content .claude/.workflow-gate ready-to-implement` (PowerShell) — but log the deviation in the next `/log` run.

---

## Repository State

Monorepo with three apps scaffolded under `apps/` (web, inference, workers). Ingestion pipeline (Epics I-A/I-B/I-C) is implemented. Inference stream is not yet started.

- `docs/` — source of truth for product and architecture decisions. Read before guessing.
- `docs/specs/` — approved and draft spec documents (one per feature/task).
- `.claude/commands/` — `/task`, `/spec`, `/log`, `/implement`, `/test`, `/commit`, `/bug-triage` slash commands. The first five drive the 5-phase workflow; `/bug-triage` handles ad-hoc bug investigation; `/commit` writes clean conventional-commit messages.
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

**Watch out:** [docs/data_model.md](docs/data_model.md) is written in Laravel-style SQL migration syntax, but the SDD specifies MongoDB + Mongoose. Treat it as a logical ERD — translate to Mongoose schemas when implementing.

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
