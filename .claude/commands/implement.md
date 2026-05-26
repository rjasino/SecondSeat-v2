---
name: implement
description: Begin implementation after spec is approved and logs are written
---

Logs have been confirmed. Implement the approved spec in this order:

1. **Update `main`, then create the working branch.** Pull the latest remote `main` branch first, then cut a fresh branch from that updated `main` for the current task before making implementation changes. Name it `<author_name>/<task_word>`.
   - Refresh local `main` from the remote before branching so the task starts from the current upstream tip
   - Read `author_name` from `git config user.name`
   - Normalize it for branch names (lowercase; replace spaces and other unsafe characters with `-`)
   - Derive `task_word` from the approved task/spec as one concise lowercase word
   - This branch is the agent's working branch for the current task; the human will handle the PR separately
2. **Backend** — services, models, routes, controllers
3. **Frontend** — components, pages, state
4. **Unit tests** — co-located `*.test.ts` files per the testing rules in `.claude/rules/testing.md`

Rules that always apply:

- Follow `.claude/rules/coding.md` for TypeScript standards
- Follow `.claude/rules/security.md` for secrets, auth, and input validation
- Follow `.claude/rules/testing.md` for test structure and mocking rules
- Stay within the scope defined in the approved spec — if something requires a scope change, STOP and flag it before continuing
- Base the branch on `main`, not the current branch tip
- If the target branch name already exists and is not clearly reusable for the same task, STOP and ask the user before proceeding

When implementation is complete:

1. **Close the workflow gate.** Delete `.claude/.workflow-gate` so the next task starts clean and re-enters the 4-phase flow (the PreToolUse hook re-blocks `apps/**` edits as soon as the file is gone). On Windows: `Remove-Item .claude/.workflow-gate -ErrorAction SilentlyContinue`. Cross-platform via Bash: `rm -f .claude/.workflow-gate`.

2. Output a summary with:
   - Files created or modified
   - Tests written (file paths and what they cover)
   - Any deviations from the spec (if none, say so explicitly)
   - Signal: `Ready for acceptance testing.`
