---
name: log
description: Write CHANGELOG.md and decisions.md — decision lane only
---

> **Lane check:** This command applies to **decision lane** tasks only (architectural or irreversible choices — schema, service contracts, workflow rules). Spec-lane and fast-lane tasks skip `/log`.

The spec has been approved. Before writing any code, update two project files:

**1. docs/CHANGELOG.md**
Append a new entry under an `## Unreleased` section (create it if it doesn't exist) describing what will change. Be specific: list files added/modified, endpoints added, schema changes, etc.

**2. docs/decisions.md**
Append a new entry with:

- **Date:** today's date
- **Context:** why this change is needed
- **Decision:** what was decided
- **Alternatives considered:** what else was evaluated
- **Consequences:** trade-offs or follow-up work

After writing both files, write the workflow gate file so the implementation phase can unlock edits under `apps/inference/src/` and `packages/db/src/`:

```
.claude/.workflow-gate   ← contents: ready-to-implement
```

Use the Write tool to create this file with the single line `ready-to-implement` (no surrounding whitespace beyond a trailing newline).

Then output exactly:
`Logs written to docs/CHANGELOG.md and docs/decisions.md. Gate opened. Reply 'proceed' to begin implementation.`

Do NOT write any implementation code yet.
