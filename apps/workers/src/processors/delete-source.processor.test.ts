import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { DeleteSourceJobData } from "../queues/delete-source.queue.js";

vi.mock("../config/worker.config.js", () => ({
  workerConfig: {
    INGEST_UPLOAD_DIR: "/tmp/test-uploads",
  },
}));

vi.mock("fs/promises", () => ({
  rm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../models/rag-source.model.js", () => ({
  RagSourceModel: {
    findById: vi.fn(),
    findByIdAndDelete: vi.fn().mockResolvedValue(null),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("../models/rag-document.model.js", () => ({
  RagDocumentModel: {
    deleteMany: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../models/rag-ingestion-job.model.js", () => ({
  RagIngestionJobModel: {
    deleteMany: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../services/vector/chroma.client.js", () => ({
  deleteVectorsBySourceId: vi.fn().mockResolvedValue(undefined),
}));

import path from "path";
import { processDeleteSourceJob } from "./delete-source.processor.js";
import { RagSourceModel } from "../models/rag-source.model.js";
import { RagDocumentModel } from "../models/rag-document.model.js";
import { RagIngestionJobModel } from "../models/rag-ingestion-job.model.js";
import { deleteVectorsBySourceId } from "../services/vector/chroma.client.js";
import { rm } from "fs/promises";

function makeJob(
  sourceId: string,
  previousStatus: string,
  attemptsMade = 0,
  maxAttempts = 3
): Job<DeleteSourceJobData> {
  return {
    data: { sourceId, previousStatus },
    attemptsMade,
    opts: { attempts: maxAttempts },
  } as unknown as Job<DeleteSourceJobData>;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: non-file source
  vi.mocked(RagSourceModel.findById).mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({ sourceType: "text" }),
    }),
  } as never);
});

describe("processDeleteSourceJob", () => {
  it("deletes vectors, documents, jobs, and source on success", async () => {
    const job = makeJob("src-1", "completed");
    await processDeleteSourceJob(job);

    expect(deleteVectorsBySourceId).toHaveBeenCalledWith("src-1");
    expect(RagDocumentModel.deleteMany).toHaveBeenCalledWith({ sourceId: "src-1" });
    expect(RagIngestionJobModel.deleteMany).toHaveBeenCalledWith({ sourceId: "src-1" });
    expect(RagSourceModel.findByIdAndDelete).toHaveBeenCalledWith("src-1");
  });

  it("removes disk directory for file-upload sources", async () => {
    vi.mocked(RagSourceModel.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ sourceType: "file" }),
      }),
    } as never);

    const job = makeJob("src-file", "completed");
    await processDeleteSourceJob(job);

    expect(rm).toHaveBeenCalledWith(
      path.join("/tmp/test-uploads", "src-file"),
      { recursive: true, force: true }
    );
  });

  it("does not attempt disk cleanup for non-file sources", async () => {
    const job = makeJob("src-text", "completed");
    await processDeleteSourceJob(job);
    expect(rm).not.toHaveBeenCalled();
  });

  it("completes successfully even when disk cleanup fails", async () => {
    vi.mocked(RagSourceModel.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ sourceType: "file" }),
      }),
    } as never);
    vi.mocked(rm).mockRejectedValue(new Error("ENOENT: no such file or directory"));

    const job = makeJob("src-gone", "completed");
    await expect(processDeleteSourceJob(job)).resolves.toBeUndefined();
    expect(RagSourceModel.findByIdAndDelete).toHaveBeenCalledWith("src-gone");
  });

  it("rethrows errors so BullMQ can retry", async () => {
    vi.mocked(deleteVectorsBySourceId).mockRejectedValue(new Error("ChromaDB unavailable"));
    const job = makeJob("src-2", "completed", 0, 3);
    await expect(processDeleteSourceJob(job)).rejects.toThrow("ChromaDB unavailable");
  });

  it("resets source status to previousStatus on the last retry attempt", async () => {
    vi.mocked(deleteVectorsBySourceId).mockRejectedValue(new Error("ChromaDB unavailable"));
    // attemptsMade = 2, maxAttempts = 3 → last attempt (index 2 of 0,1,2)
    const job = makeJob("src-3", "completed", 2, 3);

    await expect(processDeleteSourceJob(job)).rejects.toThrow();

    expect(RagSourceModel.findByIdAndUpdate).toHaveBeenCalledWith("src-3", {
      status: "completed",
      previousStatus: null,
    });
  });

  it("does NOT reset status on intermediate retry attempts", async () => {
    vi.mocked(deleteVectorsBySourceId).mockRejectedValue(new Error("ChromaDB unavailable"));
    const job = makeJob("src-4", "completed", 0, 3);

    await expect(processDeleteSourceJob(job)).rejects.toThrow();

    expect(RagSourceModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("is idempotent when ChromaDB has no vectors for the source", async () => {
    vi.mocked(deleteVectorsBySourceId).mockResolvedValue(undefined);
    const job = makeJob("src-5", "failed");
    await expect(processDeleteSourceJob(job)).resolves.toBeUndefined();
    expect(RagSourceModel.findByIdAndDelete).toHaveBeenCalledWith("src-5");
  });
});
