import { describe, it, expect } from "vitest";
import { chunkText } from "./node-parser.service.js";

describe("chunkText — Chunk contract", () => {
  it("emits content without the heading prefix and embeddingInput with it", () => {
    const md = `# Water Temple

## First Floor

### Block Puzzle

Push the block north to reveal the switch.
`;
    const chunks = chunkText(md);
    expect(chunks.length).toBeGreaterThan(0);

    for (const chunk of chunks) {
      expect(chunk.content.startsWith("[")).toBe(false);
      expect(chunk.embeddingInput.startsWith(`[${chunk.headingPath}]\n`)).toBe(
        true
      );
      expect(chunk.embeddingInput).toContain(chunk.content);
    }
  });

  it("preserves a `[...]` token that appears later in the body (only strips the first heading line)", () => {
    const md = `# Side Quests

## Missables

[Optional] Pick up the Red Herb in the corner.
`;
    const chunks = chunkText(md);
    const target = chunks.find((c) =>
      c.headingPath.endsWith("Missables")
    );
    expect(target).toBeDefined();
    // The "[Optional]" prefix is body text, not the chunker's heading wrap —
    // it must survive in `content`.
    expect(target?.content).toContain("[Optional]");
    expect(target?.content.startsWith("[Optional]")).toBe(true);
  });

  it("falls back gracefully on an un-headed document", () => {
    const md = `Just a paragraph of text with no headings at all.`;
    const chunks = chunkText(md);
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.headingPath).toBe("Document");
    expect(chunks[0]!.content.startsWith("[")).toBe(false);
    expect(chunks[0]!.embeddingInput.startsWith("[Document]\n")).toBe(true);
  });
});
