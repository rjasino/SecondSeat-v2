import { describe, it, expect } from "vitest";
import { buildPrompt, HINT_POLICY } from "./prompt-template.js";
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

const baseSlots = {
  playerQuestion: "Where do I go next?",
  retrievedChunks: [makeChunk()],
  runContext: {
    gameArea: "Water Temple",
    chapter: "Chapter 3",
    playerGoal: "progression" as const,
    confidenceLevel: "stuck" as const,
  },
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
    expect(systemPrompt).not.toContain("[SPOILER");
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
});
