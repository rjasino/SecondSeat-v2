import type {
  HintPhilosophy,
  PlayerGoal,
  SpoilerTolerance,
} from "@secondseat/db";
import type { GenerateRequest } from "../../schemas/generate.schema.js";
import type { RetrievedChunk } from "../retrieval/retrieval.service.js";

/** Injected into every prompt. The core spoiler-safety + brevity policy. */
export const HINT_POLICY = `You are SecondSeat, a restrained game guide companion. Your rules are absolute:
1. Respond in 1 to 3 lines only. Never exceed 3 lines under any circumstances.
2. Give the minimum directional hint needed to unblock the player — do NOT solve puzzles for them.
3. If answering the question would reveal a major story beat, character fate, or game ending, you MUST refuse. Reply with exactly: "I can't help with that without spoiling something important. Try asking about your immediate next step or a specific area."
4. Never reference, hint at, or expand on content from chunks marked as [SPOILER].
5. No spoilers. No exact solutions. Nudge, don't solve.`;

/** Subset of Profile fields the prompt assembler reads. */
export interface PromptProfile {
  hintPhilosophy: HintPhilosophy;
  spoilerTolerance: SpoilerTolerance;
}

/** Subset of Preferences fields the prompt assembler reads. */
export interface PromptPreferences {
  maxHintLines: number;
}

/** Subset of Game fields the prompt assembler reads. */
export interface PromptGame {
  title: string;
}

export interface PromptSlots {
  playerQuestion: string;
  retrievedChunks: RetrievedChunk[];
  runContext: Pick<
    GenerateRequest,
    "gameArea" | "chapter" | "subArea" | "playerGoal" | "confidenceLevel"
  >;
  game: PromptGame;
  profile: PromptProfile;
  preferences: PromptPreferences;
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

function formatRunContext(ctx: PromptSlots["runContext"]): string {
  const parts = [
    `Area: ${ctx.gameArea}`,
    `Chapter: ${ctx.chapter}`,
    ctx.subArea ? `Sub-area: ${ctx.subArea}` : null,
    `Goal: ${ctx.playerGoal}`,
    `Confidence: ${ctx.confidenceLevel}`,
  ].filter(Boolean);
  return parts.join(" | ");
}

/** Maps `hintPhilosophy` to a single-line directive injected into the prompt. */
export function hintPhilosophyDirective(value: HintPhilosophy): string | null {
  switch (value) {
    case "minimal":
      return "Give the shortest useful nudge. Prefer 1 line over 3.";
    case "directional":
      return "Point them toward the next action. Don't explain the solution.";
    case "confirm_only":
      return "Only confirm or deny their guess. Don't suggest alternatives.";
    case "explicit_opt_in":
      return "Default to refusing. Ask if they want a direct answer before giving hints.";
    default:
      // Defensive: unexpected enum reaches here only via bad upstream data.
      console.warn(`[prompt] Unknown hintPhilosophy: ${String(value)}`);
      return null;
  }
}

/** Maps `playerGoal` to a single-line directive injected into the prompt. */
export function playerGoalDirective(value: PlayerGoal): string | null {
  switch (value) {
    case "progression":
      return "They want to advance. Tell them the immediate next action.";
    case "exploration":
      return "They want to discover, not advance. Point toward unexplored areas, not the path forward.";
    case "confirmation":
      return "They want yes/no on a guess. Answer the guess directly — don't explain.";
    case "completion":
      return "They're 100%-ing. Mention missables and collectibles, not story progression.";
    default:
      console.warn(`[prompt] Unknown playerGoal: ${String(value)}`);
      return null;
  }
}

function formatPlayerBlock(
  game: PromptGame,
  profile: PromptProfile,
  preferences: PromptPreferences
): string {
  return [
    "--- PLAYER ---",
    `Game: ${game.title}`,
    `Hint style: ${profile.hintPhilosophy}`,
    `Max lines: ${preferences.maxHintLines}`,
    `Spoiler tolerance: ${profile.spoilerTolerance}`,
  ].join("\n");
}

/**
 * Assembles the full system + user prompt for the hint generation call.
 * Returns { systemPrompt, userPrompt }.
 */
export function buildPrompt(slots: PromptSlots): {
  systemPrompt: string;
  userPrompt: string;
} {
  const hintDirective = hintPhilosophyDirective(slots.profile.hintPhilosophy);
  const goalDirective = playerGoalDirective(slots.runContext.playerGoal);

  const directiveLines = [
    hintDirective ? `HINT STYLE DIRECTIVE: ${hintDirective}` : null,
    goalDirective ? `GOAL DIRECTIVE: ${goalDirective}` : null,
  ].filter((l): l is string => l !== null);

  const playerBlock = formatPlayerBlock(
    slots.game,
    slots.profile,
    slots.preferences
  );

  const sections = [
    HINT_POLICY,
    "",
    "--- GUIDE CONTEXT ---",
    formatChunks(slots.retrievedChunks),
    "",
    playerBlock,
    ...directiveLines,
    "",
    "--- PLAYER STATE ---",
    formatRunContext(slots.runContext),
  ];

  if (slots.sessionMemory) {
    sections.push("", "--- SESSION HISTORY ---", slots.sessionMemory);
  }

  const systemPrompt = sections.join("\n").trim();
  const userPrompt = slots.playerQuestion;

  return { systemPrompt, userPrompt };
}
