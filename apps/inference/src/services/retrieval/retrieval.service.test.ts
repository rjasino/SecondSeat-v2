import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted shared mock fns (referenced by hoisted vi.mock factories) ---
const {
  mockEmbedText,
  mockFindById,
  mockQuery,
  mockGetOrCreateCollection,
} = vi.hoisted(() => ({
  mockEmbedText: vi.fn(),
  mockFindById: vi.fn(),
  mockQuery: vi.fn(),
  mockGetOrCreateCollection: vi.fn(),
}));

vi.mock("@secondseat/embedding", () => ({
  embedText: mockEmbedText,
  warmupEmbeddingModel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@secondseat/db", () => ({
  GameModel: {
    findById: mockFindById,
  },
}));

vi.mock("chromadb", () => ({
  // Real class is reliably constructable across vitest versions; vi.fn-based
  // constructors have been flaky here. The inner mocks still record calls.
  ChromaClient: class {
    getOrCreateCollection = mockGetOrCreateCollection;
  },
}));

// --- Mock config ---
vi.mock("../../config/config.js", () => ({
  inferenceConfig: {
    CHROMA_URL: "http://localhost:8000",
    CHROMA_COLLECTION: "secondseat_rag",
    RETRIEVAL_K: 4,
    RETRIEVAL_MIN_SCORE: 0.3,
  },
  RETRIEVAL_MAX_L2_DISTANCE: Math.sqrt(2 * (1 - 0.3)), // ~1.18
}));

import {
  retrieveChunks,
  buildEnrichedQuery,
  type RetrievalRunContext,
} from "./retrieval.service.js";

/** Builds the `.select("title").lean()` chain returned by GameModel.findById. */
function mockGame(title: string | null) {
  return {
    select: () => ({
      lean: async () => (title === null ? null : { title }),
    }),
  };
}

const RC: RetrievalRunContext = {
  gameArea: "RPD",
  chapter: "Chapter 1",
  subArea: "Sewer",
  playerGoal: "progression",
};

const emptyChromaResult = {
  ids: [[]],
  distances: [[]],
  metadatas: [[]],
  documents: [[]],
};

describe("buildEnrichedQuery", () => {
  it("composes the full pipe-separated string with all fields present", () => {
    expect(
      buildEnrichedQuery("Resident Evil 2", RC, "How to beat the boss in the sewer.")
    ).toBe(
      "Resident Evil 2 | Chapter 1 | RPD | Sewer | goal:progression | How to beat the boss in the sewer."
    );
  });

  it("drops subArea when undefined (no empty token)", () => {
    const { subArea: _subArea, ...rest } = RC;
    expect(buildEnrichedQuery("Game", rest as RetrievalRunContext, "q")).toBe(
      "Game | Chapter 1 | RPD | goal:progression | q"
    );
  });

  it("uses raw playerGoal enum verbatim", () => {
    const ctx = { ...RC, playerGoal: "completion" };
    expect(buildEnrichedQuery("G", ctx, "q")).toContain("goal:completion");
  });

  it("omits chapter when undefined — no empty token", () => {
    const { chapter: _chapter, ...noChapter } = RC;
    expect(buildEnrichedQuery("RE2R", noChapter, "q")).toBe(
      "RE2R | RPD | Sewer | goal:progression | q"
    );
  });

  it("drops the 'none' sub-area sentinel from the enriched query", () => {
    const ctx = { ...RC, subArea: "none" };
    expect(buildEnrichedQuery("RE2R", ctx, "q")).toBe(
      "RE2R | Chapter 1 | RPD | goal:progression | q"
    );
  });

  it("treats the 'none' sentinel case-insensitively", () => {
    const ctx = { ...RC, subArea: "None" };
    expect(buildEnrichedQuery("RE2R", ctx, "q")).toBe(
      "RE2R | Chapter 1 | RPD | goal:progression | q"
    );
  });
});

describe("retrieveChunks", () => {
  beforeEach(() => {
    // Reset call history but re-establish implementations explicitly so
    // module-level cached state (e.g. _client in retrieval.service) keeps
    // working across tests.
    mockEmbedText.mockReset();
    mockFindById.mockReset();
    mockQuery.mockReset();
    mockGetOrCreateCollection.mockReset();

    mockEmbedText.mockResolvedValue(new Array(384).fill(0.1));
    mockGetOrCreateCollection.mockResolvedValue({ query: mockQuery });
    mockFindById.mockReturnValue(mockGame("Resident Evil 2"));
  });

  it("throws when the game cannot be found", async () => {
    mockFindById.mockReturnValue(mockGame(null));
    await expect(
      retrieveChunks("query", "missing-game", RC)
    ).rejects.toThrow(/Game not found/);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("passes the enriched query (not the raw text) to the embedder", async () => {
    mockQuery.mockResolvedValue(emptyChromaResult);
    await retrieveChunks("How to beat the boss in the sewer.", "game-1", RC);
    expect(mockEmbedText).toHaveBeenCalledWith(
      "Resident Evil 2 | Chapter 1 | RPD | Sewer | goal:progression | How to beat the boss in the sewer."
    );
  });

  it("issues a filtered Chroma query with $and(game_id, $or(location))", async () => {
    mockQuery.mockResolvedValue({
      ids: [["v"]],
      distances: [[0.5]],
      metadatas: [
        [{ source_id: "s", document_id: "d", chunk_index: 0, heading_path: "X" }],
      ],
      documents: [["content"]],
    });

    await retrieveChunks("q", "game-1", RC);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          $and: [
            { game_id: "game-1" },
            {
              $or: [
                { chapter: "chapter 1" },
                { area: "rpd" },
                { sub_area: "sewer" },
              ],
            },
          ],
        },
      })
    );
  });

  it("omits chapter from the $or clause when chapter is undefined", async () => {
    mockQuery.mockResolvedValue({
      ids: [["v"]],
      distances: [[0.5]],
      metadatas: [
        [{ source_id: "s", document_id: "d", chunk_index: 0, heading_path: "X" }],
      ],
      documents: [["content"]],
    });
    const { chapter: _chapter, ...noChapter } = RC;

    await retrieveChunks("q", "game-1", noChapter);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          $and: [
            { game_id: "game-1" },
            { $or: [{ area: "rpd" }, { sub_area: "sewer" }] },
          ],
        },
      })
    );
  });

  it("omits sub_area from the $or clause when subArea is undefined", async () => {
    mockQuery.mockResolvedValue({
      ids: [["v"]],
      distances: [[0.5]],
      metadatas: [
        [{ source_id: "s", document_id: "d", chunk_index: 0, heading_path: "X" }],
      ],
      documents: [["content"]],
    });
    const { subArea: _, ...rest } = RC;

    await retrieveChunks("q", "game-1", rest as RetrievalRunContext);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          $and: [
            { game_id: "game-1" },
            { $or: [{ chapter: "chapter 1" }, { area: "rpd" }] },
          ],
        },
      })
    );
  });

  it("drops the 'none' sub-area sentinel from the location $or clause", async () => {
    mockQuery.mockResolvedValue({
      ids: [["v"]],
      distances: [[0.5]],
      metadatas: [
        [{ source_id: "s", document_id: "d", chunk_index: 0, heading_path: "X" }],
      ],
      documents: [["content"]],
    });

    await retrieveChunks("q", "game-1", { ...RC, subArea: "none" });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          $and: [
            { game_id: "game-1" },
            { $or: [{ chapter: "chapter 1" }, { area: "rpd" }] },
          ],
        },
      })
    );
  });

  it("falls back to a game_id-only query when the filtered query returns zero usable chunks", async () => {
    mockQuery
      .mockResolvedValueOnce(emptyChromaResult) // filtered: miss
      .mockResolvedValueOnce({
        ids: [["v-fallback"]],
        distances: [[0.5]],
        metadatas: [
          [{ source_id: "s", document_id: "d", chunk_index: 0, heading_path: "Y" }],
        ],
        documents: [["fallback content"]],
      });

    const chunks = await retrieveChunks("q", "game-1", RC);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls[1]?.[0]).toMatchObject({
      where: { game_id: "game-1" },
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.id).toBe("v-fallback");
  });

  it("logs area_filter_miss when the filtered query returns nothing", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockQuery
      .mockResolvedValueOnce(emptyChromaResult)
      .mockResolvedValueOnce(emptyChromaResult);

    await retrieveChunks("q", "game-1", RC);

    const missLog = logSpy.mock.calls.find((args) =>
      String(args[0]).includes("area_filter_miss")
    );
    expect(missLog).toBeDefined();
    expect(String(missLog?.[0])).toMatch(/sub_area=Sewer/);
    logSpy.mockRestore();
  });

  it("does not run the fallback query when the filtered query returns usable chunks", async () => {
    mockQuery.mockResolvedValue({
      ids: [["v"]],
      distances: [[0.5]],
      metadatas: [
        [{ source_id: "s", document_id: "d", chunk_index: 0, heading_path: "X" }],
      ],
      documents: [["content"]],
    });

    await retrieveChunks("q", "game-1", RC);

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("filters out chunks below the similarity threshold (L2 too high)", async () => {
    mockQuery
      .mockResolvedValueOnce({
        ids: [["v"]],
        distances: [[1.5]], // above threshold → projects to []
        metadatas: [
          [{ source_id: "s", document_id: "d", chunk_index: 0, heading_path: "X" }],
        ],
        documents: [["content"]],
      })
      .mockResolvedValueOnce(emptyChromaResult); // fallback also empty

    const chunks = await retrieveChunks("q", "game-1", RC);
    expect(chunks).toHaveLength(0);
  });

  it("sets spoiler:true when spoiler_level >= 2", async () => {
    mockQuery.mockResolvedValue({
      ids: [["v1", "v2", "v3"]],
      distances: [[0.5, 0.5, 0.5]],
      metadatas: [
        [
          { source_id: "s", document_id: "d", chunk_index: 0, heading_path: "A", spoiler_level: 2 },
          { source_id: "s", document_id: "d", chunk_index: 1, heading_path: "B", spoiler_level: 3 },
          { source_id: "s", document_id: "d", chunk_index: 2, heading_path: "C", spoiler_level: 1 },
        ],
      ],
      documents: [["c1", "c2", "c3"]],
    });

    const chunks = await retrieveChunks("q", "game-1", RC);
    expect(chunks[0]?.spoiler).toBe(true);  // level 2 → spoiler
    expect(chunks[1]?.spoiler).toBe(true);  // level 3 → spoiler
    expect(chunks[2]?.spoiler).toBe(false); // level 1 → not spoiler
  });

  it("defaults spoiler:false when spoiler_level is absent (legacy vector)", async () => {
    mockQuery.mockResolvedValue({
      ids: [["v1"]],
      distances: [[0.5]],
      metadatas: [
        [{ source_id: "s", document_id: "d", chunk_index: 0, heading_path: "A" }],
      ],
      documents: [["content"]],
    });

    const chunks = await retrieveChunks("q", "game-1", RC);
    expect(chunks[0]?.spoiler).toBe(false);
  });

  it("includes filter=hit|miss|none in the summary log line", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockQuery.mockResolvedValue({
      ids: [["v"]],
      distances: [[0.5]],
      metadatas: [
        [{ source_id: "s", document_id: "d", chunk_index: 0, heading_path: "X" }],
      ],
      documents: [["content"]],
    });

    await retrieveChunks("q", "game-1", RC);

    const summary = logSpy.mock.calls.find((args) =>
      String(args[0]).includes("returned=")
    );
    expect(String(summary?.[0])).toMatch(/filter=hit/);
    logSpy.mockRestore();
  });
});
