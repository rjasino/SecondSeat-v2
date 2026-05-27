---
name: test
description: Risk-based acceptance phase — run tests proportional to what changed
---

Implementation is complete. Run tests proportional to the lane and the affected surface:

### 1. Automated tests (always required)

Run the relevant unit and integration tests for the changed code:

```
npm run test --workspace=<affected-app>
```

Report which test files ran, how many passed/failed, and any coverage gaps in the changed service paths.

### 2. E2E tests (required only when warranted)

Run Playwright E2E tests if **any** of the following apply:

- The change affects a player-facing UI flow
- The change touches a path that already has `apps/web/e2e/*.spec.ts` coverage
- The change crosses service boundaries (web ↔ inference ↔ workers)

If none of these apply, note that explicitly — the phase is still satisfied.

### 3. Manual acceptance (required only when warranted)

Perform manual integration and acceptance testing if **any** of the following apply:

- The change is cross-service or schema-touching
- The automated tests cover less than 80% of the changed service path
- The feature has a meaningful UX flow with no existing E2E coverage

Walk through the relevant user stories from the spec (or task summary for fast-lane tasks), verifying each acceptance criterion. Confirm auth enforcement, error handling, and documented edge cases.

### Rules

- Do NOT add new code here — if a test reveals a defect, go back to `/implement` for the fix, then re-run `/test`.
- Document every test run result (pass / fail / skipped) in your output.
- A skipped automated test must have a reason noted.
- Surfaced follow-up items: flag them, do NOT fix them here — raise a new `/task`.

When checks pass, output a summary with:

- What was tested (automated, E2E, manual) and why each was included or skipped
- Pass / fail status per item
- Any follow-up items surfaced
- Signal: `All acceptance checks passed. Ready to commit.`
