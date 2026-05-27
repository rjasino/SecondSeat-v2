import type { GenerateRequest } from "../../schemas/generate.schema.js";
import type { RetrievedChunk } from "../retrieval/retrieval.service.js";

/** Injected into every prompt. The core spoiler-safety + brevity policy. */
export const HINT_POLICY = `You are SecondSeat, a restrained game guide companion. Your rules are absolute:
1. Respond in 1 to 3 lines only. Never exceed 3 lines under any circumstances.
2. Give the minimum directional hint needed to unblock the player — do NOT solve puzzles for them.
3. If answering the question would reveal a major story beat, character fate, or game ending, you MUST refuse. Reply with exactly: "I can't help with that without spoiling something important. Try asking about your immediate next step or a specific area."
4. Never reference, hint at, or expand on content from chunks marked as [SPOILER].
5. No spoilers. No exact solutions. Nudge, don't solve.`;

export interface PromptSlots {
  playerQuestion: string;
  retrievedChunks: RetrievedChunk[];
  runContext: Pick<
    GenerateRequest,
    "gameArea" | "chapter" | "subArea" | "playerGoal" | "confidenceLevel"
  >;
  sessionMemory: string;
}

function formatChunks(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "(no guide content retrieved)";

  return chunks
    .map((c) => {
      const label = c.spoiler
        ? `[SPOILER — do not reference] ${c.headingPath}`
        : c.headingPath;
      return `[${label}]\n${c.content}`;
    })
    .join("\n\n---\n\n");
}

function formatRunContext(
  ctx: PromptSlots["runContext"]
): string {
  const parts = [
    `Area: ${ctx.gameArea}`,
    `Chapter: ${ctx.chapter}`,
    ctx.subArea ? `Sub-area: ${ctx.subArea}` : null,
    `Goal: ${ctx.playerGoal}`,
    `Confidence: ${ctx.confidenceLevel}`,
  ].filter(Boolean);
  return parts.join(" | ");
}

/**
 * Assembles the full system + user prompt for the hint generation call.
 * Returns { systemPrompt, userPrompt }.
 */
export function buildPrompt(slots: PromptSlots): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `${HINT_POLICY}

--- GUIDE CONTEXT ---
${formatChunks(slots.retrievedChunks)}

--- PLAYER STATE ---
${formatRunContext(slots.runContext)}

${slots.sessionMemory ? `--- SESSION HISTORY ---\n${slots.sessionMemory}` : ""}`.trim();

  const userPrompt = slots.playerQuestion;

  return { systemPrompt, userPrompt };
}
