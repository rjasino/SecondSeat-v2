import { describe, it, expect, vi } from "vitest";
import {
  buildPrompt,
  HINT_POLICY,
  hintPhilosophyDirective,
  playerGoalDirective,
  type PromptSlots,
} from "./prompt-template.js";
import type { RetrievedChunk } from "../retrieval/retrieval.service.js";

const makeChunk = (overrides: Partial<RetrievedChunk> = {}): RetrievedChunk => ({
  id: "vec-1",
  sourceId: "src-1",
  documentId: "doc-1",
  chunkIndex: 0,
  headingPath: "Water Temple > First Floor > Block Puzzle",
  content: "Push the block north to reveal the switch.",
  similarityScore: 0.85,
  spoiler: false,
  ...overrides,
});

const baseSlots: PromptSlots = {
  playerQuestion: "Where do I go next?",
  retrievedChunks: [makeChunk()],
  runContext: {
    gameArea: "Water Temple",
    chapter: "Chapter 3",
    playerGoal: "progression",
    confidenceLevel: "stuck",
  },
  game: { title: "Resident Evil 2" },
  profile: { hintPhilosophy: "directional", spoilerTolerance: "low" },
  preferences: { maxHintLines: 3 },
  sessionMemory: "",
};

describe("buildPrompt", () => {
  it("contains the spoiler-safety policy exactly once in the system prompt", () => {
    const { systemPrompt } = buildPrompt(baseSlots);
    // Count occurrences of the key HINT_POLICY opening line
    const policyLine = "You are SecondSeat, a restrained game guide companion.";
    const matches = systemPrompt.split(policyLine).length - 1;
    expect(matches).toBe(1);
  });

  it("contains the full HINT_POLICY text", () => {
    const { systemPrompt } = buildPrompt(baseSlots);
    expect(systemPrompt).toContain(HINT_POLICY.slice(0, 50));
  });

  it("formats chunk heading paths into the system prompt", () => {
    const { systemPrompt } = buildPrompt(baseSlots);
    expect(systemPrompt).toContain("Water Temple > First Floor > Block Puzzle");
  });

  it("includes the player question as the user prompt", () => {
    const { userPrompt } = buildPrompt(baseSlots);
    expect(userPrompt).toBe("Where do I go next?");
  });

  it("marks spoiler chunks with [SPOILER] label", () => {
    const { systemPrompt } = buildPrompt({
      ...baseSlots,
      retrievedChunks: [makeChunk({ spoiler: true })],
    });
    expect(systemPrompt).toContain("[SPOILER");
  });

  it("does NOT mark clean chunks with [SPOILER]", () => {
    const { systemPrompt } = buildPrompt(baseSlots);
    // HINT_POLICY itself contains "[SPOILER]" in rule 4 — target the chunk label specifically
    expect(systemPrompt).not.toContain("[SPOILER — do not reference]");
  });

  it("includes run context fields in the system prompt", () => {
    const { systemPrompt } = buildPrompt(baseSlots);
    expect(systemPrompt).toContain("Water Temple");
    expect(systemPrompt).toContain("stuck");
    expect(systemPrompt).toContain("progression");
  });

  it("stubs the session memory slot as empty string and omits the section header", () => {
    const { systemPrompt } = buildPrompt({ ...baseSlots, sessionMemory: "" });
    expect(systemPrompt).not.toContain("SESSION HISTORY");
  });

  it("includes session memory section when provided", () => {
    const { systemPrompt } = buildPrompt({
      ...baseSlots,
      sessionMemory: "Player: I already tried the north door.",
    });
    expect(systemPrompt).toContain("SESSION HISTORY");
    expect(systemPrompt).toContain("north door");
  });

  it("shows fallback message when no chunks are provided", () => {
    const { systemPrompt } = buildPrompt({
      ...baseSlots,
      retrievedChunks: [],
    });
    expect(systemPrompt).toContain("no guide content retrieved");
  });

  it("renders the --- PLAYER --- block with game title, hint style, max lines, and spoiler tolerance", () => {
    const { systemPrompt } = buildPrompt(baseSlots);
    expect(systemPrompt).toContain("--- PLAYER ---");
    expect(systemPrompt).toContain("Game: Resident Evil 2");
    expect(systemPrompt).toContain("Hint style: directional");
    expect(systemPrompt).toContain("Max lines: 3");
    expect(systemPrompt).toContain("Spoiler tolerance: low");
  });

  it("places the PLAYER block between GUIDE CONTEXT and PLAYER STATE", () => {
    const { systemPrompt } = buildPrompt(baseSlots);
    const guideIdx = systemPrompt.indexOf("--- GUIDE CONTEXT ---");
    const playerIdx = systemPrompt.indexOf("--- PLAYER ---");
    const stateIdx = systemPrompt.indexOf("--- PLAYER STATE ---");
    expect(guideIdx).toBeGreaterThan(-1);
    expect(playerIdx).toBeGreaterThan(guideIdx);
    expect(stateIdx).toBeGreaterThan(playerIdx);
  });

  it("renders HINT STYLE DIRECTIVE and GOAL DIRECTIVE lines after the PLAYER block", () => {
    const { systemPrompt } = buildPrompt(baseSlots);
    expect(systemPrompt).toMatch(/HINT STYLE DIRECTIVE: .+/);
    expect(systemPrompt).toMatch(/GOAL DIRECTIVE: .+/);
  });
});

describe("hintPhilosophyDirective", () => {
  it("maps `minimal` to the shortest-nudge directive", () => {
    expect(hintPhilosophyDirective("minimal")).toBe(
      "Give the shortest useful nudge. Prefer 1 line over 3."
    );
  });

  it("maps `directional` to the next-action directive", () => {
    expect(hintPhilosophyDirective("directional")).toBe(
      "Point them toward the next action. Don't explain the solution."
    );
  });

  it("maps `confirm_only` to the confirm-or-deny directive", () => {
    expect(hintPhilosophyDirective("confirm_only")).toBe(
      "Only confirm or deny their guess. Don't suggest alternatives."
    );
  });

  it("maps `explicit_opt_in` to the refuse-by-default directive", () => {
    expect(hintPhilosophyDirective("explicit_opt_in")).toBe(
      "Default to refusing. Ask if they want a direct answer before giving hints."
    );
  });

  it("returns null and warns on an unknown value", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Cast through unknown to test the defensive default branch.
    const result = hintPhilosophyDirective(
      "bogus" as unknown as "minimal"
    );
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });
});

describe("playerGoalDirective", () => {
  it("maps `progression` to the next-action directive", () => {
    expect(playerGoalDirective("progression")).toBe(
      "They want to advance. Tell them the immediate next action."
    );
  });

  it("maps `exploration` to the discover-not-advance directive", () => {
    expect(playerGoalDirective("exploration")).toBe(
      "They want to discover, not advance. Point toward unexplored areas, not the path forward."
    );
  });

  it("maps `confirmation` to the yes-no directive", () => {
    expect(playerGoalDirective("confirmation")).toBe(
      "They want yes/no on a guess. Answer the guess directly — don't explain."
    );
  });

  it("maps `completion` to the missables/collectibles directive", () => {
    expect(playerGoalDirective("completion")).toBe(
      "They're 100%-ing. Mention missables and collectibles, not story progression."
    );
  });

  it("returns null and warns on an unknown value", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = playerGoalDirective(
      "bogus" as unknown as "progression"
    );
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });
});

describe("buildPrompt unknown-enum defensive case", () => {
  it("omits the HINT STYLE DIRECTIVE line and warns when hintPhilosophy is unknown", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { systemPrompt } = buildPrompt({
      ...baseSlots,
      profile: {
        hintPhilosophy: "bogus" as unknown as "directional",
        spoilerTolerance: "low",
      },
    });
    expect(systemPrompt).not.toContain("HINT STYLE DIRECTIVE:");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("omits the GOAL DIRECTIVE line and warns when playerGoal is unknown", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { systemPrompt } = buildPrompt({
      ...baseSlots,
      runContext: {
        ...baseSlots.runContext,
        playerGoal: "bogus" as unknown as "progression",
      },
    });
    expect(systemPrompt).not.toContain("GOAL DIRECTIVE:");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
