#!/usr/bin/env node
// PreToolUse hook for Write/Edit/NotebookEdit.
// Blocks edits under apps/inference/src/ (LLM/RAG trust-critical path) and
// packages/db/src/ (schema changes) unless .claude/.workflow-gate contains
// "ready-to-implement". All other paths are unblocked.
//
// Gate lifecycle (decision lane only):
//   /log writes the gate → /implement deletes it when finished.
// Fast-lane and spec-lane tasks never touch these protected paths.
// See CLAUDE.md "Workflow" for the 3-lane routing model.

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = process.cwd();
const GATE_FILE = path.join(PROJECT_ROOT, ".claude", ".workflow-gate");
const GATE_VALUE = "ready-to-implement";

const PROTECTED_PREFIXES = [
  path.join(PROJECT_ROOT, "apps", "inference", "src") + path.sep,
  path.join(PROJECT_ROOT, "packages", "db", "src") + path.sep,
];

function allow() {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
      },
    }),
  );
  process.exit(0);
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

let raw = "";
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    return allow();
  }

  const filePath =
    payload?.tool_input?.file_path || payload?.tool_input?.notebook_path || "";
  if (!filePath) return allow();

  const abs = path.resolve(PROJECT_ROOT, filePath);
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    abs.startsWith(prefix),
  );
  if (!isProtected) return allow();

  let gate = "";
  try {
    gate = fs.readFileSync(GATE_FILE, "utf8").trim();
  } catch {
    /* missing */
  }
  if (gate === GATE_VALUE) return allow();

  const rel = path.relative(PROJECT_ROOT, abs);
  const which = abs.includes(path.join("apps", "inference", "src"))
    ? "apps/inference/src/ (LLM/RAG trust-critical path)"
    : "packages/db/src/ (schema changes)";

  return deny(
    `Workflow gate not passed for edits under ${which}.\n` +
      `This path requires the decision lane: /task → /spec → /log before /implement.\n` +
      `The /log command writes .claude/.workflow-gate; /implement removes it when finished.\n` +
      `Blocked path: ${rel}`,
  );
});
