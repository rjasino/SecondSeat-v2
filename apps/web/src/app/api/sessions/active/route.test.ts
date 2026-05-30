import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/models/play-session.model", () => ({
  PlaySessionModel: { findOne: vi.fn() },
}));
vi.mock("@/models/run-context.model", () => ({
  RunContextModel: { findOne: vi.fn() },
}));

import { NextRequest } from "next/server";
import { GET } from "./route";
import { getSession } from "@/lib/session";
import { PlaySessionModel } from "@/models/play-session.model";
import { RunContextModel } from "@/models/run-context.model";

const VALID_OID = "507f1f77bcf86cd799439011";

/** Builds the `.sort(...).lean()` chain Mongoose query methods expect. */
function sortLean<T>(value: T) {
  return { sort: () => ({ lean: async () => value }) };
}

function makeRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/sessions/active${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ userId: "user-1", role: "user" } as never);
  vi.mocked(PlaySessionModel.findOne).mockReturnValue(
    sortLean({ _id: { toString: () => "session-1" } }) as never
  );
  vi.mocked(RunContextModel.findOne).mockReturnValue(
    sortLean({
      _id: { toString: () => "rc-1" },
      gameArea: "Clock Tower",
      subArea: "3rd Floor",
      playerGoal: "progression",
      confidenceLevel: "stuck",
    }) as never
  );
});

describe("GET /api/sessions/active", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: undefined } as never);
    const res = await GET(makeRequest(`?gameId=${VALID_OID}`));
    expect(res.status).toBe(401);
  });

  it("returns 422 when gameId is missing or invalid", async () => {
    expect((await GET(makeRequest(""))).status).toBe(422);
    expect((await GET(makeRequest("?gameId=bad"))).status).toBe(422);
  });

  it("returns 404 when there is no active session", async () => {
    vi.mocked(PlaySessionModel.findOne).mockReturnValue(sortLean(null) as never);
    const res = await GET(makeRequest(`?gameId=${VALID_OID}`));
    expect(res.status).toBe(404);
  });

  it("returns the active session and prefilled run context", async () => {
    const res = await GET(makeRequest(`?gameId=${VALID_OID}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      playSessionId: string;
      runContext: { id: string; gameArea: string; subArea: string };
    };
    expect(body.playSessionId).toBe("session-1");
    expect(body.runContext.gameArea).toBe("Clock Tower");
    expect(body.runContext.subArea).toBe("3rd Floor");
  });

  it("scopes the session query to the authed user", async () => {
    await GET(makeRequest(`?gameId=${VALID_OID}`));
    expect(PlaySessionModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", gameId: VALID_OID, isActive: true })
    );
  });
});
