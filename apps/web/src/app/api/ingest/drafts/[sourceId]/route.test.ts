import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/models/rag-source.model", () => ({
  RagSourceModel: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
    findByIdAndDelete: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@/models/rag-ingestion-job.model", () => ({
  RagIngestionJobModel: {
    deleteMany: vi.fn().mockResolvedValue(undefined),
  },
}));

import { DELETE, PUT } from "./route";
import { getSession } from "@/lib/session";
import { RagSourceModel } from "@/models/rag-source.model";
import { RagIngestionJobModel } from "@/models/rag-ingestion-job.model";

function makeParams(sourceId: string) {
  return { params: Promise.resolve({ sourceId }) };
}

function makeDeleteRequest(): Request {
  return new Request("http://localhost/api/ingest/drafts/source-abc", {
    method: "DELETE",
  });
}

function makePutRequest(body: unknown): Request {
  return new Request("http://localhost/api/ingest/drafts/source-abc", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const adminSession = { userId: "admin-1", role: "admin" };

const draftSource = {
  status: "draft",
  content: "existing content",
  metadata: { game: "Elden Ring", author: "Fextralife" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(adminSession as never);
  vi.mocked(RagSourceModel.findById).mockResolvedValue(draftSource as never);
  vi.mocked(RagSourceModel.findByIdAndDelete).mockResolvedValue(null);
});

// ─── DELETE ──────────────────────────────────────────────────────────────────

describe("DELETE /api/ingest/drafts/[sourceId]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: undefined } as never);
    const res = await DELETE(makeDeleteRequest(), makeParams("source-abc"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as non-admin", async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: "user-1",
      role: "user",
    } as never);
    const res = await DELETE(makeDeleteRequest(), makeParams("source-abc"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when source does not exist", async () => {
    vi.mocked(RagSourceModel.findById).mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest(), makeParams("source-abc"));
    expect(res.status).toBe(404);
  });

  it("returns 409 when source is not a draft", async () => {
    vi.mocked(RagSourceModel.findById).mockResolvedValue({
      status: "completed",
    } as never);
    const res = await DELETE(makeDeleteRequest(), makeParams("source-abc"));
    expect(res.status).toBe(409);
  });

  it("hard-deletes draft and returns 204", async () => {
    const res = await DELETE(makeDeleteRequest(), makeParams("source-abc"));
    expect(res.status).toBe(204);
    expect(RagIngestionJobModel.deleteMany).toHaveBeenCalledWith({
      sourceId: "source-abc",
    });
    expect(RagSourceModel.findByIdAndDelete).toHaveBeenCalledWith("source-abc");
  });
});

// ─── PUT ─────────────────────────────────────────────────────────────────────

describe("PUT /api/ingest/drafts/[sourceId]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: undefined } as never);
    const res = await PUT(
      makePutRequest({ title: "New Title" }),
      makeParams("source-abc"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when source does not exist", async () => {
    vi.mocked(RagSourceModel.findById).mockResolvedValue(null);
    const res = await PUT(
      makePutRequest({ title: "New Title" }),
      makeParams("source-abc"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when source is not a draft", async () => {
    vi.mocked(RagSourceModel.findById).mockResolvedValue({
      status: "completed",
    } as never);
    const res = await PUT(
      makePutRequest({ title: "New Title" }),
      makeParams("source-abc"),
    );
    expect(res.status).toBe(409);
  });

  it("returns 200 and persists title and content updates for a valid draft", async () => {
    const res = await PUT(
      makePutRequest({ title: "Updated Title", content: "New content here." }),
      makeParams("source-abc"),
    );
    expect(res.status).toBe(200);
    expect(RagSourceModel.findByIdAndUpdate).toHaveBeenCalledWith(
      "source-abc",
      expect.objectContaining({
        $set: expect.objectContaining({ title: "Updated Title" }),
      }),
    );
  });

  it("does not update metadata.author even if passed in the body", async () => {
    await PUT(
      makePutRequest({ title: "T", author: "ShouldBeIgnored" }),
      makeParams("source-abc"),
    );
    const callArg = vi.mocked(RagSourceModel.findByIdAndUpdate).mock
      .calls[0]?.[1] as {
      $set: Record<string, unknown>;
    };
    expect(callArg.$set).not.toHaveProperty("metadata.author");
  });
});
