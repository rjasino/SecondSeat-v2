import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/config", () => ({
  config: {
    GAME_ID: "default",
    REDIS_URL: "redis://localhost:6379",
    INGEST_QUEUE_NAME: "ingestion",
  },
}));

vi.mock("@/models/rag-source.model", () => ({
  RagSourceModel: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
    findOne: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@/models/rag-ingestion-job.model", () => ({
  RagIngestionJobModel: {
    create: vi.fn(),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@/lib/queue/ingest-queue", () => ({
  enqueueIngestionJob: vi.fn(),
}));

import { enqueueSourceForIngestion } from "./ingest.service";
import { RagSourceModel } from "@/models/rag-source.model";
import { RagIngestionJobModel } from "@/models/rag-ingestion-job.model";
import { enqueueIngestionJob } from "@/lib/queue/ingest-queue";

const mockJobDoc = { _id: { toString: () => "job-doc-id-123" } };

function mockSourceWithMeta(meta: Record<string, unknown> | undefined) {
  vi.mocked(RagSourceModel.findById).mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(meta !== undefined ? { metadata: meta } : null),
    }),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(RagIngestionJobModel.create).mockResolvedValue(mockJobDoc as never);
  vi.mocked(enqueueIngestionJob).mockResolvedValue("queue-uuid-456");
  mockSourceWithMeta({ game: "Elden Ring", author: "Fextralife" });
});

describe("enqueueSourceForIngestion", () => {
  it("creates a job document, enqueues a BullMQ job, and returns the jobId", async () => {
    const result = await enqueueSourceForIngestion("source-abc");

    expect(RagIngestionJobModel.create).toHaveBeenCalledWith({
      sourceId: "source-abc",
      status: "queued",
    });
    expect(enqueueIngestionJob).toHaveBeenCalledWith(
      "source-abc",
      "job-doc-id-123",
      "Elden Ring",
      "Fextralife"
    );
    expect(RagIngestionJobModel.findByIdAndUpdate).toHaveBeenCalledWith(
      mockJobDoc._id,
      { queueJobUuid: "queue-uuid-456" }
    );
    expect(RagSourceModel.findByIdAndUpdate).toHaveBeenCalledWith(
      "source-abc",
      { status: "queued" }
    );
    expect(result).toEqual({
      jobId: "job-doc-id-123",
      queueJobUuid: "queue-uuid-456",
    });
  });

  it("falls back to config.GAME_ID when source has no metadata.game", async () => {
    mockSourceWithMeta({ author: "Fextralife" });
    await enqueueSourceForIngestion("source-abc");
    expect(enqueueIngestionJob).toHaveBeenCalledWith(
      "source-abc",
      "job-doc-id-123",
      "default",
      "Fextralife"
    );
  });

  it("uses empty string author when source has no metadata.author", async () => {
    mockSourceWithMeta({ game: "Elden Ring" });
    await enqueueSourceForIngestion("source-abc");
    expect(enqueueIngestionJob).toHaveBeenCalledWith(
      "source-abc",
      "job-doc-id-123",
      "Elden Ring",
      ""
    );
  });

  it("marks source and job as failed when queue enqueue throws, then rethrows", async () => {
    const queueError = new Error("Redis connection refused");
    vi.mocked(enqueueIngestionJob).mockRejectedValue(queueError);

    await expect(enqueueSourceForIngestion("source-abc")).rejects.toThrow(
      "Redis connection refused"
    );

    expect(RagSourceModel.findByIdAndUpdate).toHaveBeenCalledWith(
      "source-abc",
      { status: "failed" }
    );
    expect(RagIngestionJobModel.findByIdAndUpdate).toHaveBeenCalledWith(
      mockJobDoc._id,
      { status: "failed", error: "Redis connection refused" }
    );
  });

  it("truncates error message to 1024 chars when queue fails with a long error", async () => {
    const longMessage = "x".repeat(2000);
    vi.mocked(enqueueIngestionJob).mockRejectedValue(new Error(longMessage));

    await expect(enqueueSourceForIngestion("source-abc")).rejects.toThrow();

    const call = vi.mocked(RagIngestionJobModel.findByIdAndUpdate).mock.calls[0];
    const update = call?.[1] as { error: string };
    expect(update.error.length).toBe(1024);
  });

  it("uses 'queue_enqueue_failed' when the thrown value is not an Error instance", async () => {
    vi.mocked(enqueueIngestionJob).mockRejectedValue("string error");

    await expect(enqueueSourceForIngestion("source-abc")).rejects.toBe(
      "string error"
    );

    const call = vi.mocked(RagIngestionJobModel.findByIdAndUpdate).mock.calls[0];
    const update = call?.[1] as { error: string };
    expect(update.error).toBe("queue_enqueue_failed");
  });
});
