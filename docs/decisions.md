# Decisions

Architecture and product decisions for SecondSeat, in reverse chronological order. Each entry captures the **context** (why), the **decision** (what), the **alternatives** weighed, and the **consequences** (trade-offs / follow-ups).

---

## 2026-05-28 — OpenCode Zen Responses API + Configurable LLM Model

**Context**
Hint generation was 100% broken: `OpenCodeZenAdapter` called `client.chat.completions.create(...)` against a `OPENCODE_ZEN_BASE_URL` that pointed at `https://opencode.ai/zen/v1/responses`. The OpenAI SDK appends `/chat/completions` to the base URL, producing a request to `https://opencode.ai/zen/v1/responses/chat/completions` — a 404 served by the opencode.ai marketing site, not the API. Investigation of the OpenCode Zen catalog revealed two API surfaces (`/zen/v1/chat/completions` for open models, `/zen/v1/responses` for OpenAI Responses-API models including the entire Claude / GPT / Gemini lineup). The strongest spoiler-discipline option for SecondSeat's 1–3 line hint workload is Claude Haiku 4.5, which lives on the Responses surface. The adapter and `AnthropicAdapter` also both hardcoded their model ids, blocking sprint-time A/B testing without a code edit.

**Decision**

- **Switch `OpenCodeZenAdapter` to the OpenCode Zen Responses API.** Use `client.responses.create({ stream: true })` from `openai@4.104.0` (verified against installed `node_modules`). Map `systemPrompt → instructions` and `userPrompt → input`. Yield text on `response.output_text.delta` events; ignore all other event types. Preserve the existing `LlmAdapter` `AsyncIterable<string>` contract so the route layer, `AnthropicAdapter`, and prompt assembler do not change.
- **Default OpenCode Zen model is `opencode/claude-haiku-4-5`.** Best spoiler-discipline-per-dollar for the wedge: ~$2.75 per 1000 hints at typical 1.5K-in / 256-out usage. Strong Anthropic-trained instruction following aligns with the "spoiler discipline > completeness" hard constraint in CLAUDE.md.
- **Model is env-driven on both adapters.** Required env vars `OPENCODE_ZEN_MODEL` and `ANTHROPIC_MODEL` are added to `config.ts` via the existing `requireEnv` pattern (fail-fast). `AnthropicAdapter`'s hardcoded `claude-sonnet-4-6` constant is replaced with the new env value; `.env.example` keeps `claude-sonnet-4-6` as the documented default so existing Anthropic-path behavior is preserved.
- **Fix `OPENCODE_ZEN_BASE_URL` to terminate at `/zen/v1`.** The SDK appends the route suffix; the previous value double-pathed `/responses`. `.env.example` is updated; the owner manually updates `.env.local` post-merge (secrets are not edited by code).
- **Error mapping stays generic.** Adapter continues to wrap upstream errors in `LlmError("OpenCode Zen stream failed", err)`. Typed error mapping (model-not-found, quota, etc.) is deferred — not in the wedge's critical path.

**Alternatives considered**

- **Path A — Keep Chat Completions, point at a chat-completions-capable model (MiniMax, Kimi, GLM, DeepSeek Free).** Smallest possible change (env-only plus a model-id constant) and includes zero-cost free-tier options. Rejected as the default because spoiler-discipline quality on those models is unverified for the hint use case, and the trust-critical path warrants the better instruction-follower for the demo. Path A remains available by env switch — if a sprint A/B prefers it, only `.env.local` changes.
- **GPT-5 Nano on the Responses API.** Extreme value (~$0.18 per 1000 hints, ~15× cheaper than Haiku). Rejected as default because spoiler-refusal behavior on edge cases is less reliable than Haiku in our use case. Easy to A/B via the new `OPENCODE_ZEN_MODEL` env var without code change.
- **Broaden `LlmAdapter` to a structured event interface.** Would expose richer signals (e.g. tool-call deltas, refusal markers) to the route layer. Rejected — larger blast radius, no downstream consumer needs it today, and translating to plain text inside the adapter keeps `AnthropicAdapter` unchanged.
- **Refine error mapping in this task.** Rejected — out of the demo critical path, costs implementation time, and the current generic `LlmError` is sufficient for surfacing 4xx upstream to logs.
- **Reconcile `docs/data_model.md` ↔ `packages/db` schemas as part of this work.** Rejected and explicitly deferred — documentation drift is not blocking the demo, and the reconcile decision is a separate decision-lane task already captured in the post-MVP section of this file (2026-05-28 entry above).

**Consequences**

- Hint generation is unblocked under `LLM_PROVIDER=opencode_zen` once the owner updates `.env.local`. The 404 disappears.
- Two new required env vars per provider (`OPENCODE_ZEN_MODEL`, `ANTHROPIC_MODEL`). The service will fail fast at startup if either is missing — consistent with the existing `requireEnv` style and acceptable in a solo sprint context.
- Sprint-time model A/B between `claude-haiku-4-5`, `gpt-5-nano`, etc. is now `.env.local`-only — no code or branch needed.
- The exact OpenCode Zen model-id format (`opencode/<id>` vs `<id>`) is unconfirmed at write time. If OpenCode rejects the default value at runtime, the fix is a single `.env.local` edit; no code change. Verification deferred to the post-merge smoke test.
- Future follow-up: typed error mapping for upstream 4xx (model-not-found, quota), and a richer adapter event surface if/when refusal markers or tool-call deltas become useful. Both are explicit non-goals here and tracked nowhere yet — capture in a later decisions entry if/when they become relevant.

---

## 2026-05-27 — Workflow Calibration: 3-Lane Workflow

**Context**
The existing 5-phase gated workflow (task → spec → log → implement → test) was designed for discipline and traceability but proved too heavy for a solo sprint repo. Token consumption was hitting ~70% of context window on most tasks before any code was written. Code quality, bugs, and missing implementations were increasing rather than decreasing — indicating the overhead was reducing effective implementation time without improving outcomes. The mandatory `/log` step before every implementation was writing documentation before the solution was validated. The universal `/test` phase required E2E and manual acceptance on every change regardless of scope. The hook enforced gate checks across all of `apps/**` including low-risk web components. The workflow needed to be calibrated to match the risk profile of individual tasks, not treat all tasks as equally high-stakes.

**Decision**

- **Replace universal 5-phase flow with 3-lane routing.** Tasks are classified as fast (low-risk, localized), spec (medium/high-risk), or decision (architectural or irreversible). Each lane gets only the ceremony it actually needs. The `/task`, `/spec`, `/log`, `/implement`, `/test`, and `/commit` commands stay available; their scope is reinterpreted, not replaced.
- **Fast lane skips `/spec` and `/log`.** Small bug fixes, localized refactors, and single-component changes go directly to implementation with targeted tests and a concise summary. No spec document, no CHANGELOG update required.
- **Spec lane: one approval gate only.** Clarify → write a short spec → single approval → implement → risk-based tests. No mandatory log step unless the spec surfaces a notable product or architecture decision.
- **Decision lane: spec + decision log + one approval gate.** Reserved for architectural or irreversible choices (e.g. data model changes, new service contracts, workflow rules like this one). Both `docs/decisions.md` and `docs/CHANGELOG.md` are written before implementation.
- **Testing is risk-based by default.** Targeted automated tests (unit/integration) are the default for all lanes. Manual acceptance and E2E are only required when the affected surface is a UI flow, cross-service interaction, or otherwise high-risk. The `/test` command documents the testing approach taken and its rationale.
- **`/log` made optional.** CHANGELOG and decisions log entries are only written when the change is notable enough to warrant documentation — not as a universal prerequisite for coding.
- **Hook scope narrowed to two high-risk prefixes.** The `PreToolUse` hook now protects only `apps/inference/src/` (LLM/RAG prompt policy, the trust-critical path) and `packages/db/src/` (Mongoose schema changes). All other `apps/**` edits are unblocked, letting fast-lane tasks on web components and workers proceed without a gate file.

**Alternatives considered**

- **Keep the 5-phase workflow, just speed up each phase.** Rejected — the problem is not speed within phases, it is that low-risk tasks should not pass through all five phases. Shortening phase durations does not eliminate the structural overhead.
- **Remove all mechanical enforcement and rely on instructions only.** Rejected — the LLM/RAG path and schema changes are high enough risk that a hard block is still warranted. Removing all enforcement trades a small friction reduction for a meaningful regression risk.
- **Introduce new command names (fast-fix, quick-spec, etc.).** Rejected — the existing slash commands are already understood by the repo maintainer. Reinterpreting them under the new lanes preserves familiarity and avoids breaking any references in existing specs or docs.
- **Lane-aware gate (write a `fast-lane` gate value for low-risk tasks).** Considered — would keep a uniform gate mechanism. Rejected in favour of Option A (narrowed scope) because the added complexity of a second gate value adds overhead without meaningful additional protection; the fast-lane tasks that now bypass the gate are almost entirely web UI components, not the trust-critical path.

**Consequences**

- `CLAUDE.md` must be updated to reflect the new routing table and lane definitions. The old 5-phase diagram and signal vocabulary table must be replaced.
- All five command files must be updated to remove mandatory ceremony that does not apply to their lane.
- `check-workflow-gate.cjs` must be updated to check two protected prefixes instead of one. The gate logic otherwise stays the same.
- Fast-lane tasks will not produce spec documents or changelog entries. If a fast-lane task turns out to have wider impact than anticipated, the agent must stop, flag the scope change, and re-enter the spec lane before continuing.
- Teams or contributors accustomed to the old workflow will need to read the updated `CLAUDE.md` to understand the new routing rules. No toolchain changes are required.

---

## 2026-05-28 — Post MVP Task

**Document Drift to Code**
Reconcile data_model.md with packages/db (decision lane). Includes: rename User.password → passwordHash, decide on uiSettings and contextEvents scope, choose embed-vs-reference for RunContext/hint logs.

---
