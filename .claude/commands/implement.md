---
name: implement
description: Begin implementation after any required pre-implementation steps are complete
---

Pre-implementation steps are complete. Implement in this order:

1. **Create the working branch.**
   - For **spec and decision lane** tasks: pull latest `main` first, then cut a branch from it. For **fast lane** tasks: cut a branch from the current `main` tip.
   - Name: `<author_name>/<task_word>` — read `author_name` from `git config user.name`, normalize (lowercase, spaces → `-`), derive `task_word` from the task as one concise lowercase word.
   - This is the agent's working branch; the human creates the PR separately.
   - If the target branch already exists and is not clearly reusable for the same task, STOP and ask before proceeding.

2. **Backend** — services, models, routes, controllers
3. **Frontend** — components, pages, state
4. **Tests** — see Testing section below

Rules that always apply:

- Follow `.claude/rules/coding.md` for TypeScript standards
- Follow `.claude/rules/security.md` for secrets, auth, and input validation
- Follow `.claude/rules/testing.md` for test structure and mocking rules
- Stay within the scope defined in the task or approved spec — if something requires a scope change, STOP and flag it before continuing

### Testing requirements by lane

| Lane         | Required tests                                                                                                                                  |
| :----------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fast**     | Targeted unit or integration tests for the changed code only                                                                                    |
| **Spec**     | Unit + integration tests for all changed services and routes; E2E only if the change affects a player-facing UI flow or an already-covered path |
| **Decision** | Same as spec lane; manual acceptance if cross-service or schema-touching                                                                        |

### Gate management

- **Fast and spec lanes:** no gate file is written. The hook will block any edit to `apps/inference/src/` or `packages/db/src/` — these paths require the decision lane. If a fast or spec-lane task discovers it needs to touch either path, STOP and re-classify to decision lane before continuing.
- **Decision lane:** the gate was opened by `/log`. After implementation is complete, delete it: `Remove-Item .claude/.workflow-gate -ErrorAction SilentlyContinue` (Windows) or `rm -f .claude/.workflow-gate` (cross-platform).

When implementation is complete, output a summary with:

- Files created or modified
- Tests written (file paths and what they cover)
- Any deviations from the spec or task (if none, say so explicitly)
- Signal: `Ready for acceptance testing.`
