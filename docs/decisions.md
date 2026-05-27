# Decisions

Architecture and product decisions for SecondSeat, in reverse chronological order. Each entry captures the **context** (why), the **decision** (what), the **alternatives** weighed, and the **consequences** (trade-offs / follow-ups).

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
