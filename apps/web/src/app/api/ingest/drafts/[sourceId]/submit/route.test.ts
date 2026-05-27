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
  },
}));

vi.mock("@/lib/ingest/ingest.service", () => ({
  enqueueSourceForIngestion: vi.fn(),
}));

import { POST } from "./route";
import { getSession } from "@/lib/session";
import { RagSourceModel } from "@/models/rag-source.model";
import { enqueueSourceForIngestion } from "@/lib/ingest/ingest.service";

function makeParams(sourceId: string) {
  return { params: Promise.resolve({ sourceId }) };
}

function makeRequest(): Request {
  return new Request(
    "http://localhost/api/ingest/drafts/source-abc/submit",
    { method: "POST" }
  );
}

const adminSession = { userId: "admin-1", role: "admin" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(adminSession as never);
  vi.mocked(enqueueSourceForIngestion).mockResolvedValue({
    jobId: "job-123",
    queueJobUuid: "uuid-456",
  });
});

describe("POST /api/ingest/drafts/[sourceId]/submit", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: undefined } as never);
    const res = await POST(makeRequest(), makeParams("source-abc"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as non-admin", async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: "user-1",
      role: "user",
    } as never);
    const res = await POST(makeRequest(), makeParams("source-abc"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when source does not exist", async () => {
    vi.mocked(RagSourceModel.findById).mockResolvedValue(null);
    const res = await POST(makeRequest(), makeParams("source-abc"));
    expect(res.status).toBe(404);
  });

  it("returns 409 when source is not in draft status", async () => {
    vi.mocked(RagSourceModel.findById).mockResolvedValue({
      status: "queued",
      title: "Test",
      content: "some content",
    } as never);
    const res = await POST(makeRequest(), makeParams("source-abc"));
    expect(res.status).toBe(409);
  });

  it("returns 422 when draft has no title", async () => {
    vi.mocked(RagSourceModel.findById).mockResolvedValue({
      status: "draft",
      title: "   ",
      content: "some content",
    } as never);
    const res = await POST(makeRequest(), makeParams("source-abc"));
    expect(res.status).toBe(422);
  });

  it("returns 422 when draft has no content", async () => {
    vi.mocked(RagSourceModel.findById).mockResolvedValue({
      status: "draft",
      title: "My Guide",
      content: "",
    } as never);
    const res = await POST(makeRequest(), makeParams("source-abc"));
    expect(res.status).toBe(422);
  });

  it("enqueues the source and returns 200 with jobId and queued status", async () => {
    vi.mocked(RagSourceModel.findById).mockResolvedValue({
      status: "draft",
      title: "My Guide",
      content: "## Section\n\nActual content here.",
    } as never);

    const res = await POST(makeRequest(), makeParams("source-abc"));
    expect(res.status).toBe(200);

    const body = await res.json() as {
      sourceId: string;
      jobId: string;
      status: string;
    };
    expect(body.sourceId).toBe("source-abc");
    expect(body.jobId).toBe("job-123");
    expect(body.status).toBe("queued");
    expect(enqueueSourceForIngestion).toHaveBeenCalledWith("source-abc");
  });

  it("returns 503 when the queue is unavailable", async () => {
    vi.mocked(RagSourceModel.findById).mockResolvedValue({
      status: "draft",
      title: "My Guide",
      content: "## Section\n\nContent.",
    } as never);
    vi.mocked(enqueueSourceForIngestion).mockRejectedValue(
      new Error("Redis down")
    );

    const res = await POST(makeRequest(), makeParams("source-abc"));
    expect(res.status).toBe(503);
  });
});
