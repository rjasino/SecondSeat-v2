import { describe, it, expect } from "vitest";
import { classifyChunk } from "./chunk-classifier.js";

describe("classifyChunk", () => {
  describe("content type detection", () => {
    it("classifies boss-related headings as boss_guide", () => {
      const result = classifyChunk("Chapter 1 — Boss Fight", "");
      expect(result.contentType).toBe("boss_guide");
    });

    it("classifies side quest headings as side_quest_guide", () => {
      const result = classifyChunk("Side Quest: The Lost Merchant", "");
      expect(result.contentType).toBe("side_quest_guide");
    });

    it("classifies collectibles headings as collectibles_guide", () => {
      const result = classifyChunk("Collectibles — All Trophy Locations", "");
      expect(result.contentType).toBe("collectibles_guide");
    });

    it("classifies tips headings as tips_and_tricks", () => {
      const result = classifyChunk("Tips and Tricks for Beginners", "");
      expect(result.contentType).toBe("tips_and_tricks");
    });

    it("classifies character/lore headings as character_arc", () => {
      const result = classifyChunk("Character Backstory — The Knight", "");
      expect(result.contentType).toBe("character_arc");
    });

    it("classifies area headings as area_guide", () => {
      const result = classifyChunk("Stormveil Castle — Area Overview", "");
      expect(result.contentType).toBe("area_guide");
    });

    it("classifies walkthrough headings as full_walkthrough", () => {
      const result = classifyChunk("Complete Walkthrough Part 1", "");
      expect(result.contentType).toBe("full_walkthrough");
    });

    it("classifies generic guide headings as game_guide", () => {
      const result = classifyChunk("Getting Started Guide", "");
      expect(result.contentType).toBe("game_guide");
    });

    it("falls back to general when no pattern matches", () => {
      const result = classifyChunk("Credits", "Thank you for playing.");
      expect(result.contentType).toBe("general");
    });

    it("matches against content snippet when heading has no pattern", () => {
      const result = classifyChunk("", "This section covers the final boss encounter in detail.");
      expect(result.contentType).toBe("boss_guide");
    });

    it("only uses the first 200 chars of content for matching", () => {
      const longContent = "x".repeat(300) + " boss fight details";
      const result = classifyChunk("", longContent);
      expect(result.contentType).toBe("general");
    });
  });

  describe("priority ordering", () => {
    it("boss_guide wins over tips_and_tricks when both match", () => {
      const result = classifyChunk("Boss Fight Tips and Tricks", "");
      expect(result.contentType).toBe("boss_guide");
    });

    it("side_quest_guide wins over character_arc when both match", () => {
      const result = classifyChunk("Side Quest — Character NPC Arc", "");
      expect(result.contentType).toBe("side_quest_guide");
    });
  });

  describe("chapter number extraction", () => {
    it("extracts chapter number from heading", () => {
      const result = classifyChunk("Chapter 2 — The Descent", "");
      expect(result.chapterNumber).toBe(2);
    });

    it("extracts act number from heading", () => {
      const result = classifyChunk("Act 3 Final Boss", "");
      expect(result.chapterNumber).toBe(3);
    });

    it("extracts part number from heading", () => {
      const result = classifyChunk("Part 10 Conclusion", "");
      expect(result.chapterNumber).toBe(10);
    });

    it("extracts section number from heading", () => {
      const result = classifyChunk("Section 4 — Collectibles", "");
      expect(result.chapterNumber).toBe(4);
    });

    it("returns null when no chapter pattern is found", () => {
      const result = classifyChunk("Boss Fight Overview", "");
      expect(result.chapterNumber).toBeNull();
    });

    it("returns chapter number alongside content type", () => {
      const result = classifyChunk("Chapter 2 — Boss Fight", "");
      expect(result.contentType).toBe("boss_guide");
      expect(result.chapterNumber).toBe(2);
    });

    it("returns null chapterNumber with general content type when nothing matches", () => {
      const result = classifyChunk("Random Heading", "Random content.");
      expect(result.contentType).toBe("general");
      expect(result.chapterNumber).toBeNull();
    });
  });
});
