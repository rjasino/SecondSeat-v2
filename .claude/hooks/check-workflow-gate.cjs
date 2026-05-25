#!/usr/bin/env node
// PreToolUse hook for Write/Edit/NotebookEdit.
// Blocks edits under apps/** unless .claude/.workflow-gate contains "ready-to-implement".
// The /log command writes the gate; /implement deletes it when done.
// See CLAUDE.md "Mandatory Workflow" for the 4-phase flow this enforces.

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = process.cwd();
const GATE_FILE = path.join(PROJECT_ROOT, ".claude", ".workflow-gate");
const GATE_VALUE = "ready-to-implement";
const PROTECTED_PREFIX = path.join(PROJECT_ROOT, "apps") + path.sep;

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
  if (!abs.startsWith(PROTECTED_PREFIX)) return allow();

  let gate = "";
  try {
    gate = fs.readFileSync(GATE_FILE, "utf8").trim();
  } catch {
    /* missing */
  }
  if (gate === GATE_VALUE) return allow();

  return deny(
    `Workflow gate not passed for edits under apps/**.\n` +
      `Run /task → /spec → /log before /implement. The /log command writes ` +
      `.claude/.workflow-gate; /implement removes it when finished.\n` +
      `Blocked path: ${path.relative(PROJECT_ROOT, abs)}`,
  );
});
