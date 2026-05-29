import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// --- Mock config before importing anything that reads it ---
vi.mock("../config/config.js", () => ({
  inferenceConfig: {
    MONGODB_URI: "mongodb://localhost/test",
    CHROMA_URL: "http://localhost:8000",
    CHROMA_COLLECTION: "secondseat_rag",
    INFERENCE_SERVICE_SECRET: "test-secret",
    LLM_PROVIDER: "opencode_zen",
    ANTHROPIC_API_KEY: "",
    OPENCODE_ZEN_BASE_URL: "http://localhost:4000",
    OPENCODE_ZEN_API_KEY: "dev",
    RETRIEVAL_K: 4,
    RETRIEVAL_MIN_SCORE: 0.3,
    LLM_TIMEOUT_MS: 5000,
    RATE_LIMIT_WINDOW_MS: 300000,
    RATE_LIMIT_MAX: 30,
    PORT: 3001,
  },
  RETRIEVAL_MAX_L2_DISTANCE: 1.18,
}));

vi.mock("../services/retrieval/retrieval.service.js", () => ({
  retrieveChunks: vi.fn().mockResolvedValue([
    {
      id: "vec-1",
      sourceId: "src-1",
      documentId: "doc-1",
      chunkIndex: 0,
      headingPath: "Area > Section",
      content: "Go north through the locked door.",
      similarityScore: 0.9,
      spoiler: false,
    },
  ]),
}));

vi.mock("../services/llm/index.js", () => ({
  getLlmAdapter: vi.fn().mockReturnValue({
    streamGenerate: vi.fn().mockImplementation(async function* () {
      yield "Head ";
      yield "north.";
    }),
  }),
}));

vi.mock("../services/persistence/hint-log.service.js", () => ({
  insertHintRequest: vi.fn().mockResolvedValue("507f1f77bcf86cd799439011"),
  insertHintResponse: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@secondseat/embedding", () => ({
  embedText: vi.fn().mockResolvedValue(new Array(384).fill(0)),
  warmupEmbeddingModel: vi.fn(),
}));

// --- Mock Mongo models used directly by the route handler ---
const { mockGameFindById, mockPlaySessionFindById, mockProfileFindOne, mockPreferencesFindOne } =
  vi.hoisted(() => ({
    mockGameFindById: vi.fn(),
    mockPlaySessionFindById: vi.fn(),
    mockProfileFindOne: vi.fn(),
    mockPreferencesFindOne: vi.fn(),
  }));

/** Build the `.select(...).lean()` chain Mongoose calls expect. */
function leanChain<T>(value: T) {
  return {
    select: () => ({ lean: async () => value }),
    lean: async () => value,
  };
}

vi.mock("@secondseat/db", () => ({
  GameModel: { findById: (id: string) => mockGameFindById(id) },
  PlaySessionModel: { findById: (id: string) => mockPlaySessionFindById(id) },
  ProfileModel: { findOne: (q: unknown) => mockProfileFindOne(q) },
  PreferencesModel: { findOne: (q: unknown) => mockPreferencesFindOne(q) },
}));

import { authMiddleware } from "../middleware/auth.middleware.js";
import { errorMiddleware } from "../middleware/error.middleware.js";
import { generateRouter } from "./generate.route.js";

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/generate", authMiddleware, generateRouter);
  app.use(errorMiddleware);
  return app;
}

const VALID_OID = "507f1f77bcf86cd799439011";
const VALID_BODY = {
  playSessionId: VALID_OID,
  runContextId: VALID_OID,
  gameId: VALID_OID,
  gameArea: "Water Temple",
  chapter: "Chapter 3",
  playerGoal: "progression",
  confidenceLevel: "stuck",
  text: "Where do I go next?",
};
const AUTH_HEADERS = {
  "x-service-secret": "test-secret",
  "x-user-id": "user-123",
  "x-user-role": "user",
};

describe("POST /api/v1/generate", () => {
  let app: ReturnType<typeof buildTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish default Mongo mock responses each test.
    mockGameFindById.mockReturnValue(leanChain({ title: "Resident Evil 2" }));
    mockPlaySessionFindById.mockReturnValue(leanChain({ userId: "user-mongo-id" }));
    mockProfileFindOne.mockReturnValue(
      leanChain({
        _id: "profile-mongo-id",
        hintPhilosophy: "directional",
        spoilerTolerance: "low",
      })
    );
    mockPreferencesFindOne.mockReturnValue(leanChain({ maxHintLines: 3 }));
    app = buildTestApp();
  });

  it("returns 401 when X-Service-Secret is missing", async () => {
    const res = await request(app)
      .post("/api/v1/generate")
      .send(VALID_BODY);
    expect(res.status).toBe(401);
  });

  it("returns 401 when X-Service-Secret is wrong", async () => {
    const res = await request(app)
      .post("/api/v1/generate")
      .set("x-service-secret", "wrong-secret")
      .set("x-user-id", "user-123")
      .set("x-user-role", "user")
      .send(VALID_BODY);
    expect(res.status).toBe(401);
  });

  it("returns 422 when request body is invalid (missing text)", async () => {
    const { text: _t, ...without } = VALID_BODY;
    const res = await request(app)
      .post("/api/v1/generate")
      .set(AUTH_HEADERS)
      .send(without);
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty("error", "VALIDATION_ERROR");
    expect(res.body.details).toBeInstanceOf(Array);
  });

  it("streams SSE on a valid request with correct headers", async () => {
    const res = await request(app)
      .post("/api/v1/generate")
      .set(AUTH_HEADERS)
      .send(VALID_BODY)
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => callback(null, data));
      });

    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(res.headers["cache-control"]).toMatch(/no-cache/);
    // Custom .parse() stores its result in res.body, not res.text
    expect(res.body).toContain("event: done");
  });

  it("returns refused=false on a clean hint response", async () => {
    const res = await request(app)
      .post("/api/v1/generate")
      .set(AUTH_HEADERS)
      .send(VALID_BODY)
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => callback(null, data));
      });

    // Custom .parse() stores its result in res.body, not res.text
    const doneLine = res.body
      .split("\n")
      .find((l: string) => l.startsWith("data:") && res.body.includes("event: done"));

    // Find the data line after "event: done"
    const lines = res.body.split("\n");
    const doneIdx = lines.findIndex((l: string) => l === "event: done");
    const doneData = lines[doneIdx + 1] ?? "";
    const payload = JSON.parse(doneData.replace("data: ", ""));

    expect(payload.refused).toBe(false);
    expect(payload.lineCount).toBeGreaterThanOrEqual(1);
    expect(payload.lineCount).toBeLessThanOrEqual(3);

    void doneLine; // used above
  });

  it("logs profile_missing and falls back when Profile is not found", async () => {
    mockProfileFindOne.mockReturnValueOnce(leanChain(null));
    // Preferences depends on profileId; without a profile, that branch also fires its own log.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await request(app)
      .post("/api/v1/generate")
      .set(AUTH_HEADERS)
      .send(VALID_BODY)
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => callback(null, data));
      });

    expect(res.body).toContain("event: done");
    const warned = warnSpy.mock.calls.flat().join(" ");
    expect(warned).toMatch(/profile_missing/);
    warnSpy.mockRestore();
  });

  it("logs preferences_missing and falls back when Preferences is not found", async () => {
    mockPreferencesFindOne.mockReturnValueOnce(leanChain(null));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await request(app)
      .post("/api/v1/generate")
      .set(AUTH_HEADERS)
      .send(VALID_BODY)
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => callback(null, data));
      });

    expect(res.body).toContain("event: done");
    const warned = warnSpy.mock.calls.flat().join(" ");
    expect(warned).toMatch(/preferences_missing/);
    warnSpy.mockRestore();
  });

  it("emits a refusal when Game is not found rather than crashing", async () => {
    mockGameFindById.mockReturnValueOnce(leanChain(null));

    const res = await request(app)
      .post("/api/v1/generate")
      .set(AUTH_HEADERS)
      .send(VALID_BODY)
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => callback(null, data));
      });

    expect(res.body).toContain("event: done");
    expect(res.body).toMatch(/"refused":true/);
    expect(res.body).toMatch(/insufficient_context/);
  });
});
