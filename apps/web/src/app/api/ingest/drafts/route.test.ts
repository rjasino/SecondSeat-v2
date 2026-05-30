import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/models/rag-source.model", () => ({
  RagSourceModel: {
    create: vi.fn(),
    findOne: vi.fn(),
  },
}));

import { POST } from "./route";
import { getSession } from "@/lib/session";
import { RagSourceModel } from "@/models/rag-source.model";

const mockSourceDoc = {
  _id: { toString: () => "new-source-id" },
};

const validBody = {
  title: "Elden Ring Boss Guide",
  game: "Elden Ring",
  guideType: "boss_guide",
  author: "Fextralife",
  content: "## Margit\n\nWatch out for the hammer.",
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/ingest/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(RagSourceModel.create).mockResolvedValue(mockSourceDoc as never);
});

describe("POST /api/ingest/drafts", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: undefined } as never);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as non-admin", async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: "user-1",
      role: "user",
    } as never);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 422 when title is missing", async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: "admin-1",
      role: "admin",
    } as never);
    const { title: _t, ...noTitle } = validBody;
    const res = await POST(makeRequest(noTitle));
    expect(res.status).toBe(422);
  });

  it("returns 422 when game is missing", async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: "admin-1",
      role: "admin",
    } as never);
    const { game: _g, ...noGame } = validBody;
    const res = await POST(makeRequest(noGame));
    expect(res.status).toBe(422);
  });

  it("returns 422 when author is missing", async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: "admin-1",
      role: "admin",
    } as never);
    const { author: _a, ...noAuthor } = validBody;
    const res = await POST(makeRequest(noAuthor));
    expect(res.status).toBe(422);
  });

  it("returns 422 when guideType is an invalid value", async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: "admin-1",
      role: "admin",
    } as never);
    const res = await POST(
      makeRequest({ ...validBody, guideType: "not_a_real_type" })
    );
    expect(res.status).toBe(422);
  });

  it("creates a draft RagSource and returns 201 with sourceId", async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: "admin-1",
      role: "admin",
    } as never);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    const body = await res.json() as { sourceId: string; status: string };
    expect(body.sourceId).toBe("new-source-id");
    expect(body.status).toBe("draft");
    expect(RagSourceModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Elden Ring Boss Guide",
        sourceType: "text",
        status: "draft",
        metadata: expect.objectContaining({
          game: "Elden Ring",
          guideType: "boss_guide",
          author: "Fextralife",
        }),
      })
    );
  });

  it("returns 400 when request body is not valid JSON", async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: "admin-1",
      role: "admin",
    } as never);
    const req = new Request("http://localhost/api/ingest/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
