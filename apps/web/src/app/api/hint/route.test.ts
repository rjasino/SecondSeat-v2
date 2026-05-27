import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  config: {
    INFERENCE_URL: "http://inference-mock:3001",
    INFERENCE_SERVICE_SECRET: "test-secret",
  },
}));

import { type NextRequest } from "next/server";
import { POST } from "./route";
import { getSession } from "@/lib/session";

const VALID_OID = "aabbccddeeff001122334455";
const VALID_BODY = {
  playSessionId: VALID_OID,
  runContextId: VALID_OID,
  gameId: VALID_OID,
  gameArea: "Hyrule Field",
  chapter: "Chapter 3",
  playerGoal: "progression",
  confidenceLevel: "uncertain",
  text: "How do I get past the locked gate?",
};

function makeRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/hint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const mockSession = {
  userId: "user-123",
  role: "author",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(mockSession as never);
});

describe("POST /api/hint", () => {
  it("returns 401 when the session has no userId", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: undefined } as never);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 422 when the request body fails schema validation", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, gameId: "not-an-oid" }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; details: unknown[] };
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.details).toBeInstanceOf(Array);
  });

  it("returns 422 when text is missing", async () => {
    const { text: _omit, ...noText } = VALID_BODY;
    const res = await POST(makeRequest(noText));
    expect(res.status).toBe(422);
  });

  it("returns 422 when gameArea is missing", async () => {
    const { gameArea: _omit, ...noArea } = VALID_BODY;
    const res = await POST(makeRequest(noArea));
    expect(res.status).toBe(422);
  });

  it("returns 400 for a non-JSON body", async () => {
    const req = new Request("http://localhost/api/hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not{json",
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 502 when the inference service is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Connection refused"))
    );
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Inference service unreachable");
    vi.unstubAllGlobals();
  });

  it("returns 502 when the inference service responds with a non-2xx status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
      )
    );
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(502);
    vi.unstubAllGlobals();
  });

  it("forwards the X-Inference-Secret header to the upstream service", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(new ReadableStream(), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    await POST(makeRequest(VALID_BODY));

    expect(mockFetch).toHaveBeenCalledWith(
      "http://inference-mock:3001/api/v1/generate",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Inference-Secret": "test-secret",
        }),
      })
    );
    vi.unstubAllGlobals();
  });

  it("streams the inference SSE response back with the correct content-type", async () => {
    const sseBody = 'data: {"token":"hello"}\n\nevent: done\ndata: {"lineCount":1,"refused":false,"refusalReason":null}\n\n';
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(sseBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        })
      )
    );

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    vi.unstubAllGlobals();
  });

  it("passes subArea in the forwarded body when present", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(new ReadableStream(), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    await POST(makeRequest({ ...VALID_BODY, subArea: "Inner Keep" }));

    const [, callOpts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const forwarded = JSON.parse(callOpts.body as string) as Record<string, unknown>;
    expect(forwarded.subArea).toBe("Inner Keep");
    vi.unstubAllGlobals();
  });
});
