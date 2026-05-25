---
name: bug-triage
description: Investigate a reported bug — reproduce, locate, assess blast radius, propose fix
---

A bug has been reported. Do NOT write any fix yet. Work through these phases in order and present findings before asking whether to proceed.

## Phase 1 — Reproduce

Ask the user (or derive from context) the minimum needed to reproduce the bug:

1. What is the observed behaviour?
2. What is the expected behaviour?
3. What are the exact steps to reproduce it (input, environment, sequence)?
4. Is it consistent or intermittent? Any error messages or stack traces?

If the user has already provided these, skip to Phase 2.

## Phase 2 — Locate

Search the codebase to find the site of the fault. Work top-down:

1. Identify the entry point (route, component, job processor, or event handler) closest to the reported symptom.
2. Trace the call chain — route → controller → service → model/external client — until you find where the behaviour diverges from the expectation.
3. Quote the specific file path and line number(s) where the bug lives.
4. State your confidence: is this the root cause, or a symptom of something deeper?

## Phase 3 — Assess Blast Radius

Before proposing any fix, answer:

- What other features, routes, or jobs call the same code path?
- Could the fix break any of them?
- Is there test coverage for the affected code? If yes, which tests would catch a regression?
- Is this a data integrity issue (records already corrupted)? If so, flag it explicitly — a migration or backfill may be needed in addition to the code fix.

## Phase 4 — Propose Fix

Write out the minimal fix in plain language (not code yet):

- What exactly changes and why?
- Is it a one-liner or does it require touching multiple files?
- Any edge cases the fix introduces?
- Should this go through the full `/task → /spec → /log → /implement` workflow, or is it small enough to treat as a one-line patch?

Then ask: "Does this diagnosis look correct? Should I implement the fix?"

Do NOT edit any source files until the user confirms.
