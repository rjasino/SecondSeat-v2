---
name: commit
description: Stage changes and write a clean conventional-commit message
---

Prepare and execute a git commit. Work through these steps in order.

## Step 1 — Inspect working tree

Run `git status` and `git diff` (both staged and unstaged) to understand what has changed. Do not assume — read the actual diff.

## Step 2 — Determine what to stage

If there are unstaged changes, ask the user which files to include. Default to staging only files directly related to the current task. Never stage:

- `.env` or any file containing secrets
- Generated build artefacts (`dist/`, `.next/`, `node_modules/`)
- The workflow gate file (`.claude/.workflow-gate`)

## Step 3 — Draft the commit message

Use **Conventional Commits** format:

```
<type>(<scope>): <subject>

[optional body — only if the subject line alone is insufficient]
```

**Type** — pick one:

| Type       | Use when                                     |
| ---------- | -------------------------------------------- |
| `feat`     | A new feature or capability visible to users |
| `fix`      | A bug fix                                    |
| `refactor` | Code restructured without behaviour change   |
| `chore`    | Tooling, config, dependency updates          |
| `test`     | Adding or fixing tests only                  |
| `docs`     | Documentation only                           |
| `perf`     | Performance improvement                      |

**Scope** — the app or module affected, e.g. `web`, `inference`, `workers`, `ingestion`, `auth`, `hint-engine`.

**Subject rules:**

- Imperative mood, present tense: "add", "fix", "remove" — not "added" or "fixes"
- No capital letter at the start
- No period at the end
- Max 72 characters on the subject line

**Body** (include only when needed):

- Explain _why_, not _what_ — the diff already shows what changed
- Wrap at 72 characters
- Separate from subject with a blank line

## Step 4 — Show and confirm

Present the full proposed commit message to the user before running any git command. Ask: "Does this look right? Reply 'yes' to commit."

## Step 5 — Commit

Once the user confirms, run:

```
git add <files>
git commit -m "<message>"
```

Use a heredoc to pass multi-line messages to avoid shell escaping issues.

After the commit succeeds, output the commit hash and subject line.
