import { describe, it, expect } from "vitest";
import { checkKeywords } from "./spoiler-check.service.js";

describe("checkKeywords", () => {
  it("returns false for a benign question", () => {
    expect(checkKeywords("where do I go in the water temple")).toBe(false);
  });

  it("returns true when query contains a spoiler keyword (case-insensitive)", () => {
    expect(checkKeywords("what is the true ending of the game")).toBe(true);
    expect(checkKeywords("What Is The TRUE ENDING")).toBe(true);
  });

  it("returns true for 'final boss'", () => {
    expect(checkKeywords("how do I beat the final boss")).toBe(true);
  });

  it("returns true for a substring match", () => {
    expect(checkKeywords("I want to know about the ending")).toBe(true);
  });

  it("returns false for an empty string", () => {
    expect(checkKeywords("")).toBe(false);
  });

  it("returns false for a question about a specific area without spoiler terms", () => {
    expect(checkKeywords("how do I open the door in the sewers")).toBe(false);
  });
});
