import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/models/play-session.model", () => ({
  PlaySessionModel: { updateMany: vi.fn(), create: vi.fn() },
}));
vi.mock("@/models/run-context.model", () => ({
  RunContextModel: { create: vi.fn() },
}));

import { type NextRequest } from "next/server";
import { POST } from "./route";
import { getSession } from "@/lib/session";
import { PlaySessionModel } from "@/models/play-session.model";
import { RunContextModel } from "@/models/run-context.model";

const VALID_OID = "507f1f77bcf86cd799439011";

function makeRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ userId: "user-1", role: "user" } as never);
  vi.mocked(PlaySessionModel.updateMany).mockResolvedValue({} as never);
  vi.mocked(PlaySessionModel.create).mockResolvedValue({
    _id: { toString: () => "session-1" },
  } as never);
  vi.mocked(RunContextModel.create).mockResolvedValue({
    _id: { toString: () => "rc-1" },
    gameArea: "Start",
    subArea: "none",
    playerGoal: "progression",
    confidenceLevel: "uncertain",
  } as never);
});

describe("POST /api/sessions", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: undefined } as never);
    const res = await POST(makeRequest({ gameId: VALID_OID }));
    expect(res.status).toBe(401);
  });

  it("returns 422 for an invalid gameId", async () => {
    const res = await POST(makeRequest({ gameId: "not-an-oid" }));
    expect(res.status).toBe(422);
  });

  it("closes prior active sessions for the same user+game", async () => {
    await POST(makeRequest({ gameId: VALID_OID }));
    expect(PlaySessionModel.updateMany).toHaveBeenCalledWith(
      { userId: "user-1", gameId: VALID_OID, isActive: true },
      expect.objectContaining({ isActive: false })
    );
  });

  it("creates a session + start-of-game run context and returns 201 with both ids", async () => {
    const res = await POST(makeRequest({ gameId: VALID_OID }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      playSessionId: string;
      runContext: { id: string; subArea: string };
    };
    expect(body.playSessionId).toBe("session-1");
    expect(body.runContext.id).toBe("rc-1");
    expect(body.runContext.subArea).toBe("none");
    expect(RunContextModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ gameArea: "Start", subArea: "none" })
    );
  });
});
