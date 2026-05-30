import { describe, it, expect } from "vitest";
import { HintResponseModel } from "./hint-response.model";

describe("HintResponse schema", () => {
  it("defines an outcome enum with the three states", () => {
    const path = HintResponseModel.schema.path("outcome") as unknown as {
      enumValues: string[];
    };
    expect(path.enumValues).toEqual(["answered", "redirected", "refused"]);
  });

  it("defaults outcome to 'answered'", () => {
    const options = HintResponseModel.schema.path("outcome").options as {
      default: string;
    };
    expect(options.default).toBe("answered");
  });

  it("requires outcome", () => {
    expect(HintResponseModel.schema.path("outcome").isRequired).toBe(true);
  });

  it("keeps the existing refused / refusalReason fields", () => {
    expect(HintResponseModel.schema.path("refused")).toBeDefined();
    expect(HintResponseModel.schema.path("refusalReason")).toBeDefined();
  });
});
