import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock @secondseat/embedding before importing the service ---
vi.mock("@secondseat/embedding", () => ({
  embedText: vi.fn().mockResolvedValue(new Array(384).fill(0.1)),
  warmupEmbeddingModel: vi.fn().mockResolvedValue(undefined),
}));

// --- Mock chromadb ---
const mockQuery = vi.fn();
const mockGetOrCreateCollection = vi.fn().mockResolvedValue({
  query: mockQuery,
});

vi.mock("chromadb", () => ({
  ChromaClient: vi.fn().mockImplementation(() => ({
    getOrCreateCollection: mockGetOrCreateCollection,
  })),
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

import { retrieveChunks } from "./retrieval.service.js";

describe("retrieveChunks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns chunks above the similarity threshold", async () => {
    mockQuery.mockResolvedValue({
      ids: [["vec-1", "vec-2"]],
      distances: [[0.5, 0.5]], // L2 < 1.18, so cosine > 0.3
      metadatas: [
        [
          {
            source_id: "src-1",
            document_id: "doc-1",
            chunk_index: 0,
            heading_path: "Area > Section",
            spoiler: false,
          },
          {
            source_id: "src-1",
            document_id: "doc-2",
            chunk_index: 1,
            heading_path: "Area > Section 2",
            spoiler: false,
          },
        ],
      ],
      documents: [["Content A", "Content B"]],
    });

    const chunks = await retrieveChunks("where do I go", "game-123");
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.headingPath).toBe("Area > Section");
  });

  it("filters out chunks below the similarity threshold (L2 too high)", async () => {
    mockQuery.mockResolvedValue({
      ids: [["vec-1"]],
      distances: [[1.5]], // L2 > 1.18 — below threshold
      metadatas: [[{ source_id: "s", document_id: "d", chunk_index: 0, heading_path: "X", spoiler: false }]],
      documents: [["Some content"]],
    });

    const chunks = await retrieveChunks("some query", "game-123");
    expect(chunks).toHaveLength(0);
  });

  it("treats metadata.spoiler === undefined as false", async () => {
    mockQuery.mockResolvedValue({
      ids: [["vec-1"]],
      distances: [[0.5]],
      metadatas: [[{ source_id: "s", document_id: "d", chunk_index: 0, heading_path: "Y" }]], // no spoiler field
      documents: [["Content"]],
    });

    const chunks = await retrieveChunks("query", "game-123");
    expect(chunks[0]?.spoiler).toBe(false);
  });

  it("flags chunks with metadata.spoiler === true", async () => {
    mockQuery.mockResolvedValue({
      ids: [["vec-1"]],
      distances: [[0.5]],
      metadatas: [[{ source_id: "s", document_id: "d", chunk_index: 0, heading_path: "Z", spoiler: true }]],
      documents: [["Spoiler content"]],
    });

    const chunks = await retrieveChunks("query", "game-123");
    expect(chunks[0]?.spoiler).toBe(true);
  });

  it("returns empty array when ChromaDB returns no results", async () => {
    mockQuery.mockResolvedValue({
      ids: [[]],
      distances: [[]],
      metadatas: [[]],
      documents: [[]],
    });

    const chunks = await retrieveChunks("obscure query", "game-123");
    expect(chunks).toHaveLength(0);
  });

  it("passes the game_id filter to the ChromaDB query", async () => {
    mockQuery.mockResolvedValue({ ids: [[]], distances: [[]], metadatas: [[]], documents: [[]] });

    await retrieveChunks("test query", "re2r-game-id");

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { game_id: "re2r-game-id" },
      })
    );
  });
});
