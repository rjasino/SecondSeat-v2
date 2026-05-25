---
name: test
description: Required acceptance phase — automated E2E checks plus manual integration and acceptance testing before commit
---

Implementation is complete. Before committing, run the full acceptance suite:

1. **Automated E2E tests** (where available)
   - Run Playwright tests under `apps/web/e2e/*.spec.ts` for any affected player-facing flows.
   - If no E2E coverage exists yet for this feature, note that explicitly — the phase is still required.

2. **Manual integration testing**
   - Start all affected services locally (`npm run dev:web`, `dev:inference`, `dev:workers` as needed).
   - Walk through the user stories from the approved spec end-to-end, verifying each acceptance criterion.
   - Confirm auth enforcement, error handling, and edge cases described in the spec behave correctly.

3. **Manual acceptance testing**
   - Confirm the feature meets the stated Goal in the spec from the user's perspective.
   - Confirm no regressions in adjacent flows (e.g. if ingestion was touched, check that existing sources still display and delete correctly).

Rules that always apply during this phase:

- Do NOT add new code here — if a test reveals a defect, go back to `/implement` for the fix, then re-run `/test`.
- Document every test run result (pass / fail / skipped) in your output.
- A skipped automated test must have a reason noted (e.g. "E2E not yet written for this flow").

When all checks pass, output a summary with:

- What was tested (E2E, manual flows, edge cases)
- Pass / fail status per item
- Any follow-up items surfaced (do NOT fix them here — flag for a new `/task`)
- Signal: `All acceptance checks passed. Ready to commit.`
