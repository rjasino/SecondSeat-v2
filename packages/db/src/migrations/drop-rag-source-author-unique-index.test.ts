import { describe, it, expect, vi } from "vitest";
import {
  dropRagSourceAuthorUniqueIndex,
  INDEX_NAME,
  type MigrationDeps,
} from "./drop-rag-source-author-unique-index.js";

function makeDeps(overrides: Partial<MigrationDeps> = {}): MigrationDeps {
  return {
    indexes: vi.fn().mockResolvedValue([]),
    dropIndex: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    ...overrides,
  };
}

describe("dropRagSourceAuthorUniqueIndex", () => {
  it("drops the index when it exists in the collection", async () => {
    const deps = makeDeps({
      indexes: vi.fn().mockResolvedValue([{ name: INDEX_NAME }]),
    });

    await dropRagSourceAuthorUniqueIndex(deps);

    expect(deps.dropIndex).toHaveBeenCalledWith(INDEX_NAME);
    expect(deps.log).toHaveBeenCalledWith(
      expect.stringContaining("dropped successfully")
    );
  });

  it("skips dropping and logs when the index does not exist", async () => {
    const deps = makeDeps({
      indexes: vi.fn().mockResolvedValue([{ name: "some_other_index" }]),
    });

    await dropRagSourceAuthorUniqueIndex(deps);

    expect(deps.dropIndex).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith(
      expect.stringContaining("not found")
    );
  });

  it("skips dropping and logs when the collection has no indexes", async () => {
    const deps = makeDeps({ indexes: vi.fn().mockResolvedValue([]) });

    await dropRagSourceAuthorUniqueIndex(deps);

    expect(deps.dropIndex).not.toHaveBeenCalled();
  });

  it("propagates errors thrown by dropIndex", async () => {
    const deps = makeDeps({
      indexes: vi.fn().mockResolvedValue([{ name: INDEX_NAME }]),
      dropIndex: vi.fn().mockRejectedValue(new Error("DB error")),
    });

    await expect(dropRagSourceAuthorUniqueIndex(deps)).rejects.toThrow(
      "DB error"
    );
  });
});
