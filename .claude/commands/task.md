---
name: task
description: Start a new task — classify lane, then clarify or implement
---

A new task has been described. Before writing any spec or code, **classify it into a lane**:

| Lane         | Criteria                                                                              |
| :----------- | :------------------------------------------------------------------------------------ |
| **Fast**     | Small localized fix or refactor, single component, no schema/API/cross-service impact |
| **Spec**     | New feature, API change, multi-file work, medium or high-risk change                  |
| **Decision** | Architectural or irreversible choice — schema, service contract, workflow rule        |

---

## If Fast lane

State the lane, briefly summarize what will change, and ask:
_"Ready to implement?"_

Do NOT write a spec or log. Proceed directly to implementation once confirmed.

**If scope expands mid-implementation** (schema impact, API contract change, cross-service effect discovered), STOP, re-classify to spec or decision lane, and surface it to the user before continuing.

---

## If Spec or Decision lane

Ask clarifying questions before writing anything:

1. What is the exact expected behavior or outcome?
2. What are the edge cases or failure scenarios?
3. Are there dependencies on other features or services?
4. Any constraints (performance, security, DB schema impact)?
5. Is there an existing pattern in the codebase to follow?

After the user answers, summarize your understanding and ask:
_"Is this correct? Should I proceed to write the spec?"_

Do NOT write any spec or code yet.
