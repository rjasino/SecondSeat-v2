import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { RagSourceModel } from "./rag-source.model.js";

describe("RagSource schema indexes", () => {
  const schemaIndexes = (RagSourceModel.schema as mongoose.Schema).indexes();

  it("does not define a unique compound index on metadata.game + metadata.author", () => {
    const uniqueGameAuthorIndex = schemaIndexes.find(([fields, opts]) => {
      const hasGameAuthor =
        "metadata.game" in (fields as Record<string, unknown>) &&
        "metadata.author" in (fields as Record<string, unknown>);
      return hasGameAuthor && (opts as Record<string, unknown>).unique === true;
    });

    expect(uniqueGameAuthorIndex).toBeUndefined();
  });

  it("defines no index on metadata.game or metadata.author", () => {
    const gameAuthorIndex = schemaIndexes.find(([fields]) => {
      const f = fields as Record<string, unknown>;
      return "metadata.game" in f || "metadata.author" in f;
    });

    expect(gameAuthorIndex).toBeUndefined();
  });
});
