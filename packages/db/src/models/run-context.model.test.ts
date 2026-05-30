import { describe, it, expect } from "vitest";
import { RunContextModel } from "./run-context.model";

describe("RunContext schema", () => {
  it("requires gameArea", () => {
    expect(RunContextModel.schema.path("gameArea").isRequired).toBe(true);
  });

  it("requires subArea (changed: was optional)", () => {
    expect(RunContextModel.schema.path("subArea").isRequired).toBe(true);
  });

  it("makes chapter optional (changed: was required)", () => {
    // isRequired is undefined/false for non-required paths.
    expect(RunContextModel.schema.path("chapter").isRequired).toBeFalsy();
  });

  it("still requires playerGoal and confidenceLevel", () => {
    expect(RunContextModel.schema.path("playerGoal").isRequired).toBe(true);
    expect(RunContextModel.schema.path("confidenceLevel").isRequired).toBe(true);
  });
});
