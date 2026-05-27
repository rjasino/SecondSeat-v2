import { describe, it, expect } from "vitest";
import { generateSchema } from "./generate.schema.js";

const VALID_OID = "507f1f77bcf86cd799439011";

const validBody = {
  playSessionId: VALID_OID,
  runContextId: VALID_OID,
  gameId: VALID_OID,
  gameArea: "Water Temple",
  chapter: "Chapter 3",
  playerGoal: "progression" as const,
  confidenceLevel: "stuck" as const,
  text: "Where do I go next?",
};

describe("generateSchema", () => {
  it("accepts a valid request body", () => {
    const result = generateSchema.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  it("accepts an optional subArea field", () => {
    const result = generateSchema.safeParse({
      ...validBody,
      subArea: "First Floor",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing text field", () => {
    const { text: _text, ...without } = validBody;
    const result = generateSchema.safeParse(without);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors.some((e) => e.path.includes("text"))).toBe(true);
    }
  });

  it("rejects text longer than 500 chars", () => {
    const result = generateSchema.safeParse({
      ...validBody,
      text: "a".repeat(501),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors.some((e) => e.path.includes("text"))).toBe(true);
    }
  });

  it("rejects an invalid ObjectId for playSessionId", () => {
    const result = generateSchema.safeParse({
      ...validBody,
      playSessionId: "not-an-object-id",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.errors.some((e) => e.path.includes("playSessionId"))
      ).toBe(true);
    }
  });

  it("rejects an invalid playerGoal enum value", () => {
    const result = generateSchema.safeParse({
      ...validBody,
      playerGoal: "speed_run",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid confidenceLevel enum value", () => {
    const result = generateSchema.safeParse({
      ...validBody,
      confidenceLevel: "panicking",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty text field", () => {
    const result = generateSchema.safeParse({ ...validBody, text: "" });
    expect(result.success).toBe(false);
  });
});
