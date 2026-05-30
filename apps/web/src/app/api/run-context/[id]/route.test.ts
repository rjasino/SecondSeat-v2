import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/models/play-session.model", () => ({
  PlaySessionModel: { findById: vi.fn() },
}));
vi.mock("@/models/run-context.model", () => ({
  RunContextModel: { findById: vi.fn() },
}));

import { type NextRequest } from "next/server";
import { PUT } from "./route";
import { getSession } from "@/lib/session";
import { PlaySessionModel } from "@/models/play-session.model";
import { RunContextModel } from "@/models/run-context.model";

const VALID_OID = "507f1f77bcf86cd799439011";

const VALID_BODY = {
  gameArea: "Clock Tower",
  subArea: "3rd Floor",
  playerGoal: "progression",
  confidenceLevel: "stuck",
};

function makeRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/run-context/" + VALID_OID, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** Builds the `.select(...).lean()` chain for PlaySessionModel.findById. */
function selectLean<T>(value: T) {
  return { select: () => ({ lean: async () => value }) };
}

let saveSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  saveSpy = vi.fn().mockResolvedValue(undefined);
  vi.mocked(getSession).mockResolvedValue({ userId: "user-1", role: "user" } as never);
  vi.mocked(RunContextModel.findById).mockResolvedValue({
    _id: { toString: () => "rc-1" },
    playSessionId: "session-1",
    gameArea: "Start",
    subArea: "none",
    playerGoal: "progression",
    confidenceLevel: "uncertain",
    save: saveSpy,
  } as never);
  vi.mocked(PlaySessionModel.findById).mockReturnValue(
    selectLean({ userId: { toString: () => "user-1" } }) as never
  );
});

describe("PUT /api/run-context/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: undefined } as never);
    const res = await PUT(makeRequest(VALID_BODY), makeCtx(VALID_OID));
    expect(res.status).toBe(401);
  });

  it("returns 422 for an invalid id", async () => {
    const res = await PUT(makeRequest(VALID_BODY), makeCtx("bad-id"));
    expect(res.status).toBe(422);
  });

  it("returns 422 when subArea is missing", async () => {
    const { subArea: _omit, ...noSubArea } = VALID_BODY;
    const res = await PUT(makeRequest(noSubArea), makeCtx(VALID_OID));
    expect(res.status).toBe(422);
  });

  it("returns 404 when the run context does not exist", async () => {
    vi.mocked(RunContextModel.findById).mockResolvedValue(null as never);
    const res = await PUT(makeRequest(VALID_BODY), makeCtx(VALID_OID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the run context belongs to another user", async () => {
    vi.mocked(PlaySessionModel.findById).mockReturnValue(
      selectLean({ userId: { toString: () => "someone-else" } }) as never
    );
    const res = await PUT(makeRequest(VALID_BODY), makeCtx(VALID_OID));
    expect(res.status).toBe(404);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("updates the run context in place and returns the serialized result", async () => {
    const res = await PUT(makeRequest(VALID_BODY), makeCtx(VALID_OID));
    expect(res.status).toBe(200);
    expect(saveSpy).toHaveBeenCalledOnce();
    const body = (await res.json()) as { runContext: { gameArea: string; subArea: string } };
    expect(body.runContext.gameArea).toBe("Clock Tower");
    expect(body.runContext.subArea).toBe("3rd Floor");
  });

  it("accepts the 'none' sentinel for subArea", async () => {
    const res = await PUT(makeRequest({ ...VALID_BODY, subArea: "none" }), makeCtx(VALID_OID));
    expect(res.status).toBe(200);
  });
});
